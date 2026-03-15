const db = require('../models/db');

// Formula de Haversine em SQL não é suportada nativamente pelo SQLite padrão,
// então a distância e ordenação por proximidade precisa ser feita no Node.js
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

const getListingsWithDetailsByCity = (cityId, userLat = null, userLon = null) => {
    // 1. Get raw listings
    const stmt = db.prepare(`
        SELECT l.*, c.name as city_name, c.slug as city_slug, s.uf as state_uf
        FROM listings l
        JOIN cities c ON l.city_id = c.id
        JOIN states s ON c.state_id = s.id
        WHERE l.city_id = ? AND l.is_active = 1
    `);
    
    let listings = stmt.all(cityId);

    if (listings.length === 0) return [];

    // 2. Fetch tags and images for these listings
    const listingIds = listings.map(l => l.id).join(',');
    
    // tags
    const tagsStmt = db.prepare(`
        SELECT lt.listing_id, t.name, t.slug, t.icon_class
        FROM listing_tags lt
        JOIN tags t ON lt.tag_id = t.id
        WHERE lt.listing_id IN (${listingIds})
    `);
    const allTags = tagsStmt.all();

    // images
    const imagesStmt = db.prepare(`
        SELECT listing_id, image_url, display_order, is_primary
        FROM listing_images
        WHERE listing_id IN (${listingIds})
        ORDER BY display_order ASC
    `);
    const allImages = imagesStmt.all();

    // 3. Assemble the objects
    listings = listings.map(listing => {
        listing.tags = allTags.filter(t => t.listing_id === listing.id);
        listing.images = allImages.filter(i => i.listing_id === listing.id);
        
        // Se tiver lat/long, calcular (assumindo que mockamos a lat/long na tabela listings se necessário, 
        // ou se não mockamos, mantemos aleatório). Para v1, o banco não tem lat/long nos parceiros ainda.
        // Simulando a base para a lógica Haversine:
        if (userLat && userLon && listing.latitude && listing.longitude) {
            listing.distance = calculateDistance(userLat, userLon, listing.latitude, listing.longitude);
        } else {
            listing.distance = null;
        }

        return listing;
    });

    // 4. Sort logic (Featured first -> Random -> Basic Random)
    if (userLat && userLon) {
        // Sort by distance if GPS is available
        listings.sort((a, b) => {
            if (a.is_featured !== b.is_featured) return b.is_featured - a.is_featured;
            if (a.distance && b.distance) return a.distance - b.distance;
            return 0; // fallback to stable
        });
    } else {
        // Shuffle everything non-featured
        const featured = listings.filter(l => l.is_featured);
        const normal = listings.filter(l => !l.is_featured);
        
        // Randomize normal
        for (let i = normal.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [normal[i], normal[j]] = [normal[j], normal[i]];
        }
        
        listings = [...featured, ...normal];
    }

    return listings;
};

const getCityBySlug = (stateUf, citySlug) => {
    return db.prepare(`
        SELECT c.*, s.uf, s.name as state_name
        FROM cities c
        JOIN states s ON c.state_id = s.id
        WHERE c.slug = ? AND s.uf = ?
    `).get(citySlug, stateUf.toUpperCase());
};

const getListingBySlug = (slug) => {
    const listing = db.prepare(`
        SELECT l.*, c.name as city_name, c.slug as city_slug, s.uf as state_uf
        FROM listings l
        JOIN cities c ON l.city_id = c.id
        JOIN states s ON c.state_id = s.id
        WHERE l.slug = ? AND l.is_active = 1
    `).get(slug);

    if (!listing) return null;

    listing.tags = db.prepare(`
        SELECT t.name, t.slug, t.icon_class
        FROM listing_tags lt
        JOIN tags t ON lt.tag_id = t.id
        WHERE lt.listing_id = ?
    `).all(listing.id);

    listing.images = db.prepare(`
        SELECT image_url, display_order, is_primary
        FROM listing_images
        WHERE listing_id = ?
        ORDER BY display_order ASC
    `).all(listing.id);

    return listing;
};

const getActiveCities = (stateUf = null, limit = 6) => {
    let query = `
        SELECT c.name, c.slug, s.uf, COUNT(l.id) as provider_count
        FROM cities c
        JOIN states s ON c.state_id = s.id
        JOIN listings l ON l.city_id = c.id
        WHERE l.is_active = 1
    `;
    const params = [];
    
    if (stateUf) {
        query += ` AND s.uf = ?`;
        params.push(stateUf.toUpperCase());
    }
    
    query += ` GROUP BY c.id ORDER BY provider_count DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params);
};

const getStates = () => {
    return db.prepare(`
        SELECT s.*, count(c.id) as city_count
        FROM states s
        LEFT JOIN cities c ON c.state_id = s.id AND c.is_published = 1
        GROUP BY s.id
        ORDER BY s.name ASC
    `).all();
};

const getStateByUf = (uf) => {
    return db.prepare(`SELECT * FROM states WHERE uf = ?`).get(uf.toUpperCase());
};

const getCitiesByState = (uf) => {
    return db.prepare(`
        SELECT c.*, s.uf, count(l.id) as provider_count
        FROM cities c
        JOIN states s ON c.state_id = s.id
        LEFT JOIN listings l ON l.city_id = c.id AND l.is_active = 1
        WHERE s.uf = ? AND c.is_published = 1
        GROUP BY c.id
        ORDER BY c.name ASC
    `).all(uf.toUpperCase());
};

const getNearestPublishedCity = (lat, lon) => {
    const publishedCities = db.prepare(`
        SELECT c.*, s.uf 
        FROM cities c 
        JOIN states s ON c.state_id = s.id 
        WHERE c.is_published = 1
    `).all();

    if (publishedCities.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const city of publishedCities) {
        if (city.latitude && city.longitude) {
            const dist = calculateDistance(lat, lon, city.latitude, city.longitude);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = city;
            }
        }
    }

    return nearest;
};

module.exports = {
    getListingsWithDetailsByCity,
    getCityBySlug,
    getListingBySlug,
    getActiveCities,
    getStates,
    getStateByUf,
    getCitiesByState,
    getNearestPublishedCity
};
