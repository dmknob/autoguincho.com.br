const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  console.log('🏗️  Iniciando configuração do banco de dados...');

  const dbFile = process.env.DB_FILE || 'data/autoguincho_dev.db';
  const dbPath = path.join(__dirname, '../', dbFile);

  // Deletar banco atual e logs WAL para garantir limpeza total (Wipe)
  const filesToDelete = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  filesToDelete.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`🧹 Arquivo deletado: ${file}`);
      } catch (err) {
        console.log(`⚠️ Erro ao deletar ${file} (pode estar em uso): ${err.message}`);
      }
    }
  });

  // Agora sim, carregar o banco. O schema será aplicado pelo index.js do database.
  const db = require('../src/database');
  console.log(`✅ Banco de dados resetado e inicializado.`);

  // Importar cidades automaticamente do JSON local
  const importLocations = require('./import-locations');
  await importLocations();

  console.log(`✨ Configuração completa!`);
}

setupDatabase();
