require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function downloadIBGE() {
    console.log('🔄 Baixando e estruturando dados hierárquicos do IBGE...');
    try {
        console.log('📥 Baixando lista completa de municípios...');
        const citiesReq = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
        const allCitiesRaw = await citiesReq.json();
        
        console.log(`✅ Recebidos ${allCitiesRaw.length} municípios.`);

        const ibgeHierarchy = {};

        allCitiesRaw.forEach(c => {
            // Alguns municípios podem ter estruturas de microrregião incompletas em versões raras da API
            const microrregiao = c.microrregiao;
            const mesorregiao = microrregiao ? microrregiao.mesorregiao : null;
            const uf = mesorregiao ? mesorregiao.UF : (c.UF || null);

            if (!uf) {
                console.warn(`⚠️ Município sem UF identificado: ${c.nome} (ID: ${c.id})`);
                return;
            }

            const ufSigla = uf.sigla;
            const ufNome = uf.nome;
            const ufId = uf.id;

            if (!ibgeHierarchy[ufSigla]) {
                ibgeHierarchy[ufSigla] = {
                    id: ufId,
                    nome: ufNome,
                    municipios: []
                };
            }

            ibgeHierarchy[ufSigla].municipios.push({
                id: c.id,
                nome: c.nome,
                microrregiao: microrregiao ? microrregiao.nome : null,
                mesorregiao: mesorregiao ? mesorregiao.nome : null,
                regiao_imediata: c['regiao-imediata'] ? c['regiao-imediata'].nome : null,
                regiao_intermediaria: c['regiao-imediata'] ? c['regiao-imediata']['regiao-intermediaria'].nome : null
            });
        });

        const sortedHierarchy = {};
        const sortedUFs = Object.keys(ibgeHierarchy).sort();

        sortedUFs.forEach(uf => {
            sortedHierarchy[uf] = ibgeHierarchy[uf];
            sortedHierarchy[uf].municipios.sort((a, b) => a.nome.localeCompare(b.nome));
        });

        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const outputPath = path.join(dataDir, 'municipios-ibge.json');
        fs.writeFileSync(outputPath, JSON.stringify(sortedHierarchy, null, 2));

        console.log(`\n✅ Sucesso! Dados hierárquicos salvos em: data/municipios-ibge.json`);
        process.exit(0);

    } catch (err) {
        console.error('\n❌ Falha ao processar dados do IBGE:', err);
        process.exit(1);
    }
}

downloadIBGE();
