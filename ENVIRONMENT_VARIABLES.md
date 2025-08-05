# Environment Variables for Digital Ocean App Platform

Set these environment variables in your Digital Ocean App Platform UI:

## WhatsApp Configuration
```
BOT_ACCESS_TOKEN=your-whatsapp-access-token
BOT_PHONE_NUMBER_ID=your-phone-number-id
BOT_BUSINESS_ACCOUNT_ID=your-business-account-id
BOT_WEBHOOK_VERIFY_TOKEN=your-webhook-verify-token
```

## Database Configuration
```
DB_CONNECTION_URL=your-database-connection-url
DB_HOST=your-database-host
DB_PORT=your-database-port
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
```

## JWT Configuration
```
APP_SECRET=your-jwt-secret
JWT_EXPIRES_IN=30d
```

## Bellbank Configuration
```
BANK_CONSUMER_KEY=your-bellbank-consumer-key
BANK_CONSUMER_SECRET=your-bellbank-consumer-secret
```

## Bilal Configuration
```
PROVIDER_USERNAME=your-bilal-username
PROVIDER_PASSWORD=your-bilal-password
BILAL_API_KEY=your-bilal-api-key
```

## Dojah Configuration
```
DOJAH_APP_ID=your-dojah-app-id
DOJAH_SECRET_KEY=your-dojah-secret-key
DOJAH_PUBLIC_KEY=your-dojah-public-key
```

## OpenAI Configuration
```
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4-turbo
```

## Server Configuration
```
PORT=3000
NODE_ENV=production
BASE_URL=https://api.chatmiimii.com
```

## Fees Configuration
```
TRANSFER_FEE_PERCENTAGE=0.5
PLATFORM_FEE=5
BELLBANK_FEE=20
MAINTENANCE_FEE=100
DATA_PURCHASE_FEE=10
```

## Rate Limiting
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Other Configuration
```
WEBHOOK_SECRET=your-webhook-secret
ADMIN_EMAIL=admin@miimii.com
ADMIN_PASSWORD=your-admin-password
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/
REDIS_URL=your-redis-url
```

## Important Notes:
1. Replace all `your-*` values with your actual credentials
2. Make sure to set these in the Digital Ocean App Platform UI
3. The app will only read from environment variables, no local .env files
4. All sensitive data should be stored in Digital Ocean's environment variables

