// scripts/mark-dirty.js
const db = require('../src/database/index');

console.log('🔄 Marcando todas as cidades e parceiros como "sujos" para rebuild total...');

try {
    const cityResult = db.prepare('UPDATE cities SET is_dirty = 1').run();
    const listingResult = db.prepare('UPDATE listings SET is_dirty = 1').run();

    console.log(`✅ Sucesso!`);
    console.log(`📍 Cidades afetadas: ${cityResult.changes}`);
    console.log(`🏢 Parceiros afetados: ${listingResult.changes}`);
    
    process.exit(0);
} catch (error) {
    console.error('❌ Erro ao marcar como sujo:', error.message);
    process.exit(1);
}
