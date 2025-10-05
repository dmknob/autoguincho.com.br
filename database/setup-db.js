const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Caminho para o arquivo do banco de dados
const dbFilePath = path.join(__dirname, '..', 'autoguincho.db');

async function setup() {
  console.log('Iniciando setup do banco de dados...');
  
  try {
    // Apaga o arquivo de banco de dados antigo, se existir, para um começo limpo
    try {
      await fs.unlink(dbFilePath);
      console.log('Banco de dados antigo removido.');
    } catch (error) {
      if (error.code !== 'ENOENT') { // ENOENT = "Error: No Such File or Directory"
        throw error;
      }
      // Se o arquivo não existe, não faz nada e continua.
    }
    
    // Abre uma nova conexão com o banco de dados (isso criará o arquivo)
    const db = await open({
      filename: dbFilePath,
      driver: sqlite3.Database
    });
    console.log('Arquivo de banco de dados criado.');

    // Lê o conteúdo do arquivo schema.sql
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf-8');
    
    // Executa todo o script SQL de uma vez
    await db.exec(schema);
    console.log('Schema executado e tabelas criadas com sucesso.');

    await db.close();
    console.log('Conexão com o banco de dados fechada.');
    console.log('\nSetup concluído com sucesso! 🎉');

  } catch (error) {
    console.error('❌ Erro durante o setup do banco de dados:', error);
    process.exit(1); // Encerra o script com erro
  }
}

// Executa a função de setup
setup();