const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Caminho para o arquivo do banco de dados
const dbFilePath = path.join(__dirname, '..', 'autoguincho.db');
const jsonFilePath = path.join(__dirname, 'estados-cidades2.json');

// Função para sanitizar nomes de cidades para busca
function sanitizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function populate() {
  console.log('Iniciando o povoamento dos dados geográficos a partir de um único arquivo...');
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });

  try {
    // --- LÊ O ARQUIVO JSON ÚNICO ---
    console.log(`Lendo ${jsonFilePath}...`);
    const geoData = JSON.parse(await fs.readFile(jsonFilePath, 'utf-8'));
    
    // --- 1. POVOAR A TABELA 'states' ---
    const states = geoData.states;
    console.log(`Inserindo ${Object.keys(states).length} estados...`);
    
    await db.run('BEGIN TRANSACTION');
    // Object.entries transforma o objeto { "11": "Rondônia" } em um array [ ["11", "Rondônia"] ]
    for (const [stateId, stateName] of Object.entries(states)) {
      // Como não temos a UF no JSON, inserimos NULL
      await db.run('INSERT INTO states (id, name, uf) VALUES (?, ?, ?)', [parseInt(stateId), stateName, null]);
    }
    await db.run('COMMIT');
    console.log('Tabela "states" populada com sucesso.');

    // --- 2. POVOAR A TABELA 'cities' ---
    const cities = geoData.cities;
    console.log(`Inserindo ${cities.length} municípios...`);
    
    await db.run('BEGIN TRANSACTION');
    for (const city of cities) {
      await db.run(
        'INSERT INTO cities (id, name, sanitized_name, state_id) VALUES (?, ?, ?, ?)',
        [city.id, city.name, sanitizeName(city.name), city.state_id]
      );
    }
    await db.run('COMMIT');
    console.log('Tabela "cities" populada com sucesso.');

    console.log('\nPovoamento geográfico concluído! 🎉');

  } catch (error) {
    await db.run('ROLLBACK'); // Desfaz a transação em caso de erro
    console.error('❌ Erro durante o povoamento:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

populate();