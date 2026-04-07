const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbFile = process.env.DB_FILE;
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '../', dbFile);

const csvPath = path.join(__dirname, '../data/parceiros.csv');

console.log('🚀 Iniciando script de importação da Tabela CSV...');
console.log('📂 Usando base:', dbPath);

if (!fs.existsSync(csvPath)) {
  console.error(`❌ Erro: Planilha não localizada no caminho esperado: ${csvPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');

// Preparo de INSERTS e QUERIES
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
const getCategory = db.prepare('SELECT id FROM categories WHERE name = ?');
const getState = db.prepare('SELECT id FROM states WHERE uf = ?');
const insertState = db.prepare('INSERT INTO states (uf, name, slug) VALUES (?, ?, ?)');

// Busca flexível de cidade para tratar diferenças de acento ignorando Case
const getCityByLike = db.prepare('SELECT id FROM cities WHERE name LIKE ? AND state_id = ?');
const insertCity = db.prepare('INSERT INTO cities (state_id, name, slug, is_published) VALUES (?, ?, ?, 1)');

const insertListing = db.prepare(`
  INSERT INTO listings (company_name, slug, plan_level, whatsapp_number)
  VALUES (?, ?, ?, ?)
`);
const insertCategoryListing = db.prepare('INSERT INTO category_listings (listing_id, category_id) VALUES (?, ?)');
const insertListingServiceCity = db.prepare('INSERT INTO listing_service_cities (listing_id, city_id) VALUES (?, ?)');

const getListingBySlug = db.prepare('SELECT id FROM listings WHERE slug = ?');

// Query pra evitar rodar 2x na mesma empresa e cidade
const getDuplicateListing = db.prepare(`
    SELECT l.id 
    FROM listings l
    JOIN listing_service_cities lsc ON l.id = lsc.listing_id
    WHERE l.company_name = ? AND lsc.city_id = ?
`);

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

let imported = 0;
let failed = 0;

db.transaction(() => {
  // Ignora o cabeçalho (i=0) e percorre o arquivo
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(';');

    // Estrutura do CSV: nome;Cidade;UF;Telefone;Categoria;Plano;SLUG
    const nome = parts[0]?.trim();
    const cidadeName = parts[1]?.trim();
    const uf = parts[2]?.trim().toUpperCase();
    const rawTelefone = parts[3]?.trim() || '';
    const categoria = parts[4]?.trim() || 'Serviços';
    const rawPlano = parts[5]?.trim() || '';
    let slug = parts[6]?.trim() || '';

    if (!nome || !cidadeName || !uf) {
      // linha inválida
      continue;
    }

    // 1. Limpeza de Whatsapp (apenas números e prefixo 55)
    let whatsapp = rawTelefone.replace(/\D/g, '');
    if ((whatsapp.length === 10 || whatsapp.length === 11) && !whatsapp.startsWith('55')) {
        whatsapp = '55' + whatsapp;
    }

    // 2. Determinação de Tiers
    let planLevel = 'basic';
    if (rawPlano.toLowerCase().includes('parceiro')) planLevel = 'partner';
    else if (rawPlano.toLowerCase().includes('elite')) planLevel = 'elite';

    // 3. Resolução de Categorias
    let catSlug = slugify(categoria);
    insertCategory.run(categoria, catSlug);
    const catId = getCategory.get(categoria).id;

    // 4. Resolução Geográfica Estrita (IBGE)
    const stateObj = getState.get(uf);
    if (!stateObj) {
        console.warn(`[WARN] Estado ${uf} não encontrado no IBGE. Pulando parceiro: ${nome}`);
        failed++;
        continue;
    }
    
    // A query LIKE resolve flexibilidade de acentos
    const cityObj = getCityByLike.get(cidadeName, stateObj.id);
    if (!cityObj) {
        console.warn(`[WARN] Cidade ${cidadeName} - ${uf} não encontrada no IBGE. Pulando parceiro: ${nome}`);
        failed++;
        continue;
    }

    // 4.5. Checagem de Duplicidade (Mesmo Nome + Mesma Cidade principal)
    const isDupe = getDuplicateListing.get(nome, cityObj.id);
    if (isDupe) {
        console.log(`[INFO] Parceiro "${nome}" na cidade de "${cidadeName}" já existe. Ignorando duplicata...`);
        continue;
    }

    // 5. Garantia do SLUG Único
    if (!slug) {
      slug = slugify(nome) + '-' + slugify(cidadeName);
    }
    let finalSlug = slug;
    let suffix = 1;
    while (getListingBySlug.get(finalSlug)) {
      finalSlug = `${slug}-${suffix}`;
      suffix++;
    }

    // 6. Inserções Oficiais
    try {
      const insertResult = insertListing.run(nome, finalSlug, planLevel, whatsapp);
      const listingId = insertResult.lastInsertRowid;

      insertCategoryListing.run(listingId, catId);
      insertListingServiceCity.run(listingId, cityObj.id);

      imported++;
    } catch (e) {
      console.error(`[ERRO] Falha ao inserir ${nome}: ${e.message}`);
      failed++;
    }
  }
})();

console.log('✅ Importação finalizada!');
console.log(`📊 Sucesso: ${imported} parceiros importados.`);
console.log(`⚠️ Falhas/Pulados: ${failed} falharam na triagem (possivelmente geograficamente inválidos).`);
