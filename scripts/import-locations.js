const db = require('../src/database');

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function fetchIBGE() {
  console.log('🔄 Baixando dados oficiais do IBGE...');
  try {
    const statesReq = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados');
    const states = await statesReq.json();

    console.log(`📥 API IBGE: Recebidos ${states.length} Estados.`);

    // Schema V2: ibge_id, state_uf, name, slug
    const insertCity = db.prepare('INSERT OR REPLACE INTO cities (ibge_id, state_uf, name, slug) VALUES (?, ?, ?, ?)');

    // Buscar Municípios por Estado
    let totalInserted = 0;
    for (const s of states) {
      const citiesReq = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${s.id}/municipios`);
      const cities = await citiesReq.json();

      const insertTransaction = db.transaction((citiesArray) => {
        for (const c of citiesArray) {
          insertCity.run(c.id, s.sigla, c.nome, slugify(c.nome));
          totalInserted++;
        }
      });

      insertTransaction(cities);
    }

    console.log(`✅ Salvo no banco: ${totalInserted} Cidades aglutinadas com Sigla UF (Padrão V2).`);

  } catch (err) {
    console.error('❌ Falha ao comunicar com API do IBGE:', err);
    process.exit(1);
  }
}

fetchIBGE();
