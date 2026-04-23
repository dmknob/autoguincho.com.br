const fs = require('fs');
const path = require('path');
const db = require('../src/database');

/**
 * Função para gerar slug a partir do nome da cidade
 */
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

/**
 * Importa cidades a partir de um arquivo JSON local (Cache IBGE)
 */
async function importFromLocalJSON() {
  console.log('📦 Importando cidades do cache local (IBGE)...');
  const jsonPath = path.join(__dirname, '../data/municipios-ibge.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ Erro: Arquivo data/municipios-ibge.json não encontrado. Rode "node scripts/utils/download-ibge.js" primeiro.');
    process.exit(1);
  }

  try {
    const hierarchy = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const ufs = Object.keys(hierarchy);
    console.log(`📥 Lendo dados de ${ufs.length} UFs do arquivo local.`);

    // Schema: ibge_id, state_uf, name, slug
    const insertCity = db.prepare('INSERT OR REPLACE INTO cities (ibge_id, state_uf, name, slug) VALUES (?, ?, ?, ?)');

    let totalInserted = 0;

    const insertTransaction = db.transaction((ufList) => {
      let count = 0;
      ufList.forEach(ufSigla => {
        const ufData = hierarchy[ufSigla];
        ufData.municipios.forEach(c => {
          insertCity.run(c.id, ufSigla, c.nome, slugify(c.nome));
          count++;
        });
      });
      return count;
    });

    totalInserted = insertTransaction(ufs);
    console.log(`✅ Importação concluída: ${totalInserted} cidades inseridas/atualizadas.`);

  } catch (err) {
    console.error('❌ Falha ao importar dados locais:', err);
    process.exit(1);
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  importFromLocalJSON();
}

module.exports = importFromLocalJSON;
