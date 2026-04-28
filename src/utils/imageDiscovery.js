const fs = require('fs');
const path = require('path');

/**
 * Processa e auto-descobre imagens do parceiro no FileSystem e Banco de Dados.
 * Lógica extraída para manter o princípio DRY e o Express enxuto.
 * 
 * @param {Object} partner Objeto do parceiro retornado do SQLite
 * @param {String} publicDir Caminho absoluto para a pasta public do projeto
 * @param {Object} plans Objeto de configuração de planos (plans.js)
 * @param {String} BASE_URL URL base do site para a construção do og:image
 * @returns {Promise<Object>} { cover_url, logo_url, galleryImages, og_image_url }
 */
async function processPartnerImages(partner, publicDir, plans, BASE_URL) {
    const planConfig = plans[partner.plan_level] || plans.basic;
    const allowedPhotos = planConfig.max_photos || 0;
    
    let cover_url = null;
    let logo_url = partner.logo_url || null; // Prioridade do Banco de Dados
    let galleryImages = [];
    
    try { galleryImages = JSON.parse(partner.gallery_images || '[]'); } catch(e) {}
    
    const partnerImagesDir = path.join(publicDir, 'images/partners', partner.slug);
    
    try {
        const files = await fs.promises.readdir(partnerImagesDir);
        
        // Warnings de formato para qualidade do painel de DEV/Build
        const invalidFiles = files.filter(f => f.match(/\.(jpg|jpeg|png)$/i));
        if (invalidFiles.length > 0) {
            console.warn(`[Auto-Discovery] Aviso: O parceiro '${partner.slug}' possui imagens não otimizadas (.jpg/.png): ${invalidFiles.join(', ')}. Use .webp/.svg`);
        }

        // Descobrir Capa
        if (files.includes('capa.webp')) {
            cover_url = `/images/partners/${partner.slug}/capa.webp`;
        }

        // Descobrir Logo (DB Override: só aplica do FS se não tiver no DB)
        if (!logo_url && files.includes('logo.webp')) {
            logo_url = `/images/partners/${partner.slug}/logo.webp`;
        }

        // Descobrir Galeria FileSystem
        const fsGallery = files
            .filter(f => f.startsWith('foto-') && f.endsWith('.webp'))
            .sort() // foto-01, foto-02...
            .map(f => `/images/partners/${partner.slug}/${f}`);
        
        // Concatenação (DB + FS) - DB assume prioridade por entrar antes
        const mergedGallery = [...galleryImages, ...fsGallery];
        
        // Remover duplicatas e fatiar no limite do plano
        galleryImages = [...new Set(mergedGallery)].slice(0, allowedPhotos);
        
        // [Correção] Se o parceiro não possui 'capa.webp', a primeira imagem da galeria assume como capa visual
        if (!cover_url && galleryImages.length > 0) {
            cover_url = galleryImages[0];
        }
        
    } catch (err) {
        // Silencioso. Pasta não existe ou sem permissão.
    }

    // --- Lógica Estrita de og:image (Cascata de SEO) ---
    let og_image_url = `${BASE_URL}/images/og-default.webp`;
    if (cover_url) {
        og_image_url = `${BASE_URL}${cover_url}`;
    } else if (galleryImages.length > 0) {
        og_image_url = `${BASE_URL}${galleryImages[0]}`;
    } else if (logo_url) {
        // Se o logo já for uma URL completa da web injetada no BD, mantém ela
        og_image_url = logo_url.startsWith('http') ? logo_url : `${BASE_URL}${logo_url}`;
    }

    return {
        cover_url,
        logo_url,
        galleryImages,
        og_image_url
    };
}

module.exports = { processPartnerImages };
