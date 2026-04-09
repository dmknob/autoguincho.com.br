// src/server.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
const { marked } = require('marked');
const db = require('./database');

// Rotas
const adminRoutes = require('./routes/admin');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Segurança Básica
app.use(helmet({
    contentSecurityPolicy: false // EJS às vezes usa inline scripts no admin
}));
app.set('trust proxy', 1);

// Sessão Simples
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'autoguincho.sid', // Nome customizado para evitar conflitos
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 Horas de duração
    }
}));

// Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Setup EJS
app.use(expressLayouts);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('layout', 'layouts/admin-layout'); // Layout padrão será o do admin

// Middleware Global: Injeta categorias e dados do site em todas as rotas (DEV Fallback)
app.use((req, res, next) => {
    res.locals.allCategories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    res.locals.BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    res.locals.path = req.path;
    res.locals.GTAG_ID = process.env.GTAG_ID;
    next();
});

// Servir estáticos do painel (caso haja algum assets/css)
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Middleware de Autenticação Hardcoded Mono-User
app.use('/admin', (req, res, next) => {
    // Liberar a rota de login
    if (req.path === '/login') return next();

    // Se estiver logado, segue
    if (req.session && req.session.isAdmin) {
        // Injetar variável na view para mostrar botão de logout, etc
        res.locals.isAdmin = true;
        return next();
    }

    // Senão logado, força pra login
    res.redirect('/admin/login');
});

// API REST para Autocomplete do Frontend
app.get('/api/cities/search', (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ success: false });

    // Busca preditiva
    const cities = db.prepare("SELECT name, slug, state_uf FROM cities WHERE slug LIKE ? LIMIT 10").all(`%${query.toLowerCase()}%`);
    if (cities.length > 0) {
        res.json({ success: true, cities: cities });
    } else {
        res.json({ success: false });
    }
});

// Rotas Base
app.use('/admin', adminRoutes);

// Constantes Globais para SEO/Analytics
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GTAG_ID = process.env.GTAG_ID || 'G-XXXXXXXXXX';

// Servir o Frontend SSG gerado apenas em ambiente de DEV (Para testes locais)
if (process.env.NODE_ENV !== 'production') {
    app.use('/', express.static(path.join(__dirname, '../public')));

    // FALLBACK DINÂMICO (SSR) - Evita "Cannot GET" se o arquivo estático não existir
    console.log('🌈 [DEV MODE] Fallback Dinâmico Ativado.');

    // Rota para Perfis
    app.get('/perfil/:slug', (req, res, next) => {
        const partner = db.prepare('SELECT * FROM listings WHERE slug = ? AND is_active = 1').get(req.params.slug);
        if (!partner) return next();

        const html_text = partner.description_markdown ? marked.parse(partner.description_markdown) : "";
        res.render('pages/partner', {
            layout: false, // Usar o <head> do próprio arquivo, não o admin-layout
            partner: partner,
            html_text: html_text,
            BASE_URL,
            GTAG_ID,
            path: `/perfil/${partner.slug}`,
            title: `${partner.company_name} | Perfil - Auto Guincho`
        });
    });

    // Rota para Categorias (Nível 1) - Ex: /borracharia
    app.get('/:catSlug', (req, res, next) => {
        const { catSlug } = req.params;
        const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(catSlug);
        
        if (!category) return next();

        // Buscar cidades que possuem prestadores nesta categoria
        const cities = db.prepare(`
            SELECT DISTINCT c.name, c.slug, c.state_uf
            FROM cities c
            JOIN listing_service_cities lsc ON c.ibge_id = lsc.city_ibge_id
            JOIN category_listings cl ON lsc.listing_id = cl.listing_id
            JOIN listings l ON l.id = cl.listing_id
            WHERE cl.category_id = ? AND l.is_active = 1
        `).all(category.id);

        const groupedCities = {};
        cities.forEach(city => {
            if (!groupedCities[city.state_uf]) groupedCities[city.state_uf] = [];
            groupedCities[city.state_uf].push(city);
        });

        res.render('pages/category', {
            layout: false,
            category,
            groupedCities,
            BASE_URL,
            GTAG_ID,
            path: `/${catSlug}`,
            title: `${category.name} | Socorro Profissional - Auto Guincho`
        });
    });

    // Rota para Cidades (Nível 2) - Ex: /mecanica-rapida/rs/novo-hamburgo
    app.get('/:catSlug/:uf/:citySlug', (req, res, next) => {
        const { catSlug, uf, citySlug } = req.params;

        const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(catSlug);
        const city = db.prepare('SELECT * FROM cities WHERE slug = ? AND state_uf = ?').get(citySlug, uf.toUpperCase());

        if (!category || !city) return next();

        const listings = db.prepare(`
            SELECT l.* FROM listings l
            JOIN category_listings cl ON l.id = cl.listing_id
            JOIN listing_service_cities lsc ON l.id = lsc.listing_id
            WHERE lsc.city_ibge_id = ? AND cl.category_id = ? AND l.is_active = 1
        `).all(city.ibge_id, category.id);

        res.render('pages/city', {
            layout: false,
            city,
            category,
            listings,
            BASE_URL,
            GTAG_ID,
            path: `/${catSlug}/${uf}/${citySlug}`,
            title: `${category.name} em ${city.name} - ${city.state_uf.toUpperCase()} | Auto Guincho`
        });
    });
} else {
    // Em produção o NGINX faz o trabalho antes de chegar no NodeJS
    app.get('/', (req, res) => {
        res.send('Auto Guincho API/Admin Server está rodando. O Frontend Público é servido isoladamente (SSG via Nginx). Acesse /admin para gerenciar.');
    });
}

// Start
app.listen(PORT, () => {
    console.log(`🚀 [AutoGuincho] Retaguarda Admin rodando na porta ${PORT}`);
});
