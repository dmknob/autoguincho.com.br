// src/database/index.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Garante carregamento das ENVs independente de onde a chamada partir
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// DB_FILE geralmente é 'data/autoguincho_prod.db'
const dbFile = process.env.DB_FILE || 'data/autoguincho-v2.db';
const dbPath = path.join(__dirname, '../../', dbFile);

// Garantir que a pasta data existe
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath, { verbose: console.log });

// Incializar schema se vazio
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema);
console.log('📦 Base de dados SQLite inicializada com o Schema da V2.');

module.exports = db;
