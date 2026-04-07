// src/server.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
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
    secret: process.env.SESSION_SECRET || 'secret-admin-auto-guincho-v2',
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

// Servir o Frontend SSG gerado apenas em ambiente de DEV (Para testes locais)
if (process.env.NODE_ENV !== 'production') {
    console.log('🛠  [DEV MODE] Servindo arquivos estáticos de /public...');
    app.use('/', express.static(path.join(__dirname, '../public')));
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
