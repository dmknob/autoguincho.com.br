#!/bin/bash
# =============================================================================
# deploy.sh — Script de Deploy Completo do Auto Guincho (Reconstrução do Banco)
# Uso: bash scripts/deploy.sh [nome-do-processo-pm2]
# Exemplo: bash scripts/deploy.sh autoguincho
# =============================================================================
set -e  # Para imediatamente em caso de qualquer erro

PM2_APP=${1:-autoguincho}  # Nome do processo PM2 (padrão: autoguincho)

echo ""
echo "=========================================="
echo "  🚀 Auto Guincho — Deploy Completo"
echo "=========================================="
echo ""

# ── 1. Para o servidor para liberar o lock do SQLite ──
echo "⏸  [1/6] Parando o processo PM2: $PM2_APP..."
pm2 stop "$PM2_APP" || echo "⚠️  Processo não encontrado ou já parado. Continuando..."

# ── 2. Puxa a última versão do código ──
echo "📥  [2/6] Atualizando código (git pull)..."
git pull

# ── 3. Recria o banco do zero ──
echo "🗃️   [3/6] Recriando banco de dados (db:setup)..."
npm run db:setup

echo "🗺️   [4/6] Importando localidades IBGE (db:import-locations)..."
npm run db:import-locations

# ── 4. Importa parceiros do CSV ──
echo "📋  [4/6] Importando parceiros (import-csv)..."
node scripts/import-csv.js

# ── 5. Gera todos os HTMLs estáticos ──
echo "🏗️   [5/6] Gerando site estático (build:full)..."
npm run build:full

# ── 6. Reinicia o servidor ──
echo "✅  [6/6] Reiniciando o processo PM2: $PM2_APP..."
pm2 start "$PM2_APP"

echo ""
echo "=========================================="
echo "  🎉 Deploy concluído com sucesso!"
echo "=========================================="
pm2 status "$PM2_APP"
echo ""
