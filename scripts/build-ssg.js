require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { marked } = require('marked');
const db = require('../src/database');

// Configurações Globais (.env)
const BASE_URL = process.env.BASE_URL || 'https://autoguincho.com.br';
const GTAG_ID = process.env.GTAG_ID;

console.log('🚀 Iniciando Motor de Geração Estática (Auto Guincho SSG)...');

// 0. Carregamento de Dados Globais
const allCategories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();

// 1. Diretórios de Saída
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// 2. Compilação da Página Home (Estática Fixa)
const homeTemplate = path.join(__dirname, '../src/views/pages/home.ejs');
const cityTemplate = path.join(__dirname, '../src/views/pages/city.ejs');
const partnerTemplate = path.join(__dirname, '../src/views/pages/partner.ejs');
const categoryTemplate = path.join(__dirname, '../src/views/pages/category.ejs');

async function buildHome() {
    console.log('-> Gerando Home (index.html)...');
    try {
        const html = await ejs.renderFile(homeTemplate, {
            title: 'Auto Guincho - Socorro Automotivo Próximo a Você',
            description: 'Encontre guinchos, mecânica rápida e socorro 24h em todo o Brasil. Fale direto com o motorista sem taxas.',
            BASE_URL,
            GTAG_ID,
            allCategories,
            path: ''
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

    if (dirtyCities.length === 0) {
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

            const pathRelative = `/${cat.slug}/${city.state_uf.toLowerCase()}/${city.slug}`;
            const catDir = path.join(publicDir, cat.slug, city.state_uf.toLowerCase(), city.slug);
            if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

            try {
                const html = await ejs.renderFile(cityTemplate, {
                    city: city,
                    category: cat,
                    listings: listings,
                    BASE_URL,
                    GTAG_ID,
                    allCategories,
                    path: pathRelative,
                    title: `${cat.name} em ${city.name} - ${city.state_uf.toUpperCase()} | Auto Guincho 24h`,
                    description: `Procurando ${cat.name} em ${city.name}? Acesse agora e fale direto com os melhores motoristas cadastrados na região de ${city.name} - ${city.state_uf.toUpperCase()}.`
                });
                fs.writeFileSync(path.join(catDir, 'index.html'), html);
                console.log(`  📁 [SILO]: ${pathRelative}`);
            } catch (e) {
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

        const pathRelative = `/perfil/${partner.slug}`;
        const perfilDir = path.join(publicDir, 'perfil', partner.slug);
        if (!fs.existsSync(perfilDir)) fs.mkdirSync(perfilDir, { recursive: true });

        try {
            const htmlProfile = await ejs.renderFile(partnerTemplate, {
                partner: partner,
                html_text: html_text,
                BASE_URL,
                GTAG_ID,
                allCategories,
                path: pathRelative,
                title: `${partner.company_name} | Perfil Profissional - Auto Guincho`,
                description: `Veja detalhes de ${partner.company_name}. Localização, serviços e contato direto via WhatsApp no ecossistema Auto Guincho.`
            });
            fs.writeFileSync(path.join(perfilDir, 'index.html'), htmlProfile);
        } catch (e) {
            console.error(`  ❌ Erro compilando Perfil ${partner.slug}:`, e);
        }

        // Limpa flag
        db.prepare('UPDATE listings SET is_dirty = 0 WHERE id = ?').run(partner.id);
    }
    console.log(`✅ ${activePartners.length} Perfis Únicos Processados e Gerados.`);
}

// 5. Construtor de Categorias (Landing Pages)
async function buildCategories() {
    console.log('-> Gerando Landing Pages de Categorias...');
    const categories = db.prepare('SELECT * FROM categories').all();

    for (const cat of categories) {
        // Buscar cidades que possuem prestadores nesta categoria
        const cities = db.prepare(`
            SELECT DISTINCT c.name, c.slug, c.state_uf
            FROM cities c
            JOIN listing_service_cities lsc ON c.ibge_id = lsc.city_ibge_id
            JOIN category_listings cl ON lsc.listing_id = cl.listing_id
            JOIN listings l ON l.id = cl.listing_id
            WHERE cl.category_id = ? AND l.is_active = 1
        `).all(cat.id);

        const groupedCities = {};
        cities.forEach(city => {
            if (!groupedCities[city.state_uf]) groupedCities[city.state_uf] = [];
            groupedCities[city.state_uf].push(city);
        });

        const pathRelative = `/${cat.slug}`;
        const catDir = path.join(publicDir, cat.slug);
        if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

        try {
            const html = await ejs.renderFile(categoryTemplate, {
                category: cat,
                groupedCities,
                BASE_URL,
                GTAG_ID,
                allCategories,
                path: pathRelative,
                title: `${cat.name} | Socorro Profissional - Auto Guincho`,
                description: `Encontre os melhores profissionais de ${cat.name} atendendo em diversas cidades. Veja a lista completa e fale direto com o prestador.`
            });
            fs.writeFileSync(path.join(catDir, 'index.html'), html);
            console.log(`  📂 [CAT]: ${pathRelative}`);
        } catch (e) {
            console.error(`  ❌ Erro compilando Categoria ${cat.slug}:`, e);
        }
    }
}

// 6. Execução Geral
(async function run() {
    await buildHome();
    await buildCategories();
    await buildDirtyCities();
    await buildAllProfiles();
    console.log('🏁 Build concluído!');
    process.exit(0);
})();
