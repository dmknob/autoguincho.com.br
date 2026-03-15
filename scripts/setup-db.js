const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  const dbFile = process.env.DB_FILE || 'data/autoguincho.db';
  const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, '../', dbFile);
  const schemaPath = path.join(__dirname, '../src/database/schema.sql');
  const dataDir = path.dirname(dbPath);

  console.log('🏗️  Iniciando configuração do banco de dados...');

  // Garantir que a pasta data/ existe
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Pasta data/ criada.');
  }

  // Ler o arquivo SQL
  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Conectar ao banco (cria se não existir)
    const db = new Database(dbPath);
    
    // Executar o schema
    db.exec(schema);
    db.close();
    
    console.log('✅ Banco de dados inicializado com sucesso em data/autoguincho.db');
  } catch (error) {
    console.error('❌ Erro ao configurar o banco de dados:', error.message);
    process.exit(1);
  }
}

setupDatabase();
