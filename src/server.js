const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
require('dotenv').config();

const indexRouter = require('./routes/index');
const analyticsRouter = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3001;

// --- EJS Configuration ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.gtagId = process.env.GTAG_ID;

// --- Middlewares ---
// Helmet for basic security headers
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP for now to avoid breaking inline scripts/images
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
app.use('/api/analytics', analyticsRouter);
app.use('/', indexRouter);

// --- 404 Handler ---
app.use((req, res, next) => {
  res.status(404).render('pages/404', { title: 'Página Não Encontrada' });
});

// --- Server Initialization ---
app.listen(PORT, () => {
    console.log(`Auto Guincho Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});