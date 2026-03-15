const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const geoip = require('fast-geoip');
const crypto = require('crypto');
const db = require('../models/db');

// --- Helper: SHA-256 IP Hashing for LGPD Compliance ---
const getAnonymizedIpHash = (ip) => {
    // In production, ANALYTICS_SALT could change daily to prevent long-term tracking
    const salt = process.env.ANALYTICS_SALT || 'default_dev_salt';
    return crypto.createHash('sha256').update(ip + salt).digest('hex');
};

// --- Rate Limiting: Prevent Click Fraud ---
// Limit each IP to 10 event logs per hour to prevent competitors from spamming fake clicks
const analyticsLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // Default 1 hour
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10, // Default 10 requests per window
    message: { success: false, error: 'Too many requests, try again later' },
    standardHeaders: true, 
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Essential to rate-limit by the actual client IP (especially behind Nginx proxy)
        return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    }
});

router.post('/event', analyticsLimiter, async (req, res) => {
    try {
        const { event_type, event_label, page_path, entity_type, entity_id } = req.body;

        // Basic validation
        if (!event_type || !page_path) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
        }

        // Extract IP (handling reverse proxy scenarios like Nginx)
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        
        // Lookup GeoIP BEFORE hashing the IP
        const geoInfo = await geoip.lookup(rawIp);
        
        // Hash the IP to maintain privacy (LGPD)
        const ipHash = getAnonymizedIpHash(rawIp);

        // Extract other headers
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const referrer = req.headers['referer'] || '';

        // Insert into database
        const insertStmt = db.prepare(`
            INSERT INTO analytics_events (
                event_type, event_label, page_path, referrer, ip_hash, 
                user_agent, geo_country, geo_region, geo_city, entity_type, entity_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
            event_type,
            event_label,
            page_path,
            referrer,
            ipHash,
            userAgent,
            geoInfo?.country || null,
            geoInfo?.region || null,
            geoInfo?.city || null,
            entity_type || null,
            entity_id || null
        );

        return res.json({ success: true, message: 'Evento registrado anonimamente.' });

    } catch (error) {
        console.error('Analytics Error:', error);
        // We do not want to break the UI if analytics fail
        return res.status(500).json({ success: false, error: 'Erro interno no rastreamento' });
    }
});

module.exports = router;

