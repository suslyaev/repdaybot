#!/bin/bash
# Скрипт для быстрого деплоя RepDay на сервер

set -e

echo "🚀 Деплой RepDay..."

# Обновление кода
echo "📥 Обновление кода..."
git pull

# Backend
echo "🐍 Обновление backend..."
cd backend
source venv/bin/activate
pip install -r requirements.txt --quiet
deactivate
cd ..

# Frontend
echo "⚛️  Сборка frontend..."
cd frontend
npm install --silent
npm run build
cd ..

# Перезапуск сервисов
echo "🔄 Перезапуск сервисов..."
sudo systemctl restart repday-backend
sudo systemctl reload nginx

echo "✅ Деплой завершен!"
echo "📊 Проверка статуса:"
sudo systemctl status repday-backend --no-pager -l
