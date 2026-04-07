// src/routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { exec } = require('child_process');
const path = require('path');

// --- LOGIN ---
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect('/admin');
    res.render('admin/login', { layout: false, error: null });
});

router.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (password === adminPass) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
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
    res.render('admin/editor', { title: 'Novo Parceiro - Auto Guincho', partner: undefined });
});

router.get('/partner/:id', (req, res) => {
    const partnerId = req.params.id;
    const partner = db.prepare('SELECT * FROM listings WHERE id = ?').get(partnerId);

    if (!partner) {
        return res.status(404).send('Parceiro não encontrado.');
    }

    res.render('admin/editor', { title: 'Editar Parceiro - Auto Guincho', partner: partner });
});

router.post('/partner/save', (req, res) => {
    const { id, company_name, slug, plan_level, whatsapp_number, description_markdown } = req.body;

    // Fallback básico para validação do slug ou formatação
    const safeSlug = slug ? slug.trim().toLowerCase() : company_name.trim().toLowerCase().replace(/\\s+/g, '-');
    const safeWhatsapp = whatsapp_number ? whatsapp_number.replace(/\\D/g, '') : '';

    if (id) {
        // Atualiza
        const stmt = db.prepare('UPDATE listings SET company_name = ?, slug = ?, plan_level = ?, whatsapp_number = ?, description_markdown = ?, is_dirty = 1 WHERE id = ?');
        stmt.run(company_name, safeSlug, plan_level, safeWhatsapp, description_markdown, id);
    } else {
        // Insere
        const stmt = db.prepare('INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, description_markdown, is_dirty) VALUES (?, ?, ?, ?, ?, 1)');
        const result = stmt.run(company_name, safeSlug, plan_level, safeWhatsapp, description_markdown);
        // req.body.id = result.lastInsertRowid;
    }

    // Marca as cidades fictícias (ou vinculadas depois) como_sujas. Exemplo genérico se fossem alteradas todas do parceiro.
    // Como a relação multicity é feita na lista, deixamos anotado aqui o UPDATE genérico:
    // db.prepare('UPDATE cities SET is_dirty = 1 WHERE ibge_id IN (SELECT city_ibge_id FROM listing_service_cities WHERE listing_id = ?)').run(id || last_id);

    res.redirect('/admin');
});

module.exports = router;
