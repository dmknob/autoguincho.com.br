const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { marked } = require('marked');
const db = require('../src/database'); // Pegar conexão sqllite

console.log('🚀 Iniciando Motor de Geração Estática (Auto Guincho SSG)...');

// 1. Diretórios de Saída
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// 2. Compilação da Página Home (Estática Fixa)
// Constantes de Templates
const homeTemplate = path.join(__dirname, '../src/views/pages/home.ejs');
const cityTemplate = path.join(__dirname, '../src/views/pages/city.ejs');
const partnerTemplate = path.join(__dirname, '../src/views/pages/partner.ejs');

async function buildHome() {
    console.log('-> Gerando Home (index.html)...');
    try {
        const html = await ejs.renderFile(homeTemplate, {
            title: 'Auto Guincho - Maior portal de socorro automotivo'
        });
        fs.writeFileSync(path.join(publicDir, 'index.html'), html);
        console.log('✅ Home gerada com sucesso.');
    } catch (error) {
        console.error('❌ Erro renderizando Home:', error);
    }
}

// 3. Processamento em Batch (Cidades Sujas e Seus Parceiros)
async function buildDirtyCities() {
    console.log('-> Buscando Cidades para Reconstrução (is_dirty = 1)...');
    const dirtyCities = db.prepare('SELECT ibge_id, name, slug, state_uf FROM cities WHERE is_dirty = 1').all();

    if(dirtyCities.length === 0) {
        console.log('✅ Nenhuma cidade pendente na fila suja.');
        return;
    }

    console.log(`⏱ Encontramos ${dirtyCities.length} cidades pendentes. Iniciando reconstrução...`);
    
    // Obter array único de parceiros afetados para recompilar os perfis também 
    // (qualquer empresa que atue na cidade suja terá seu perfil regenerado por garantia)
    const partnersToRebuild = new Set();

    for (const city of dirtyCities) {
        // Encontrar todas as categorias vinculadas a prestadores ATIVOS nesta cidade
        const activeCategories = db.prepare(`
            SELECT DISTINCT c.id, c.name, c.slug
            FROM categories c
            JOIN category_listings cl ON c.id = cl.category_id
            JOIN listing_service_cities lsc ON cl.listing_id = lsc.listing_id
            JOIN listings l ON lsc.listing_id = l.id
            WHERE lsc.city_ibge_id = ? AND l.is_active = 1
        `).all(city.ibge_id);

        for (const cat of activeCategories) {
            // Obter prestadores apenas desta CATEGORIA e CIDADE
            const listings = db.prepare(`
                SELECT l.* 
                FROM listings l
                JOIN category_listings cl ON l.id = cl.listing_id
                JOIN listing_service_cities lsc ON l.id = lsc.listing_id
                WHERE lsc.city_ibge_id = ? AND cl.category_id = ? AND l.is_active = 1
            `).all(city.ibge_id, cat.id);

            // Coletar pro Set de Parceiros
            listings.forEach(p => partnersToRebuild.add(p.id));

            // Caminho Silo SEO Físico: /public/[categoria]/[uf]/[cidade]/index.html
            const catDir = path.join(publicDir, cat.slug, city.state_uf.toLowerCase(), city.slug);
            if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

            try {
                const html = await ejs.renderFile(cityTemplate, {
                    city: city,
                    category: cat,
                    listings: listings
                });
                fs.writeFileSync(path.join(catDir, 'index.html'), html);
                console.log(`  📁 [SILO CRIADO]: /${cat.slug}/${city.state_uf.toLowerCase()}/${city.slug}`);
            } catch(e) {
                console.error(`  ❌ Erro compilando Silo ${city.slug}:`, e);
            }
        }

        // Limpar a Flag de Sujo no SQLite
        db.prepare('UPDATE cities SET is_dirty = 0 WHERE ibge_id = ?').run(city.ibge_id);
    }
}

// 4. Construtor de Vanity URLs (Perfis) - Escalável O(1)
async function buildAllProfiles() {
    console.log(`-> Buscando Perfis Pendentes para Reconstrução (is_dirty = 1)...`);
    const activePartners = db.prepare('SELECT * FROM listings WHERE is_active = 1 AND is_dirty = 1').all();

    if (activePartners.length === 0) {
        console.log('✅ Nenhum perfil pendente.');
        return;
    }

    console.log(`⏱ Recompilando ${activePartners.length} Perfis Ativos Individuais...`);

    for (const partner of activePartners) {
        let html_text = "";
        if (partner.description_markdown) {
            // Parser de Markdown p/ HTML seguro puro
            html_text = marked.parse(partner.description_markdown);
        }

        const perfilDir = path.join(publicDir, 'perfil', partner.slug);
        if (!fs.existsSync(perfilDir)) fs.mkdirSync(perfilDir, { recursive: true });

        try {
            const htmlProfile = await ejs.renderFile(partnerTemplate, {
                partner: partner,
                html_text: html_text
            });
            fs.writeFileSync(path.join(perfilDir, 'index.html'), htmlProfile);
            // Reduzindo spam de logs, exibir apenas se houver muito sucesso:
            // console.log(`  👤 [PERFIL GERADO]: /perfil/${partner.slug}`);
        } catch(e) {
             console.error(`  ❌ Erro compilando Perfil ${partner.slug}:`, e);
        }

        // Limpa flag
        db.prepare('UPDATE listings SET is_dirty = 0 WHERE id = ?').run(partner.id);
    }
    console.log(`✅ ${activePartners.length} Perfis Únicos Processados e Gerados.`);
}

// 5. Execução Geral
(async function run() {
    await buildHome();
    await buildDirtyCities();
    await buildAllProfiles();
    console.log('🏁 Build concluído!');
    process.exit(0);
})();
