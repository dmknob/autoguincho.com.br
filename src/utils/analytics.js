const geoip = require('fast-geoip');
const crypto = require('crypto');

/**
 * Processa dados de analytics anonimizados (LGPD Compliance)
 * @param {import('express').Request} req 
 */
async function processAnalytics(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    // 1. GeoIP ANTES do hash
    const geo = await geoip.lookup(ip);

    // 2. Hash do IP (irreversível) com Salt Fixo do .env
    // Usamos o Salt fixo para permitir correlação de usuários recorrentes sem identificar a pessoa
    const ipHash = crypto.createHash('sha256').update(ip + (process.env.ANALYTICS_SALT || 'default_salt')).digest('hex');

    // 3. Extração de UTMs (da Query String ou Referer se necessário)
    const utms = {
        utm_source: req.query.utm_source || req.body?.utm_source || null,
        utm_medium: req.query.utm_medium || req.body?.utm_medium || null,
        utm_campaign: req.query.utm_campaign || req.body?.utm_campaign || null,
        utm_content: req.query.utm_content || req.body?.utm_content || null,
        utm_term: req.query.utm_term || req.body?.utm_term || null
    };

    return {
        ip_hash: ipHash,
        geo_country: geo?.country || null,
        geo_region: geo?.region || null,
        geo_city: geo?.city || null,
        ...utms
    };
}

module.exports = {
    processAnalytics
};
