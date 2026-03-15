const db = require('../src/models/db');

function seedDatabase() {
  console.log('Seeding MVP 0 Data into SQLite...');

  // Use a transaction for bulk inserts
  const transaction = db.transaction(() => {
    
    // 1. Insert State
    const insertState = db.prepare(`INSERT OR IGNORE INTO states (uf, name, slug) VALUES (?, ?, ?) RETURNING id`);
    let stateId = insertState.get('RS', 'Rio Grande do Sul', 'rs')?.id;
    if (!stateId) {
       stateId = db.prepare(`SELECT id FROM states WHERE uf = 'RS'`).get().id;
    }

    // 2. Insert Cities
    const insertCity = db.prepare(`INSERT OR IGNORE INTO cities (state_id, name, slug, is_published) VALUES (?, ?, ?, 1) RETURNING id`);
    let cityId = insertCity.get(stateId, 'Novo Hamburgo', 'novo-hamburgo')?.id;
    if (!cityId) {
       cityId = db.prepare(`SELECT id FROM cities WHERE slug = 'novo-hamburgo'`).get().id;
    }

    // 3. Insert Tags
    const tags = [
      { name: '24 Horas', slug: '24-horas' },
      { name: 'Guincho Plataforma', slug: 'guincho-plataforma' },
      { name: 'Guincho Pesado', slug: 'guincho-pesado' },
      { name: 'Munck', slug: 'munck' },
      { name: 'Pane Seca', slug: 'pane-seca' },
      { name: 'Troca de Pneus', slug: 'troca-de-pneus' }
    ];
    
    const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?) RETURNING id`);
    const tagIds = {};
    for (const tag of tags) {
      let tid = insertTag.get(tag.name, tag.slug)?.id;
      if (!tid) {
         tid = db.prepare(`SELECT id FROM tags WHERE slug = ?`).get(tag.slug).id;
      }
      tagIds[tag.slug] = tid;
    }

    // 4. Insert 2 Mock Partners
    const insertListing = db.prepare(`
      INSERT INTO listings (
        city_id, company_name, slug, whatsapp_number, phone_number, plan_type, is_featured, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const partner1Res = insertListing.run(
      cityId, 
      'JJ Guinchos Rápidos', 
      'jj-guinchos-rapidos',
      '5551999999991', 
      '5133333331', 
      'basic', 
      0, 
      1
    );
    const p1Id = partner1Res.lastInsertRowid;

    const partner2Res = insertListing.run(
      cityId, 
      'Remoções Pesadas Silva', 
      'remocoes-pesadas-silva',
      '5551999999992', 
      '5133333332', 
      'premium', 
      1, /* Featured for heavy logic */
      1
    );
    const p2Id = partner2Res.lastInsertRowid;

    // 5. Connect Tags
    const insertListingTag = db.prepare(`INSERT INTO listing_tags (listing_id, tag_id) VALUES (?, ?)`);
    insertListingTag.run(p1Id, tagIds['24-horas']);
    insertListingTag.run(p1Id, tagIds['guincho-plataforma']);
    insertListingTag.run(p1Id, tagIds['pane-seca']);

    insertListingTag.run(p2Id, tagIds['guincho-pesado']);
    insertListingTag.run(p2Id, tagIds['munck']);
    insertListingTag.run(p2Id, tagIds['24-horas']);

    // 6. Connect Images
    const insertImage = db.prepare(`INSERT INTO listing_images (listing_id, image_url, display_order, is_primary) VALUES (?, ?, ?, ?)`);
    insertImage.run(p1Id, '/img/mock-guincho-1.webp', 1, 1);
    insertImage.run(p1Id, '/img/mock-guincho-2.webp', 2, 0);
    insertImage.run(p1Id, '/img/mock-guincho-3.webp', 3, 0);

    insertImage.run(p2Id, '/img/mock-pesado-1.webp', 1, 1);
    insertImage.run(p2Id, '/img/mock-pesado-2.webp', 2, 0);
    insertImage.run(p2Id, '/img/mock-pesado-3.webp', 3, 0);

  });

  try {
    transaction();
    console.log('✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
  }
}

seedDatabase();
