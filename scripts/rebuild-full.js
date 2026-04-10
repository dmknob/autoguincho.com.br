const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { dbConfig } = require('../src/database');

// Cores para o console
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m"
};

async function rebuildFull() {
    console.log(`${colors.bright}${colors.cyan}🚀 Iniciando Reconstrução Total do Portal Auto Guincho...${colors.reset}\n`);

    try {
        // 1. Gerar CSS (Tailwind)
        console.log(`${colors.yellow}Step 1/4: Gerando CSS via Tailwind...${colors.reset}`);
        execSync('npm run build:css', { stdio: 'inherit' });
        console.log(`${colors.green}✅ CSS gerado com sucesso.${colors.reset}\n`);

        // 2. Limpar pasta public/
        const publicDir = path.join(__dirname, '../public');
        console.log(`${colors.yellow}Step 2/4: Limpando diretório public/ (${publicDir})...${colors.reset}`);
        if (fs.existsSync(publicDir)) {
            // Removemos recursivamente
            fs.rmSync(publicDir, { recursive: true, force: true });
            // Recriamos vazia para o build-ssg
            fs.mkdirSync(publicDir, { recursive: true });
        }
        console.log(`${colors.green}✅ Pasta public/ limpa.${colors.reset}\n`);

        // 3. Marcar todos como "dirty" no banco
        console.log(`${colors.yellow}Step 3/4: Marcando todos os registros como pendentes (Mark Dirty)...${colors.reset}`);
        execSync('npm run db:mark-dirty', { stdio: 'inherit' });
        console.log(`${colors.green}✅ Fila de build reiniciada.${colors.reset}\n`);

        // 4. Rodar o SSG Build
        console.log(`${colors.yellow}Step 4/4: Executando Gerador de Site Estático (SSG)...${colors.reset}`);
        execSync('npm run build:ssg', { stdio: 'inherit' });
        console.log(`${colors.green}✅ Build finalizado com sucesso.${colors.reset}\n`);

        console.log(`${colors.bright}${colors.green}🏁 PROCESSO CONCLUÍDO: O portal foi totalmente reconstruído!${colors.reset}`);
        process.exit(0);

    } catch (error) {
        console.error(`\n${colors.red}❌ ERRO FATAL durante a reconstrução:${colors.reset}`);
        console.error(error.message);
        process.exit(1);
    }
}

rebuildFull();
