const express = require('express');
const router = express.Router();
const db = require('../database');
const { exec } = require('child_process');
const path = require('path');
const plans = require('../config/plans');

// --- LOGIN ---
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect('/admin');
    res.render('admin/login', { layout: false, error: null });
});

router.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminPass) {
        console.error('[Admin] ERRO: ADMIN_PASSWORD não está definido no .env!');
    }

    if (password === adminPass) {
        console.log('[Admin] Login bem-sucedido.');
        req.session.isAdmin = true;
        
        // Cookie público para o frontend saber que é admin e não trackear (Analytics)
        res.cookie('ag_admin', '1', { maxAge: 1000 * 60 * 60 * 24, httpOnly: false });
        
        res.redirect('/admin');
    } else {
        console.warn(`[Admin] Falha de login. Tentativa com: "${password ? '********' : 'vazio'}"`);
        res.render('admin/login', { layout: false, error: 'Senha incorreta' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.clearCookie('ag_admin');
    res.redirect('/');
});

// --- DASHBOARD ---
router.get('/', (req, res) => {
    const { q, category_id, city_id } = req.query;
    let query = `
        SELECT DISTINCT l.id, l.company_name, l.slug, l.plan_level, l.last_renewal_date, l.is_active,
               (SELECT COUNT(*) FROM analytics_events WHERE entity_type='listing' AND entity_id=l.id AND event_type='page_view') as page_views,
               (SELECT COUNT(*) FROM analytics_events WHERE entity_type='listing' AND entity_id=l.id AND event_type='cta_click') as leads_gerados
        FROM listings l 
    `;
    let params = [];
    let conditions = [];

    if (category_id) {
        query += ` JOIN category_listings cl ON l.id = cl.listing_id `;
        conditions.push(`cl.category_id = ?`);
        params.push(category_id);
    }

    if (city_id) {
        query += ` JOIN listing_service_cities lsc ON l.id = lsc.listing_id `;
        conditions.push(`lsc.city_ibge_id = ?`);
        params.push(city_id);
    }

    if (q) {
        conditions.push(`l.company_name LIKE ?`);
        params.push(`%${q}%`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY l.company_name ASC `;

    const listings = db.prepare(query).all(...params);

    // Dados para os filtros
    const categories = db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all();
    const citiesServiced = db.prepare(`
        SELECT DISTINCT c.ibge_id, c.name, c.state_uf 
        FROM cities c 
        JOIN listing_service_cities lsc ON c.ibge_id = lsc.city_ibge_id 
        ORDER BY c.name ASC
    `).all();

    // Contar cidades sujas para ver no botão de Rebuild
    const dirtyCount = db.prepare('SELECT COUNT(*) as count FROM cities WHERE is_dirty = 1').get().count;

    // Cidades Mais buscadas (Buscas)
    const topCities = db.prepare(`
        SELECT event_label as city_name, COUNT(*) as searches 
        FROM analytics_events 
        WHERE event_type = 'search' AND event_label IS NOT NULL 
        GROUP BY event_label 
        ORDER BY searches DESC 
        LIMIT 5
    `).all();

    res.render('admin/dashboard', {
        title: 'Dashboard - Auto Guincho',
        listings,
        categories,
        citiesServiced,
        dirtyCount,
        topCities,
        filters: { q, category_id, city_id }
    });
});

// --- REBUILD (GATILHO SSG) ---
router.post('/action/rebuild', (req, res) => {
    // Dispara script de build
    const scriptPath = path.join(__dirname, '../../scripts/build-ssg.js');

    console.log('[Admin] Iniciando Rebuild Manual...');
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Build Error]: ${error}`);
            return res.status(500).send('Erro na geração estática. Veja os logs.');
        }
        res.redirect('/admin?msg=build_success');
    });
});

// --- EDITOR DE SERVIÇOS (CRUD) ---
router.get('/partner/new', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.render('admin/editor', {
        title: 'Novo Parceiro - Auto Guincho',
        partner: undefined,
        categories,
        selectedCategoryIds: [],
        selectedCities: []
    });
});

router.get('/partner/:id', (req, res) => {
    const partnerId = req.params.id;
    const partner = db.prepare('SELECT * FROM listings WHERE id = ?').get(partnerId);

    if (!partner) {
        return res.status(404).send('Parceiro não encontrado.');
    }

    const categories = db.prepare('SELECT * FROM categories').all();
    const selectedCategoryIds = db.prepare('SELECT category_id FROM category_listings WHERE listing_id = ?').all(partnerId).map(c => c.category_id);

    // Buscar cidades vinculadas
    const selectedCities = db.prepare(`
        SELECT c.ibge_id, c.name, c.state_uf 
        FROM cities c
        JOIN listing_service_cities lsc ON c.ibge_id = lsc.city_ibge_id
        WHERE lsc.listing_id = ?
    `).all(partnerId);

    res.render('admin/editor', {
        title: 'Editar Parceiro - Auto Guincho',
        partner: partner,
        categories,
        selectedCategoryIds,
        selectedCities
    });
});

router.post('/partner/save', (req, res) => {
    const { id, company_name, slug, plan_level, whatsapp_number, call_number, logo_url, maps_link, social_links, is_active, description_markdown, category_ids, city_ids, gallery_images } = req.body;

    const cleanPlanLevel = (plan_level || 'basic').trim();
    const safeSlug = slug ? slug.trim().toLowerCase() : company_name.trim().toLowerCase().replace(/\s+/g, '-');
    const safeWhatsapp = whatsapp_number ? whatsapp_number.replace(/\D/g, '') : '';
    const safeCallNumber = call_number ? call_number.replace(/\D/g, '') : '';
    const safeSocial = social_links ? (typeof social_links === 'string' ? social_links : JSON.stringify(social_links)) : '{}';
    const safeIsActive = (Array.isArray(is_active) ? is_active.includes('1') : is_active === '1') ? 1 : 0;

    // Enforçar Regras de Plano
    const planConfig = plans[cleanPlanLevel] || plans.basic;

    // Truncar cidades pelo limite do plano
    let finalCityIds = [];
    if (city_ids) {
        const rawIds = Array.isArray(city_ids) ? city_ids : [city_ids];
        const uniqueIds = [...new Set(rawIds.map(Number).filter(id => !isNaN(id) && id > 0))];
        finalCityIds = uniqueIds.slice(0, planConfig.max_cities);
    }

    // Processar Galeria (Garantir que seja JSON válido e respeite limites)
    let finalGallery = "[]";
    try {
        if (gallery_images) {
            const parsed = JSON.parse(gallery_images);
            if (Array.isArray(parsed)) {
                finalGallery = JSON.stringify(parsed.slice(0, planConfig.max_photos));
            }
        }
    } catch (e) {
        console.warn('[Admin] Galeria JSON inválida enviada, ignorando.');
    }

    let listingId = id;

    const saveAction = db.transaction(() => {
        // Capturar cidades antigas para garantir rebuild das que forem removidas (Proteção contra undefined)
        let oldCities = [];
        if (listingId) {
            oldCities = db.prepare('SELECT city_ibge_id FROM listing_service_cities WHERE listing_id = ?').all(listingId)
                .map(c => c.city_ibge_id)
                .filter(id => id && !isNaN(id));
        }

        if (id) {
            // Atualiza
            db.prepare('UPDATE listings SET company_name = ?, slug = ?, plan_level = ?, whatsapp_number = ?, call_number = ?, logo_url = ?, maps_link = ?, social_links = ?, is_active = ?, description_markdown = ?, gallery_images = ?, is_dirty = 1 WHERE id = ?')
                .run(company_name, safeSlug, cleanPlanLevel, safeWhatsapp, safeCallNumber, logo_url, maps_link, safeSocial, safeIsActive, description_markdown, finalGallery, id);
        } else {
            // Insere
            const result = db.prepare('INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, call_number, logo_url, maps_link, social_links, is_active, description_markdown, gallery_images, is_dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
                .run(company_name, safeSlug, cleanPlanLevel, safeWhatsapp, safeCallNumber, logo_url, maps_link, safeSocial, safeIsActive, description_markdown, finalGallery);
            listingId = result.lastInsertRowid;
        }

        // Sincronizar Categorias
        db.prepare('DELETE FROM category_listings WHERE listing_id = ?').run(listingId);
        if (category_ids) {
            const ids = Array.isArray(category_ids) ? category_ids : [category_ids];
            const insertStmt = db.prepare('INSERT INTO category_listings (listing_id, category_id) VALUES (?, ?)');
            for (const catId of ids) {
                insertStmt.run(listingId, catId);
            }
        }

        // Sincronizar Cidades de Atuação
        db.prepare('DELETE FROM listing_service_cities WHERE listing_id = ?').run(listingId);
        const insertCityStmt = db.prepare('INSERT INTO listing_service_cities (listing_id, city_ibge_id) VALUES (?, ?)');
        for (const cityId of finalCityIds) {
            if (cityId) insertCityStmt.run(listingId, cityId);
        }

        // Marcar todas as cidades vinculadas (antigas e novas) como sujas para rebuild (Filtro para evitar 'undefined' no SQL)
        const allAffectedCities = [...new Set([...oldCities, ...finalCityIds])].filter(cid => cid && !isNaN(cid));
        if (allAffectedCities.length > 0) {
            const placeholders = allAffectedCities.map(() => '?').join(',');
            db.prepare(`UPDATE cities SET is_dirty = 1 WHERE ibge_id IN (${placeholders})`).run(...allAffectedCities);
        }
    });

    try {
        saveAction();
        res.redirect('/admin');
    } catch (err) {
        console.error('[Admin Save Error]:', err);
        res.status(500).send('Erro ao salvar o parceiro.');
    }
});

module.exports = router;
