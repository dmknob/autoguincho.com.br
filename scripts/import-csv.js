const db = require('../src/database');
const fs = require('fs');
const path = require('path');

// Mapeamento de Categorias Mestra (Excel) para Slugs Amigáveis (SEO/Frontend)
const CATEGORY_SLUG_MAP = {
    'Guincho Plataforma': 'guincho-plataforma',
    'Guincho Pesado - Caminhão': 'guincho-pesado',
    'Guincho Moto': 'guincho-moto',
    'Borracharia': 'borracharia',
    'Auto Elétrica': 'auto-eletrica',
    'Mecânica Automotiva': 'mecanica-automotiva',
    'Mecânica Diesel': 'mecanica-diesel',
    'Chaveiro Automotivo': 'chaveiro-automotivo',
    'Auto Peças': 'auto-pecas',
    'Auto-Vidros': 'auto-vidros',
    'Escapamentos e Surdinas': 'escapamentos-e-surdinas',
    'Radiadores e Arrefecimento': 'radiadores-e-arrefecimento',
    'Ar Condicionado Automotivo': 'ar-condicionado-automotivo',
    'Caminhão Guindaste Articulado - Munck': 'caminhao-munck',
    'Fábrica de Caminhão Plataforma': 'implementos-plataforma',
    'Fábrica de Guindaste Articulado - Munck': 'implementos-munck',
    'Acessórios e Implementos': 'acessorios-e-implementos',
    'Despachante Documental': 'despachante-documental',
    'Moto Peças': 'moto-pecas',
    'Retificadora': 'retificadora'
};;;

console.log('🧹 Limpando dados atuais...');
db.prepare('DELETE FROM listings').run();
db.prepare('DELETE FROM category_listings').run();
db.prepare('DELETE FROM listing_service_cities').run();
db.prepare('DELETE FROM categories').run();
db.prepare('UPDATE cities SET is_dirty = 0').run();

function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/**
 * Função para parsear CSV corretamente aceitando aspas duplas e quebra de linhas.
 */
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    currentCell += '"'; // Escute quote
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ';') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n') {
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else if (char !== '\r') {
                currentCell += char;
            }
        }
    }
    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    return rows;
}

const csvPath = path.join(__dirname, '../data/parceiros.csv');
const data = fs.readFileSync(csvPath, 'utf-8');
const rows = parseCSV(data);

const insertListing = db.prepare(`
    INSERT INTO listings (
        company_name, slug, plan_level, whatsapp_number, is_whatsapp_verified, 
        call_number, description_markdown, badges, social_links, maps_link, base_city_ibge_id, is_dirty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);
const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
const insertCatList = db.prepare('INSERT OR IGNORE INTO category_listings (listing_id, category_id) VALUES (?, ?)');
const insertServiceCity = db.prepare('INSERT OR IGNORE INTO listing_service_cities (listing_id, city_ibge_id) VALUES (?, ?)');
const getCat = db.prepare('SELECT id FROM categories WHERE slug = ?');
const getCity = db.prepare('SELECT ibge_id FROM cities WHERE slug = ? AND state_uf = ?');
const setCityDirty = db.prepare('UPDATE cities SET is_dirty = 1 WHERE ibge_id = ?');

let count = 0;

db.transaction(() => {
    // Pula cabeçalho linha 0
    for (let i = 1; i < rows.length; i++) {
        const parts = rows[i];
        if (parts.length < 6 || !parts[0]) continue;

        const nome = parts[0]?.trim();
        const baseCidade = parts[1]?.trim();
        const baseUf = parts[2]?.trim().toUpperCase();

        let call_number = parts[3] ? parts[3].replace(/[^\d]/g, '') : '';
        const categoriaPrincipal = parts[4]?.trim();
        let planoCsv = parts[5] ? parts[5].toLowerCase() : 'basic';

        let slug = (parts.length > 6 && parts[6] && parts[6].trim() !== '')
            ? parts[6].trim().toLowerCase()
            : slugify(nome) + '-' + count;

        let whatsapp = (parts.length > 7 && parts[7]) ? parts[7].replace(/[^\d]/g, '') : '';

        let textoPadrao = (parts.length > 9 && parts[9]) ? parts[9].trim() : '';

        let selosCsv = (parts.length > 11 && parts[11]) ? parts[11] : '';
        let badgesArray = selosCsv ? selosCsv.split(',').map(s => s.trim()).filter(Boolean) : [];
        let is_whatsapp_verified = badgesArray.includes('Whats Validado') ? 1 : 0;

        let cidadesAtendidasStr = (parts.length > 12 && parts[12]) ? parts[12] : '';
        let todosServicosStr = (parts.length > 13 && parts[13]) ? parts[13] : '';
        let linkMaps = (parts.length > 14 && parts[14]) ? parts[14].trim() : null;

        // Social Links
        let instagram = (parts.length > 15 && parts[15]) ? parts[15].trim() : '';
        let facebook = (parts.length > 16 && parts[16]) ? parts[16].trim() : '';
        let website = (parts.length > 17 && parts[17]) ? parts[17].trim() : '';

        let socialLinks = {};
        if (instagram) socialLinks.instagram = instagram;
        if (facebook) socialLinks.facebook = facebook;
        if (website) socialLinks.website = website;
        const socialLinksJson = Object.keys(socialLinks).length > 0 ? JSON.stringify(socialLinks) : null;

        // Formatação de plano
        let plano = 'basic';
        if (planoCsv.includes('partner')) plano = 'partner';
        if (planoCsv.includes('elite') || planoCsv.includes('c - elite')) plano = 'elite';

        // Garante que telefones tenham prefixo 55 se parecer telefone br local/nacional (>=10 digitos)
        if (whatsapp && !whatsapp.startsWith('55') && whatsapp.length >= 10 && whatsapp.length <= 11) {
            whatsapp = '55' + whatsapp;
        }
        if (call_number && !call_number.startsWith('55') && call_number.length >= 10 && call_number.length <= 11) {
            call_number = '55' + call_number;
        }

        const citySlug = slugify(baseCidade);
        const cityRow = getCity.get(citySlug, baseUf);

        if (!cityRow) {
            console.log(`⚠️ Cidade base não encontrada no IBGE: ${baseCidade} - ${baseUf}. Ignorando parceiro ${nome}.`);
            continue;
        }

        // Se o texto padrão não veio, usa string default como fallback
        const markdown = textoPadrao || `# ${nome}\nBem-vindo ao perfil oficial na plataforma Auto Guincho. Profissional atuante na região de **${baseCidade} - ${baseUf}** prestando serviços de **${categoriaPrincipal}**.`;

        try {
            const badgesJson = badgesArray.length > 0 ? JSON.stringify(badgesArray) : null;

            const result = insertListing.run(
                nome, slug, plano, whatsapp, is_whatsapp_verified,
                call_number, markdown, badgesJson, socialLinksJson, linkMaps, cityRow.ibge_id
            );
            const listingId = result.lastInsertRowid;

            // Processar categorias (Principal + Todos Serviços)
            const categoriasSet = new Set();
            if (categoriaPrincipal) categoriasSet.add(categoriaPrincipal);

            if (todosServicosStr) {
                todosServicosStr.split(',').forEach(c => {
                    const trimmed = c.trim();
                    if (trimmed) categoriasSet.add(trimmed);
                });
            }

            for (let catName of categoriasSet) {
                let catSlug = CATEGORY_SLUG_MAP[catName] || slugify(catName);
                insertCat.run(catName, catSlug);
                const catRow = getCat.get(catSlug);
                if (catRow) {
                    insertCatList.run(listingId, catRow.id);
                }
            }

            // Adiciona cidade base nas cidades atendidas
            insertServiceCity.run(listingId, cityRow.ibge_id);
            setCityDirty.run(cityRow.ibge_id);

            // Adiciona outras cidades atendidas
            if (cidadesAtendidasStr) {
                const arrCidades = cidadesAtendidasStr.split(',').map(c => c.trim()).filter(Boolean);
                for (let c of arrCidades) {
                    let cName = c;
                    let cUf = baseUf; // Default for UF is the base uf

                    // Trata string no formato "Cidade/UF" ou "Cidade-UF" (ex: Porto Alegre/RS)
                    if (c.includes('/')) {
                        const splitted = c.split('/');
                        cName = splitted[0].trim();
                        cUf = splitted[1].trim().toUpperCase();
                    }

                    const cSlug = slugify(cName);
                    const cRowLocal = getCity.get(cSlug, cUf);

                    if (cRowLocal) {
                        insertServiceCity.run(listingId, cRowLocal.ibge_id);
                        setCityDirty.run(cRowLocal.ibge_id);
                    } else {
                        console.log(`⚠️ Cidade atendida não encontrada: ${cName} - ${cUf} (Referenciada por: ${nome}).`);
                    }
                }
            }

            count++;
        } catch (e) {
            console.log(`Erro inserindo ${nome}: ${e.message}`);
        }
    }
})();

// Garantir que categorias principais existam mesmo sem parceiros no CSV
db.transaction(() => {
    Object.entries(CATEGORY_SLUG_MAP).forEach(([name, slug]) => {
        insertCat.run(name, slug);
    });
})();

console.log(`✅ Base de parceiros importada! Total: ${count} parceiros ativos inseridos.`);
