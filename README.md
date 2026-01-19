# RepDay - Telegram Mini App для групповых челленджей

MVP приложения для командных челленджей с количественными целями, чек-инами и таймерами.

## Структура проекта

- `backend/` - FastAPI + SQLite
- `frontend/` - React + TypeScript + Vite

## Деплой на Ubuntu 24

### 1. Подготовка сервера

```bash
sudo apt update
sudo apt install -y git python3 python3-venv nginx certbot python3-certbot-nginx
```

### 2. Клонирование и установка

```bash
cd /var/www
sudo mkdir -p repdaybot
sudo chown $USER:$USER repdaybot
cd repdaybot
git clone git@github.com:suslyaev/repdaybot.git .
```

### 3. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Создайте `.env` файл:

```bash
nano .env
```

Содержимое:
```
TELEGRAM_BOT_TOKEN=ваш_токен_из_botfather
TELEGRAM_BOT_USERNAME=repdaybot
SECRET_KEY=сгенерируйте_случайную_строку_для_jwt
```

### 4. Frontend

```bash
cd ../frontend
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install
npm run build
```

### 5. Systemd сервис для backend

```bash
sudo cp /var/www/repdaybot/repday-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable repday-backend
sudo systemctl start repday-backend
sudo systemctl status repday-backend
```

### 6. Nginx конфиг

```bash
sudo cp /var/www/repdaybot/nginx.conf /etc/nginx/sites-available/repdaybot
sudo ln -s /etc/nginx/sites-available/repdaybot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL сертификат (Let's Encrypt)

```bash
sudo certbot --nginx -d task-man.ru -d www.task-man.ru
```

Certbot автоматически обновит nginx конфиг для HTTPS.

### 8. Webhook бота

После получения SSL:

```bash
curl "https://api.telegram.org/bot<ВАШ_ТОКЕН>/setWebhook?url=https://task-man.ru/telegram/webhook"
```

### 9. Настройка Mini App в BotFather

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/newapp` → выберите `@repdaybot`
3. Укажите:
   - Title: `RepDay`
   - Short name: `repday`
   - Description: `Групповые челленджи с количественными целями`
   - Photo: (опционально)
   - Web App URL: `https://task-man.ru`

## Логи и отладка

```bash
# Логи backend
sudo journalctl -u repday-backend -f

# Логи nginx
sudo tail -f /var/log/nginx/error.log

# Перезапуск backend
sudo systemctl restart repday-backend
```

## Обновление кода

```bash
cd /var/www/repdaybot
git pull
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart repday-backend
cd ../frontend
npm install
npm run build
sudo systemctl reload nginx
```
