#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== NexoClip Docker Setup ==="

# 1. Pastikan Docker CLI terinstall
if ! command -v docker &> /dev/null; then
    echo "❌ Docker CLI tidak ditemukan di sistem Anda."
    echo "   Silakan install Docker Desktop via brew:"
    echo "   brew install --cask docker"
    echo "   atau OrbStack: brew install --cask orbstack"
    echo "   Lalu jalankan aplikasinya sebelum melanjutkan."
    exit 1
fi

# 2. Pastikan Docker Daemon aktif
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon belum berjalan."
    echo "   Silakan buka aplikasi Docker Desktop di Mac Anda."
    exit 1
fi

# 3. Setup external volume & network yang dibutuhkan oleh docker-compose.yml
echo "📦 Menyiapkan Docker network & volume eksternal..."
docker network create ai-ugc_default 2>/dev/null || true
docker volume create open-generative-ai_nexoclip-postgres-data 2>/dev/null || true

echo "✅ Docker siap dijalankan!"
echo ""
echo "Pilihan menjalankan:"
echo "1. Hanya Database (PostgreSQL + Redis) untuk development lokal (npm run dev):"
echo "   docker compose up -d nexoclip-postgres nexoclip-redis"
echo ""
echo "2. Full Stack (Caddy + App + Spite + Workers + DB):"
echo "   docker compose up -d --build"
echo ""
