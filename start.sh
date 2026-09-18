#!/usr/bin/env bash
# ==============================================================================
# FB Multi-Hub v2.0 - Shell Launcher for macOS / Linux / VPS
# ==============================================================================

set -e

# Change to script directory
cd "$(dirname "$0")"

echo "=================================================================="
echo "   🚀 FB MULTI-HUB v2.0 - KHỞI ĐỘNG (macOS / Linux / VPS)"
echo "=================================================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Không tìm thấy Node.js! Vui lòng cài đặt Node.js v18 trở lên (https://nodejs.org)."
    exit 1
fi

NODE_VER=$(node -v)
echo "✓ Phát hiện Node.js: $NODE_VER"

# Create data & bin directories if not exist
mkdir -p data bin

# Create default .env if not exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Đã sao chép cấu hình mẫu từ .env.example sang .env"
    else
        echo "PORT=3000" > .env
        echo "VERIFY_TOKEN=fb_tool_verify_secret_2026" >> .env
        echo "✓ Đã tạo tệp cấu hình mặc định .env"
    fi
fi

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
    echo "📦 Đang cài đặt các gói thư viện dự án (npm install)..."
    npm install --no-audit --no-fund
    echo "✓ Cài đặt thư viện hoàn tất."
fi

echo "=================================================================="
echo "🎉 Đang khởi động FB Multi-Hub tại: http://localhost:3000"
echo "=================================================================="

npm start
