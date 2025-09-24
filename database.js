// database.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Variável para armazenar a conexão com o banco de dados
let db;

// Função assíncrona para abrir a conexão com o banco de dados
async function openDb() {
  if (!db) {
    db = await open({
      filename: './autoguincho.db', // Caminho para o seu arquivo de banco de dados
      driver: sqlite3.Database
    });
    console.log('Conexão com o banco de dados SQLite estabelecida.');
  }
  return db;
}

// Exporta a função para que outros arquivos possam usá-la
module.exports = openDb;