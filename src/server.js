// src/server.js
const express = require('express');
const fs = require('fs');
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

// 0. Cache de CSS Inline para Performance (SSR fallback)
let inlineCSS = "";
try {
    const cssPath = path.join(__dirname, 'public/css/output.css');
    if (fs.existsSync(cssPath)) {
        inlineCSS = fs.readFileSync(cssPath, 'utf8');
    }
} catch (e) {
    console.error("Aviso: Não foi possível ler o CSS para inlining.");
}

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
app.set('view cache', process.env.NODE_ENV === 'production');
app.set('layout', 'layouts/admin-layout'); // Layout padrão será o do admin

// Middleware Global: Injeta categorias e dados do site em todas as rotas (DEV Fallback)
app.use((req, res, next) => {
    res.locals.allCategories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    res.locals.BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    res.locals.path = req.path;
    res.locals.GTAG_ID = process.env.GTAG_ID;
    res.locals.inlineCSS = inlineCSS;
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

    // Busca preditiva (Slug ou Nome para suportar acentos)
    const cities = db.prepare("SELECT name, slug, state_uf, ibge_id FROM cities WHERE slug LIKE ? OR name LIKE ? LIMIT 30").all(`%${query.toLowerCase()}%`, `%${query}%`);
    if (cities.length > 0) {
        res.json({ success: true, cities: cities });
    } else {
        res.json({ success: false });
    }
});

// Utils
const { processAnalytics } = require('./utils/analytics');

// Middleware Analytics - Page Views (SSR Fallback Only)
async function trackPageView(req, res, next) {
    if (req.path.startsWith('/admin') ||
        req.path.startsWith('/api') ||
        req.path.match(/\.(css|js|ico|png|jpg|webp|woff2?)$/)) {
        return next();
    }

    try {
        const { ip_hash, geo_country, geo_region, geo_city } = await processAnalytics(req);
        
        db.prepare(`
            INSERT INTO analytics_events 
            (event_type, page_path, referrer, ip_hash, user_agent, geo_country, geo_region, geo_city)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'page_view',
            req.path,
            req.get('referer') || null,
            ip_hash,
            req.get('user-agent') || null,
            geo_country,
            geo_region,
            geo_city
        );
    } catch (err) {
        console.error('[Analytics] Erro ao registrar page view:', err.message);
    }
    next();
}

// Em Desenvolvimento (SSR Fallback), rastreia views nas rotas principais
if (process.env.NODE_ENV !== 'production') {
    app.use(trackPageView);
}

// API REST para Cliques e Interações Frontend (Disfarçado para AdBlockers)
app.post('/api/system/interaction', async (req, res) => {
    const { event_type, event_label, page_path, entity_type, entity_id } = req.body;

    if (!event_type || !page_path) return res.status(400).json({ error: 'Missing fields' });

    try {
        const { ip_hash, geo_country, geo_region, geo_city } = await processAnalytics(req);

        db.prepare(`
            INSERT INTO analytics_events 
            (event_type, event_label, page_path, ip_hash, user_agent, 
             geo_country, geo_region, geo_city, entity_type, entity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(event_type, event_label, page_path, ip_hash,
               req.get('user-agent'), geo_country, geo_region, geo_city,
               entity_type || null, entity_id || null);

        res.status(204).end();
    } catch(err) {
        console.error('[Analytics] Erro ao registrar tracking de clique:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MOTOR DE RASTREAMENTO DEFINITIVO (Server-Side Redirect Clicks)
// Resolve 100% das falhas de JavaScript local, AdBlockers e "Cancelamento de Aba" do Safari/Chrome
app.get('/r/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    
    try {
        const listing = db.prepare('SELECT whatsapp_number, call_number FROM listings WHERE id = ?').get(id);
        if (!listing) return res.redirect('/');

        let targetUrl = '/';
        let eventLabel = '';

        if (type === 'wa' && listing.whatsapp_number) {
            targetUrl = `https://wa.me/${listing.whatsapp_number}?text=Olá,%20vi%20seu%20contato%20no%20Auto%20Guincho.`;
            eventLabel = 'whatsapp';
        } else if (type === 'call' && listing.call_number) {
            targetUrl = `tel:${listing.call_number}`;
            eventLabel = 'ligar';
        } else {
            return res.redirect('/');
        }

        const userAgent = req.get('user-agent') || '';
        const isBot = /bot|crawler|spider|crawling|slurp/i.test(userAgent);

        if (!isBot) {
            const { ip_hash, geo_country, geo_region, geo_city } = await processAnalytics(req);
            // Salva a página de origem usando o cabeçalho HTTP Referer embutido nativamente no redirect
            const referrer = req.get('Referrer') || '/redirecionamento-direto';
            
            db.prepare(`
                INSERT INTO analytics_events 
                (event_type, event_label, page_path, ip_hash, user_agent, 
                 geo_country, geo_region, geo_city, entity_type, entity_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('cta_click', eventLabel, referrer, ip_hash,
                   userAgent, geo_country, geo_region, geo_city,
                   'listing', id);
        }

        // Dispara o usuário pro destino final HTTP 302 Redirecionamento Temporário
        res.redirect(302, targetUrl);

    } catch(err) {
        console.error('[Analytics Tracker] Erro crasso na Rota de Redirect Rápido:', err.message);
        res.redirect('/');
    }
});

// Rotas Base
app.use('/admin', adminRoutes);

// Constantes Globais para SEO/Analytics
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GTAG_ID = process.env.GTAG_ID;

// Servir o Frontend SSG gerado apenas em ambiente de DEV (Para testes locais)
if (process.env.NODE_ENV !== 'production') {
    app.use('/', express.static(path.join(__dirname, '../public')));

    // FALLBACK DINÂMICO (SSR) - Evita "Cannot GET" se o arquivo estático não existir
    console.log('🌈 [DEV MODE] Fallback Dinâmico Ativado.');

    // Rota: Seja Parceiro (Planos e Gestão)
    app.get('/seja-parceiro', (req, res) => {
        res.render('pages/plans', {
            layout: false,
            BASE_URL,
            GTAG_ID,
            WHATSAPP_CONTACT,
            path: '/seja-parceiro',
            title: 'Seja um Parceiro - Planos e Gestão | Auto Guincho',
            allCategories
        });
    });

    // [LEGADO] Redirecionamento 301 Permanente (SEO)
    app.get('/quero-ser-parceiro', (req, res) => {
        res.redirect(301, '/seja-parceiro');
    });

    // Rota: Termos de Uso
    app.get('/termos-de-uso', (req, res) => {
        res.render('pages/termos-de-uso', {
            layout: false,
            BASE_URL,
            GTAG_ID,
            WHATSAPP_CONTACT,
            path: '/termos-de-uso',
            title: 'Termos de Uso | Auto Guincho',
            allCategories
        });
    });

    // Rota: Política de Privacidade
    app.get('/politica-de-privacidade', (req, res) => {
        res.render('pages/politica-privacidade', {
            layout: false,
            BASE_URL,
            GTAG_ID,
            WHATSAPP_CONTACT,
            path: '/politica-de-privacidade',
            title: 'Política de Privacidade | Auto Guincho',
            allCategories
        });
    });

    // Rota para Perfis
    app.get('/perfil/:slug', (req, res, next) => {
        const { slug } = req.params;

        // Ignorar requisições que pareçam arquivos estáticos
        if (slug.includes('.')) return next();

        const partner = db.prepare('SELECT * FROM listings WHERE slug = ? AND is_active = 1').get(slug);
        if (!partner) return next();

        // Buscar cidades atendidas
        const servedCities = db.prepare(`
            SELECT c.name, c.state_uf, c.slug 
            FROM cities c 
            JOIN listing_service_cities lsc ON c.ibge_id = lsc.city_ibge_id 
            WHERE lsc.listing_id = ?
        `).all(partner.id);

        // Buscar categorias atendidas
        const servedCategories = db.prepare(`
            SELECT c.name, c.slug 
            FROM categories c 
            JOIN category_listings cl ON c.id = cl.category_id 
            WHERE cl.listing_id = ?
        `).all(partner.id);

        const html_text = partner.description_markdown ? marked.parse(partner.description_markdown) : "";
        res.render('pages/partner', {
            layout: false,
            partner: partner,
            servedCities: servedCities,
            servedCategories: servedCategories,
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

        // Ignorar requisições que pareçam arquivos estáticos (evita buscas inúteis por favicon.ico, etc)
        if (catSlug.includes('.')) return next();

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

    // [LEGADO] Mapeamento UF/Cidade (fallback para categoria principal)
    app.get('/:uf/:citySlug', (req, res, next) => {
        const { uf, citySlug } = req.params;
        // Ex: /rs/porto-alegre -> /guincho-plataforma/rs/porto-alegre
        if (uf.length === 2 && !uf.includes('.')) {
            return res.redirect(301, `/guincho-plataforma/${uf.toLowerCase()}/${citySlug.toLowerCase()}`);
        }
        next();
    });

    // Rota para Cidades (Nível 2) - Ex: /mecanica-rapida/rs/novo-hamburgo
    app.get('/:catSlug/:uf/:citySlug', (req, res, next) => {
        const { catSlug, uf, citySlug } = req.params;

        // Ignorar requisições que pareçam arquivos estáticos
        if (catSlug.includes('.') || citySlug.includes('.')) return next();

        const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(catSlug);
        const city = db.prepare('SELECT * FROM cities WHERE slug = ? AND state_uf = ?').get(citySlug, uf.toUpperCase());

        if (!category || !city) return next();

        const listings = db.prepare(`
            SELECT l.* FROM listings l
            JOIN category_listings cl ON l.id = cl.listing_id
            JOIN listing_service_cities lsc ON l.id = lsc.listing_id
            WHERE lsc.city_ibge_id = ? AND cl.category_id = ? AND l.is_active = 1
            ORDER BY 
                CASE l.plan_level 
                    WHEN 'elite' THEN 1 
                    WHEN 'partner' THEN 2 
                    ELSE 3 
                END,
                RANDOM()
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
