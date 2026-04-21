const { dbConfig } = require('../src/database');
const fs = require('fs');

async function setupDatabase() {
  const { dbPath } = dbConfig;

  console.log('🏗️  Iniciando configuração do banco de dados...');

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

  // Apenas importar o banco (o schema já é executado no import do src/database/index.js)
  require('../src/database');

  console.log(`✅ Banco de dados resetado e inicializado com sucesso.`);
}

setupDatabase();
