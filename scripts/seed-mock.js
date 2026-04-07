const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbFile = process.env.DB_FILE || 'data/autoguincho-v2.db';
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '../', dbFile);
const db = new Database(dbPath);

console.log('🤖 Iniciando Mass Mock Seeder (Auto Guincho)...');

// 1. Garantir que as categorias existam
const categoriasArray = [
    { name: 'Guincho Plataforma', slug: 'guincho-plataforma' },
    { name: 'Mecânica Rápida', slug: 'mecanica-rapida' },
    { name: 'Chaveiro 24h', slug: 'chaveiro-24h' },
    { name: 'Borracharia Auto', slug: 'borracharia' }
];

const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
categoriasArray.forEach(c => insertCat.run(c.name, c.slug));

// 2. Extrair algumas Cidades Famosas que sabemos que agora estão no banco V2
const capitaisHomologadas = [
    { uf: 'SP', slug: 'sao-paulo' },
    { uf: 'RJ', slug: 'rio-de-janeiro' },
    { uf: 'MG', slug: 'belo-horizonte' },
    { uf: 'PR', slug: 'curitiba' },
    { uf: 'RS', slug: 'porto-alegre' },
    { uf: 'SC', slug: 'florianopolis' }
];

const foundCities = [];
for (const cap of capitaisHomologadas) {
    const city = db.prepare('SELECT ibge_id, name, state_uf FROM cities WHERE slug = ? AND state_uf = ?').get(cap.slug, cap.uf);
    if (city) foundCities.push(city);
}

if (foundCities.length === 0) {
    console.error('❌ Nenhuma cidade mapeada encontrada! Você rodou import-locations.js antes?');
    process.exit(1);
}

// 3. Montar Parceiros Fake Fictícios
const plans = ['basic', 'partner', 'elite'];
const insertListing = db.prepare(`
    INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, description_markdown, is_dirty) 
    VALUES (?, ?, ?, ?, ?, 1)
`);
const insertCatList = db.prepare('INSERT INTO category_listings (listing_id, category_id) VALUES (?, ?)');
const insertServiceCity = db.prepare('INSERT INTO listing_service_cities (listing_id, city_ibge_id) VALUES (?, ?)');
// Marcar cidades como sujas
const setCityDirty = db.prepare('UPDATE cities SET is_dirty = 1 WHERE ibge_id = ?');

let totalInserted = 0;

db.transaction(() => {
    // Para cada cidade famosa...
    foundCities.forEach(city => {
        // Criar 3 parceiros fictícios espalhados
        for (let i = 1; i <= 3; i++) {
            const plan = plans[Math.floor(Math.random() * plans.length)]; // Plano aleatório
            const companyName = `Auto Socorro ${city.name} ${i}`;
            const slug = `auto-socorro-${city.slug}-${i}`;
            const whats = `55119999999${i}${i}`;
            const markdown = `# Bem-vindo ao Auto Socorro ${city.name}!\n\nAtendemos toda a região metropolitana de **${city.name} - ${city.state_uf}**. Somos nível **${plan.toUpperCase()}** no ecossistema Auto Guincho.`;
            
            // Tenta inserir
            try {
                // Delete prévio pro caso de estar rodando 2x seguidas
                db.prepare('DELETE FROM listings WHERE slug = ?').run(slug);
                
                const result = insertListing.run(companyName, slug, plan, whats, markdown);
                const newListingId = result.lastInsertRowid;
                
                // Categoria aleatória 1-4
                const rndCat = Math.floor(Math.random() * 4) + 1;
                insertCatList.run(newListingId, rndCat);
                
                // Binda a Cidade
                insertServiceCity.run(newListingId, city.ibge_id);
                setCityDirty.run(city.ibge_id);
                
                totalInserted++;
            } catch (err) {
                 console.log(`Pulo: Erro no parceiro ${companyName}: ${err.message}`);
            }
        }
    });
})();

console.log(`✅ Inserção Maciça Concluída: ${totalInserted} parceiros ativos injetados.`);
console.log('💡 DICA: Execute `npm run build` ou `node scripts/build-ssg.js` agora para ver o SSG criar dezenas de páginas Reais na pasta /public!');
