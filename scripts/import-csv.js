const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbFile = process.env.DB_FILE || 'data/autoguincho-v2.db';
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '../', dbFile);
const db = new Database(dbPath);

// Mapeamento de Categorias para Slugs Amigáveis (SEO/Frontend)
const CATEGORY_SLUG_MAP = {
    'Mecânica Automotiva': 'mecanica-rapida',
    'Borracharia': 'borracharia',
    'Chaveiro': 'chaveiro-24h',
    'Guincho Plataforma': 'guincho-plataforma'
};

console.log('🧹 Limpando dados atuais...');
db.prepare('DELETE FROM listings').run();
db.prepare('DELETE FROM category_listings').run();
db.prepare('DELETE FROM listing_service_cities').run();
db.prepare('DELETE FROM categories').run();
db.prepare('UPDATE cities SET is_dirty = 0').run();

function slugify(text) {
  if (!text) return '';
  return text.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '-')           
    .replace(/[^\w\-]+/g, '')       
    .replace(/\-\-+/g, '-')         
    .replace(/^-+/, '')             
    .replace(/-+$/, '');            
}

const csvPath = path.join(__dirname, '../data/parceiros.csv');
const data = fs.readFileSync(csvPath, 'utf-8');
const lines = data.split('\n');

const insertListing = db.prepare(`
    INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, call_number, description_markdown, is_dirty) 
    VALUES (?, ?, ?, ?, ?, ?, 1)
`);
const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
const insertCatList = db.prepare('INSERT INTO category_listings (listing_id, category_id) VALUES (?, ?)');
const insertServiceCity = db.prepare('INSERT INTO listing_service_cities (listing_id, city_ibge_id) VALUES (?, ?)');
const getCat = db.prepare('SELECT id FROM categories WHERE slug = ?');
const getCity = db.prepare('SELECT ibge_id FROM cities WHERE slug = ? AND state_uf = ?');
const setCityDirty = db.prepare('UPDATE cities SET is_dirty = 1 WHERE ibge_id = ?');

let count = 0;

db.transaction(() => {
    // Pula cabeçalho linha 0
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Colunas do CSV: Nome;Cidade;UF;Telefone 01;Serviços;Plano;Slug;Telefone 02
        const parts = line.split(';');
        if (parts.length < 6) continue;

        const nome = parts[0];
        const cidade = parts[1];
        const uf = parts[2].toUpperCase();
        
        let whatsapp = parts[3] ? parts[3].replace(/[^\d]/g, '') : '';
        const categoria = parts[4];
        let planoCsv = parts[5].toLowerCase();
        
        // Slug da Categoria: Usa mapeamento ou slugify padrão
        let catSlug = CATEGORY_SLUG_MAP[categoria] || slugify(categoria);

        // Slug do Parceiro: Prioridade total ao sugerido no CSV
        let slug = (parts.length > 6 && parts[6].trim() !== '') 
            ? parts[6].trim().toLowerCase() 
            : slugify(nome) + '-' + count;

        // Telefone 02 (Ligações)
        let telefone2 = (parts.length > 7 && parts[7]) ? parts[7].replace(/[^\d]/g, '') : '';

        let plano = 'basic';
        if (planoCsv.includes('partner')) plano = 'partner';
        if (planoCsv.includes('elite')) plano = 'elite';
        
        // Garante que o whatsapp tenha prefixo 55
        if (whatsapp && !whatsapp.startsWith('55') && whatsapp.length >= 10) {
            whatsapp = '55' + whatsapp;
        }

        // Garante que o telefone2 tenha prefixo 55 se parecer um número brasileiro
        if (telefone2 && !telefone2.startsWith('55') && telefone2.length >= 10) {
            telefone2 = '55' + telefone2;
        }

        const citySlug = slugify(cidade);
        const cityRow = getCity.get(citySlug, uf);
        
        if (!cityRow) {
            console.log(`⚠️ Cidade não encontrada no IBGE: ${cidade} - ${uf}. Ignorando parceiro ${nome}.`);
            continue;
        }

        insertCat.run(categoria, catSlug);
        const catRow = getCat.get(catSlug);

        const markdown = `# ${nome}\nBem-vindo ao perfil oficial na plataforma Auto Guincho. Profissional atuante na região de **${cidade} - ${uf}** prestando serviços de **${categoria}**.`;

        try {
            const result = insertListing.run(nome, slug, plano, whatsapp, telefone2, markdown);
            const listingId = result.lastInsertRowid;

            insertCatList.run(listingId, catRow.id);
            insertServiceCity.run(listingId, cityRow.ibge_id);
            setCityDirty.run(cityRow.ibge_id);
            
            count++;
        } catch(e) {
            console.log(`Erro inserindo ${nome}: ${e.message}`);
        }
    }
})();

// Garantir que categorias principais existam mesmo sem parceiros no CSV
db.transaction(() => {
    Object.entries(CATEGORY_SLUG_MAP).forEach(([name, slug]) => {
        insertCat.run(name, slug);
    });
})();

console.log(`✅ Base de parceiros importada! Total: ${count} parceiros ativos inseridos.`);
