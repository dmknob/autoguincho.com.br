const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getCityBySlug, getListingsWithDetailsByCity, getListingBySlug, getActiveCities, getStates, getStateByUf, getCitiesByState } = require('../controllers/listingsController');

// Helper to set Cache-Control as per .env
const setCacheHeader = (res) => {
    // Only cache if in production to ease dev work
    if (process.env.NODE_ENV === 'production') {
        const ttl = process.env.CACHE_TTL_REGIONAL || 86400;
        res.set('Cache-Control', `public, max-age=${ttl}`);
    } else {
        res.set('Cache-Control', 'no-store');
    }
};

// ==========================================
// Nível 1: Home
// ==========================================
router.get('/', (req, res) => {
    setCacheHeader(res);
    // Future: we might want to pass featured listings or count
    res.render('pages/home', { 
        title: 'Auto Guincho - Encontre um Guincho Imediatamente', 
        description: 'Encontre prestadores de serviços automotivos, guinchos, muncks e mais em sua região.',
        currentPath: req.originalUrl
    });
});

// ==========================================
// Rota de Página Legal
// ==========================================
router.get('/politica-de-privacidade', (req, res) => {
    setCacheHeader(res);
    // LGPD Compliance defined in specs.md and 08-lgpd
    res.render('pages/politica-de-privacidade', {
        title: 'Política de Privacidade | Auto Guincho',
        NOME_PROJETO: 'Auto Guincho',
        NOME_EMPRESA: 'Corpo Digital',
        currentPath: req.originalUrl
    });
});

router.get('/termos', (req, res) => {
    setCacheHeader(res);
    res.render('pages/termos-de-uso', {
        title: 'Termos de Uso | Auto Guincho',
        currentPath: req.originalUrl
    });
});

// ==========================================
// Validação de Analytics (Provisório)
// ==========================================
router.get('/estatisticas', (req, res) => {
    // A simple endpoint to validate that click interactions are being captured
    res.set('Cache-Control', 'no-store'); // Never cache stats
    
    const stats = db.prepare(`
        SELECT l.company_name, a.event_label, count(*) as clicks
        FROM analytics_events a
        JOIN listings l ON a.entity_id = l.id
        WHERE a.entity_type = 'listing'
        GROUP BY l.company_name, a.event_label
        ORDER BY clicks DESC
    `).all();

    res.render('pages/estatisticas', {
        title: 'Estatísticas | Auto Guincho',
        currentPath: req.originalUrl,
        stats
    });
});

// ==========================================
// Página de Inserção (Desligada no MVP)
// ==========================================
router.get('/quero-ser-parceiro', (req, res) => {
    setCacheHeader(res);
    res.render('pages/join', { 
        title: 'Seja Parceiro | Auto Guincho',
        whatsappContact: process.env.WHATSAPP_CONTACT || '5551993668728',
        currentPath: req.originalUrl
    });
});


// ==========================================
// Diretório: Lista de Estados
// ==========================================
router.get('/estados', (req, res) => {
    const states = getStates();
    setCacheHeader(res);
    res.render('pages/states-list', {
        title: 'Estados Atendidos | Auto Guincho',
        description: 'Encontre serviços de guincho e socorro automotivo divididos por estado.',
        currentPath: req.originalUrl,
        states
    });
});

// ==========================================
// Diretório: Lista de Cidades por Estado (/rs)
// ==========================================
router.get('/:uf', (req, res, next) => {
    const { uf } = req.params;
    
    // To prevent catching other top-level routes, check if it's exactly 2 letters
    if (uf.length !== 2) return next();

    const state = getStateByUf(uf);
    if (!state) return next();

    const cities = getCitiesByState(uf);

    setCacheHeader(res);
    res.render('pages/cities-list', {
        title: `Cidades Atendidas em ${state.name} | Auto Guincho`,
        description: `Encontre serviços de guincho e socorro automotivo nas cidades do estado de ${state.name}.`,
        currentPath: req.originalUrl,
        state,
        cities
    });
});

// ==========================================
// Nível 2: Lista Regional (Silo) -> Ex: /rs/novo-hamburgo
// ==========================================
router.get('/:uf/:city', (req, res, next) => {
    const { uf, city } = req.params;
    const userLat = req.query.lat ? parseFloat(req.query.lat) : null;
    const userLon = req.query.lon ? parseFloat(req.query.lon) : null;

    let cityData = getCityBySlug(uf, city);
    let listings = [];

    if (!cityData) {
        // Fallback for unseeded cities to show a friendly 0 results page instead of 404
        const formattedName = city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        cityData = {
            name: formattedName,
            uf: uf.toUpperCase(),
            slug: city,
            id: null
        };
    } else {
        listings = getListingsWithDetailsByCity(cityData.id, userLat, userLon);
    }
    
    // Always fetch popular/active cities in the state for fallback routing
    const popularCities = getActiveCities(uf, 6);

    const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "itemListElement": [
        ${listings.map((l, index) => `{
          "@type": "ListItem",
          "position": ${index + 1},
          "item": {
            "@type": "ProfessionalService",
            "name": "${l.company_name}",
            "url": "https://autoguincho.com.br/${cityData.uf.toLowerCase()}/${cityData.slug}/${l.slug}"
          }
        }`).join(',')}
      ]
    }
    </script>
    `;

    setCacheHeader(res);
    res.render('pages/regional-list', {
        title: `Guinchos em ${cityData.name} - ${cityData.uf.toUpperCase()}`,
        description: `Lista de guinchos, muncks e serviços 24 horas em ${cityData.name}. Contato direto por WhatsApp.`,
        currentPath: req.originalUrl,
        jsonLd,
        city: cityData,
        listings,
        popularCities,
        userLat,
        userLon
    });
});

// ==========================================
// Nível 3: Página do Parceiro -> Ex: /rs/novo-hamburgo/jj-guinchos-rapidos
// ==========================================
router.get('/:uf/:city/:partnerSlug', (req, res, next) => {
    const { uf, city, partnerSlug } = req.params;

    const cityData = getCityBySlug(uf, city);
    if (!cityData) return next();

    const listing = getListingBySlug(partnerSlug);
    if (!listing || listing.city_id !== cityData.id) return next();

    const imageUrl = listing.images && listing.images.length > 0 ? listing.images[0].image_url : '/img/og-image.jpg';
    
    const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      "name": "${listing.company_name}",
      "image": "https://autoguincho.com.br${imageUrl}",
      "telephone": "${listing.whatsapp_number}",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "${cityData.name}",
        "addressRegion": "${cityData.uf.toUpperCase()}",
        "addressCountry": "BR"
      }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [{
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://autoguincho.com.br"
      },{
        "@type": "ListItem",
        "position": 2,
        "name": "${cityData.name}",
        "item": "https://autoguincho.com.br/${cityData.uf.toLowerCase()}/${cityData.slug}"
      },{
        "@type": "ListItem",
        "position": 3,
        "name": "${listing.company_name}"
      }]
    }
    </script>
    `;

    setCacheHeader(res);
    res.render('pages/partner-profile', {
        title: `${listing.company_name} em ${cityData.name} | Auto Guincho`,
        description: `Contato direto via WhatsApp para ${listing.company_name}. Confira as especialidades.`,
        currentPath: req.originalUrl,
        jsonLd,
        city: cityData,
        listing
    });
});

module.exports = router;

