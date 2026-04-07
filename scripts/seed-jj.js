const db = require('../src/database/index');

console.log('🤖 Iniciando Inserção do JJ Guinchos...');

try {
    const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
    insertCategory.run('Guincho Plataforma', 'guincho-plataforma');
    
    // Buscar id da categoria
    const cat = db.prepare("SELECT id FROM categories WHERE slug = 'guincho-plataforma'").get();

    // IBGE real de Novo Hamburgo: 4313409
    const insertCity = db.prepare('INSERT OR IGNORE INTO cities (ibge_id, state_uf, name, slug, is_dirty) VALUES (?, ?, ?, ?, ?)');
    insertCity.run(4313409, 'RS', 'Novo Hamburgo', 'novo-hamburgo', 1);

    // Inserir Listing
    const insertListing = db.prepare(`
        INSERT INTO listings (company_name, slug, plan_level, whatsapp_number, is_active) 
        VALUES (?, ?, ?, ?, ?)
    `);
    
    // Deleta se já existir para não dar fatal error de constraint UNIQUE
    db.prepare("DELETE FROM listings WHERE slug = 'guincho-jj-nhamburgo'").run();
    
    const info = insertListing.run('JJ Guinchos', 'guincho-jj-nhamburgo', 'basic', '5551980268742', 1);
    const listingId = info.lastInsertRowid;

    // Relacionamento N:N: Categoria
    db.prepare('INSERT OR IGNORE INTO category_listings (listing_id, category_id) VALUES (?, ?)').run(listingId, cat.id);

    // Relacionamento N:N: Cidade
    db.prepare('INSERT OR IGNORE INTO listing_service_cities (listing_id, city_ibge_id) VALUES (?, ?)').run(listingId, 4313409);

    console.log('✅ Parceiro JJ Guinchos Cadastrado com Sucesso!');
    console.log(`ID: ${listingId} | Cidade atrelada (pendente de Build Estático)`);

} catch (e) {
    console.error('❌ Erro na inserção: ', e);
}
