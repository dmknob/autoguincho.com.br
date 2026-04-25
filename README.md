# Auto Guincho V2

Portal de socorro automotivo escalável com arquitetura **SSG (Static Site Generation)** e Backend Headless.

## 🚀 Arquitetura e Stack
*   **Backend:** Node.js + Express (Administração e API de Analytics).
*   **Banco de Dados:** SQLite (Armazenamento local rápido e resiliente).
*   **Frontend:** EJS (Templates) compilados para HTML estático (SSG).
*   **Servidor Web:** Nginx (Servindo arquivos estáticos e fazendo proxy para a API).
*   **Analytics:** Sistema próprio anonimizado (LGPD) com captura de UTMs e suporte a `navigator.sendBeacon`.

## 📂 Estrutura do Projeto
*   `/src/server.js`: Servidor de API e Painel Administrativo.
*   `/src/views`: Templates EJS.
*   `/scripts/build-ssg.js`: Motor que gera o site estático em `/public`.
*   `/data`: Banco de dados SQLite e arquivos CSV de importação.
*   `/public`: Site pronto para produção (HTML/CSS/JS).

## 🛠 Comandos Principais
*   `npm run dev`: Inicia o servidor de desenvolvimento com fallback dinâmico (SSR).
*   `npm run build:ssg`: Gera todos os arquivos estáticos na pasta `/public`.
*   `npm run db:setup`: Reinicializa o banco de dados a partir do `schema.sql`.
*   `npm run import`: Importa dados de parceiros do `data/parceiros.csv`.

## 📈 Analytics e LGPD
O projeto utiliza um sistema de rastreamento de leads baseado em:
1.  **IP Hashing:** SHA-256(IP + ANALYTICS_SALT) para anonimização.
2.  **UTMs:** Captura automática de `utm_source`, `utm_medium`, etc.
3.  **Resiliência:** Tracking via `sendBeacon` para não bloquear a navegação do usuário.

## ☁️ Resiliência (Offline First)
O site foi desenhado para que o **atendimento ao cliente nunca pare**:
*   A busca por cidades funciona via `cities.json` estático carregado no navegador.
*   Os botões de contato (WhatsApp/Telefone) possuem os números reais injetados no HTML durante o build.
*   O rastreamento de cliques possui fallback caso a API de analytics esteja indisponível.

---
**Desenvolvido por Corpo Digital**
