const { dbConfig } = require('../src/database');
const fs = require('fs');

async function setupDatabase() {
  const { dbPath } = dbConfig;

  console.log('🏗️  Iniciando configuração do banco de dados...');

  // Deletar banco atual para garantir limpeza total (Wipe)
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log(`🧹 Banco de dados anterior deletado: ${dbPath}`);
  }

  // Apenas importar o banco (o schema já é executado no import do src/database/index.js)
  require('../src/database');

  console.log(`✅ Banco de dados resetado e inicializado com sucesso.`);
}

setupDatabase();
