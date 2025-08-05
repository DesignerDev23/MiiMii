#!/bin/bash

# MiiMii Fintech Platform - Digital Ocean Environment Setup Script
echo "🚀 MiiMii Fintech Platform - Digital Ocean Environment Variables"
echo "=================================================================="
echo ""
echo "Copy these environment variables to your Digital Ocean App Platform:"
echo ""

cat << 'EOF'
PORT=3000
NODE_ENV=production
DB_CONNECTION_URL=postgresql://doadmin:AVNS_J9gjpWqQnV9WTaTwtXH@miimiidb-do-user-20025867-0.f.db.ondigitalocean.com:25060/defaultdb?sslmode=require
DB_HOST=miimiidb-do-user-20025867-0.f.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=defaultdb
DB_USER=doadmin
DB_PASSWORD=AVNS_J9gjpWqQnV9WTaTwtXH
APP_SECRET=811373a9ea95ccb89c4ecdda1f57a18e4f5272da33726a7e9c38d9491e03e519a1f811a03718f050b40c59fc493a1712ad08024fb95108e029fc717edfab549c
JWT_EXPIRES_IN=30d
BOT_ACCESS_TOKEN=EAAXQZBHvBuxgBPN2hO6wDaC2TnX2W2Tq2QnjHEYW9r9qmoCzJBa0fEZBJp8XXpiZBeCx6xqalX5PJ1WrAqENxMAyq3LsuqkPEZBJ4fsPGKTKoHSoOC26hDBhzY68hwLDM0RzE5wNAlJS3bPUZAkRsj2khewZB7l1a7OGZAIrhzhaIlQ6WqZBr95RrQhKGiKwdTaVhX2mLbZCrHnlnk4Mv
BOT_PHONE_NUMBER_ID=755450640975332
BOT_BUSINESS_ACCOUNT_ID=1722871389103605
BOT_WEBHOOK_VERIFY_TOKEN=your-webhook-verify-token
BANK_CONSUMER_KEY=1c2ea8d82c7661742d2e85a3e82f7819
BANK_CONSUMER_SECRET=test_1740939cfe01dff11619541bab1716c0757342dbf60951dd8ba8f1094386457e
PROVIDER_USERNAME=your-bilal-username
PROVIDER_PASSWORD=your-bilal-password
BILAL_API_KEY=your-bilal-api-key
DOJAH_APP_ID=your-dojah-app-id
DOJAH_SECRET_KEY=your-dojah-secret-key
DOJAH_PUBLIC_KEY=your-dojah-public-key
AI_API_KEY=your-openai-api-key-here
AI_MODEL=gpt-4-turbo
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
REDIS_URL=redis://localhost:6379
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/
WEBHOOK_SECRET=bd39e45bd67e5cee631eb014550ff6b3e4acba897ee066a65d45c2c43395a7bd
ADMIN_EMAIL=admin@miimii.com
ADMIN_PASSWORD=admin-password-here
TRANSFER_FEE_PERCENTAGE=0.5
PLATFORM_FEE=5
BELLBANK_FEE=20
MAINTENANCE_FEE=100
DATA_PURCHASE_FEE=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BASE_URL=https://api.chatmiimii.com
EOF

echo ""
echo "=================================================================="
echo ""
echo "🔧 IMPORTANT NOTES:"
echo "1. These environment variables are configured for Digital Ocean App Platform"
echo "2. Database URL includes SSL mode as required by DigitalOcean Managed PostgreSQL"
echo "3. Redis URL is set to localhost - you may need to configure a managed Redis"
echo "4. WhatsApp webhook verify token should match your Facebook App settings"
echo "5. All API keys should be verified and active"
echo ""
echo "📋 DEPLOYMENT STEPS:"
echo "1. Go to Digital Ocean App Platform dashboard"
echo "2. Navigate to your app's Settings > Environment Variables"
echo "3. Add each variable above"
echo "4. Deploy the application"
echo "5. Test endpoints at https://api.chatmiimii.com"
echo ""
echo "🔗 WEBHOOK ENDPOINTS:"
echo "WhatsApp: https://api.chatmiimii.com/webhook/whatsapp"
echo "BellBank: https://api.chatmiimii.com/webhook/bellbank"
echo "Bilal: https://api.chatmiimii.com/webhook/bilal"
echo "Dojah: https://api.chatmiimii.com/webhook/dojah"
echo ""
echo "=================================================================="