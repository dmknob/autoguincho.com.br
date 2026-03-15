---
description: Como configurar e rodar o projeto no WSL2
---

Este fluxo descreve como preparar o ambiente Linux (WSL2) para rodar o projeto Node.js da Corpo Digital.

### 1. Preparação do Node.js (via NVM)
Dentro do terminal do seu WSL2 (Ubuntu, etc), instale o NVM para gerenciar versões do Node:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```
Feche e abra o terminal, e instale a versão estável:
```bash
nvm install --lts
nvm use --lts
```

### 2. Acessando os Arquivos do Windows
O WSL2 monta seu disco `C:` em `/mnt/c/`. Navegue até a pasta do projeto:
```bash
cd /mnt/c/Users/Ana\ Sofia/OneDrive/DENISON/GITHUB/autoguincho.com.br
```

### 3. Instalando Dependências
// turbo
```bash
npm install
```

### 4. Setup do Banco de Dados (SQLite)
Se ainda não populou o banco:
// turbo
```bash
npm run db:setup
npm run db:populate
```

### 5. Executando em Desenvolvimento
Para rodar o servidor com hot-reload e Tailwind em paralelo:
// turbo
```bash
npm run dev:full
```

O site estará acessível no seu navegador Windows via `http://localhost:3001`.

### ⚠️ Solução de Problemas: "invalid ELF header"
Se você encontrar o erro `invalid ELF header` ao rodar o projeto, é porque a pasta `node_modules` contém binários compilados para Windows, e o Linux (WSL2) não consegue executá-los.

**Para corrigir:**
Remova a pasta atual e reinstale especificamente no Linux:
```bash
rm -rf node_modules
npm install
```
Se o erro persistir com o `better-sqlite3`, use o comando de rebuild:
```bash
npm rebuild better-sqlite3
```
