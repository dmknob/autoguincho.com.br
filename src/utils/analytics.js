const geoip = require('fast-geoip');
const crypto = require('crypto');

// Salt rotativo diário (impede correlação entre dias)
function getDailySalt() {
    const today = new Date().toISOString().slice(0, 10); // '2026-03-09'
    return crypto.createHash('sha256').update(today + process.env.ANALYTICS_SALT).digest('hex');
}

async function processAnalytics(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    // 1. GeoIP ANTES do hash
    const geo = await geoip.lookup(ip);

    // 2. Hash do IP (irreversível)
    const ipHash = crypto.createHash('sha256').update(ip + getDailySalt()).digest('hex');

    return {
        ip_hash: ipHash,
        geo_country: geo?.country || null,    // 'BR'
        geo_region: geo?.region || null,      // 'São Paulo'
        geo_city: geo?.city || null,          // 'Santos'
    };
}

module.exports = {
    getDailySalt,
    processAnalytics
};
