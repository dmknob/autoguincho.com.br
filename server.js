// =================================================================
//                      ARQUIVO DE SERVIDOR
//                  AUTOGUINCHO.COM.BR - API
// =================================================================

// --- 1. IMPORTAÇÕES (DEPENDÊNCIAS) ---
const express = require('express');
const cors = require('cors');
const path = require('path');
const openDb = require('./database');

// --- 2. INICIALIZAÇÃO E CONFIGURAÇÃO DO APP ---
const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do Template Engine (EJS) para renderização de páginas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 3. MIDDLEWARES ---
// Middlewares são funções que rodam em todas ou na maioria das requisições.
// A ordem aqui é importante.

// Habilita o CORS para permitir que o painel (em outro domínio/porta) acesse a API
app.use(cors());

// Habilita o Express para entender requisições com corpo em formato JSON
app.use(express.json());

// Mapeia a URL '/painel-admin' para a pasta de arquivos estáticos 'public/painel-admin'
// Isso serve o seu painel de controle administrativo.
app.use('/painel-admin', express.static(path.join(__dirname, 'public', 'painel-admin')));


// =================================================================
//                          4. ROTAS
//     A ORDEM É CRUCIAL: API PRIMEIRO, PÚBLICAS DEPOIS
// =================================================================


// -------------------------------------------
// --- A. ENDPOINTS DA API (PARA O PAINEL) ---
// -------------------------------------------

// GET (READ): Listar todas as empresas
app.get('/api/companies', async (req, res) => {
  try {
    const db = await openDb();
    const companies = await db.all('SELECT * FROM companies ORDER BY name');
    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar empresas: ' + error.message });
  }
});

// GET (READ): Buscar UMA empresa por ID para o painel de edição
app.get('/api/companies/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const db = await openDb();
      const company = await db.get('SELECT * FROM companies WHERE id = ?', [id]);

      if (company) {
        res.status(200).json(company);
      } else {
        res.status(404).json({ error: 'Empresa não encontrada.' });
      }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar dados da empresa: ' + error.message });
    }
});

// POST (CREATE): Criar uma nova empresa
app.post('/api/companies', async (req, res) => {
  const { name, phone_primary, base_city, ...otherFields } = req.body;

  if (!name || !phone_primary || !base_city) {
    return res.status(400).json({ error: 'Campos obrigatórios (name, phone_primary, base_city) não foram preenchidos.' });
  }

  try {
    const db = await openDb();
    const sql = `
      INSERT INTO companies (name, phone_primary, base_city, phone_whatsapp, base_address, cities_served, description, contact_person, email, status, plan, notes_internal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await db.run(sql, [
      name, phone_primary, base_city,
      otherFields.phone_whatsapp, otherFields.base_address, otherFields.cities_served,
      otherFields.description, otherFields.contact_person, otherFields.email,
      otherFields.status || 'pending', otherFields.plan || 'free_tier', otherFields.notes_internal
    ]);
    
    res.status(201).json({ id: result.lastID, message: 'Empresa criada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar empresa: ' + error.message });
  }
});

// PUT (UPDATE): Atualizar uma empresa existente
app.put('/api/companies/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

  try {
    const db = await openDb();
    
    const fieldEntries = Object.entries(fields);
    const setClause = fieldEntries.map(([key]) => `${key} = ?`).join(', ');
    const values = fieldEntries.map(([, value]) => value);
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar foi fornecido.' });
    }
    
    const sql = `UPDATE companies SET ${setClause} WHERE id = ?`;
    const result = await db.run(sql, [...values, id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }
    
    res.status(200).json({ message: 'Empresa atualizada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar empresa: ' + error.message });
  }
});

// DELETE: Apagar uma empresa
app.delete('/api/companies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await openDb();
    const result = await db.run('DELETE FROM companies WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }
    
    res.status(200).json({ message: 'Empresa apagada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao apagar empresa: ' + error.message });
  }
});


// -----------------------------------------------
// --- B. ROTAS PÚBLICAS (PÁGINAS RENDERIZADAS) ---
// -----------------------------------------------

// Rota pública para perfil da empresa (SSR)
app.get('/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await openDb();
    // A página pública só deve mostrar empresas com status 'active'
    const company = await db.get('SELECT * FROM companies WHERE id = ? AND status = "active"', [id]);

    if (company) {
      res.render('company-profile', { company: company });
    } else {
      res.status(404).sendFile(path.join(__dirname, 'public', '404.html')); // Idealmente, ter uma página 404
    }
  } catch (error) {
    res.status(500).send('Erro ao buscar perfil da empresa.');
  }
});

// Rota para a página "Em Breve" (página inicial)
// Esta deve ser uma das últimas rotas GET, pois serve como "catch-all" para a raiz.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 5. INICIALIZAÇÃO DO SERVIDOR ---
// Conecta ao banco de dados e, se bem-sucedido, inicia o servidor web.
openDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor da API rodando em http://localhost:${PORT}`);
      console.log(`Painel de Admin: http://localhost:${PORT}/painel-admin/`);
    });
  })
  .catch(err => {
    console.error("Falha fatal ao conectar com o banco de dados. O servidor não será iniciado.", err);
    process.exit(1); // Encerra o processo se não conseguir conectar ao DB.
  });