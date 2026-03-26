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

    // 2. Insert Cities (Novo Hamburgo aprox coords)
    const insertCity = db.prepare(`INSERT OR IGNORE INTO cities (state_id, name, slug, latitude, longitude, is_published) VALUES (?, ?, ?, ?, ?, 1) RETURNING id`);
    let cityId = insertCity.get(stateId, 'Novo Hamburgo', 'novo-hamburgo', -29.6914, -51.1253)?.id;
    if (!cityId) {
       cityId = db.prepare(`SELECT id FROM cities WHERE slug = 'novo-hamburgo'`).get().id;
    }

    // 3. Insert Tags
    // 3. Insert Tags with descriptions and SVGs
    const tags = [
      { name: '24 Horas', slug: '24-horas', d: 'Atendimento emergencial a qualquer hora.', i: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10 M14 9h4l3 3v4h-3M18 12h-2M15 9l-2-2' },
      { name: 'Guincho Plataforma', slug: 'guincho-plataforma', d: 'Transporte seguro e equipamentos modernos para proteção total.', i: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { name: 'Guincho Pesado', slug: 'guincho-pesado', d: 'Remoção de caminhões, ônibus e carga extra-pesada.', i: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      { name: 'Munck', slug: 'munck', d: 'Içamento de carga e resgate em locais de difícil acesso.', i: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
      { name: 'Pane Seca', slug: 'pane-seca', d: 'Abastecimento emergencial de combustível no local.', i: 'M13 10V3L4 14h7v7l9-11h-7z' },
      { name: 'Troca de Pneus', slug: 'troca-de-pneus', d: 'Borracharia móvel rápida e eficiente.', i: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' }
    ];
    
    const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name, slug, description, icon_svg) VALUES (?, ?, ?, ?) RETURNING id`);
    const tagIds = {};
    for (const tag of tags) {
      let tid = insertTag.get(tag.name, tag.slug, tag.d, tag.i)?.id;
      if (!tid) {
         tid = db.prepare(`SELECT id FROM tags WHERE slug = ?`).get(tag.slug).id;
      }
      tagIds[tag.slug] = tid;
    }

    // 4. Insert 2 Mock Partners
    const insertListing = db.prepare(`
      INSERT INTO listings (
        city_id, company_name, slug, whatsapp_number, phone_number, plan_type, is_featured, is_active, mini_bio, latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const partner1Res = insertListing.run(
      cityId, 
      'JJ Guinchos Rápidos', 
      'jj-guinchos-rapidos',
      '5551999999991', 
      '5133333331', 
      'basic', 
      0, 
      1,
      'Especialistas em remoção ágil 24h na região de Novo Hamburgo. Nossa frota rápida garante que você não fique muito tempo na rua. Atendimento de confiança para carros e motos.',
      -29.68, -51.13
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
      1,
      'Especializados em resgates complexos, guincho de linha pesada, munck e içamento. Contamos com mais de 15 anos de experiência para salvar frotas de grandes empresas com total segurança.',
      -29.7, -51.11
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
