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
        res.redirect('/admin');
    } else {
        console.warn(`[Admin] Falha de login. Tentativa com: "${password ? '********' : 'vazio'}"`);
        res.render('admin/login', { layout: false, error: 'Senha incorreta' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// --- DASHBOARD ---
router.get('/', (req, res) => {
    // Buscar todos parceiros
    const listings = db.prepare('SELECT id, company_name, plan_level, last_renewal_date, is_active FROM listings ORDER BY created_at DESC').all();

    // Contar cidades sujas para ver no botão de Rebuild
    const dirtyCount = db.prepare('SELECT COUNT(*) as count FROM cities WHERE is_dirty = 1').get().count;

    res.render('admin/dashboard', {
        title: 'Dashboard - Auto Guincho',
        listings,
        dirtyCount
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
    const { id, company_name, slug, plan_level, whatsapp_number, call_number, description_markdown, category_ids, city_ids, gallery_images } = req.body;

    const safeSlug = slug ? slug.trim().toLowerCase() : company_name.trim().toLowerCase().replace(/\s+/g, '-');
    const safeWhatsapp = whatsapp_number ? whatsapp_number.replace(/\D/g, '') : '';
    const safeCallNumber = call_number ? call_number.replace(/\D/g, '') : '';

    // Enforçar Regras de Plano
    const planConfig = plans[plan_level] || plans.basic;
    
    // Truncar cidades pelo limite do plano
    let finalCityIds = [];
    if (city_ids) {
        const rawIds = Array.isArray(city_ids) ? city_ids : [city_ids];
        finalCityIds = rawIds.slice(0, planConfig.max_cities);
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
        // Capturar cidades antigas para garantir rebuild das que forem removidas
        const oldCities = db.prepare('SELECT city_ibge_id FROM listing_service_cities WHERE listing_id = ?').all(listingId).map(c => c.city_ibge_id);

        if (id) {
            // Atualiza
            db.prepare('UPDATE listings SET company_name = ?, slug = ?, plan_level = ?, whatsapp_number = ?, call_number = ?, description_markdown = ?, gallery_images = ?, is_dirty = 1 WHERE id = ?')
              .run(company_name, safeSlug, plan_level, safeWhatsapp, safeCallNumber, description_markdown, finalGallery, id);
        } else {
            // Insere
            const result = db.prepare('INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, call_number, description_markdown, gallery_images, is_dirty) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
                             .run(company_name, safeSlug, plan_level, safeWhatsapp, safeCallNumber, description_markdown, finalGallery);
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

        // Marcar todas as cidades vinculadas (antigas e novas) como sujas para rebuild
        const allAffectedCities = [...new Set([...oldCities, ...finalCityIds])];
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
