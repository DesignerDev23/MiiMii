# MiiMii Mobile Backend

Independent Node.js server for the MiiMii mobile app backend API.

## Overview

This is a completely separate, independent server dedicated to serving the mobile app. It contains all mobile app services, routes, and dependencies, and runs independently from the main WhatsApp/web backend.

## Features

- Complete mobile app API endpoints
- User authentication and authorization
- Wallet management
- Bank transfers
- Airtime and data purchases
- Bill payments
- Beneficiary management
- Notifications
- Support tickets
- Account statements
- In-app chat bot

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=3001
MOBILE_PORT=3001
HOST=0.0.0.0

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT
MOBILE_JWT_SECRET=your_mobile_jwt_secret
APP_SECRET=your_app_secret

# Redis (Optional)
REDIS_URL=your_redis_url

# Rubies Banking API
RUBIES_API_KEY=your_rubies_api_key
RUBIES_WEBHOOK_SECRET=your_webhook_secret

# WhatsApp (for account linking OTP)
BOT_ACCESS_TOKEN=your_whatsapp_token
BOT_PHONE_NUMBER_ID=your_phone_number_id

# AI (OpenAI)
AI_API_KEY=your_openai_key
AI_MODEL=gpt-4o-mini

# CORS
MOBILE_CORS_ORIGINS=https://app.miimii.com,https://miimii.app
ALLOW_ALL_ORIGINS=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

All endpoints are prefixed with `/api/mobile`:

- `POST /api/mobile/auth/signup` - User registration
- `POST /api/mobile/auth/login` - User login
- `POST /api/mobile/auth/refresh` - Refresh token
- `GET /api/mobile/me` - Get user profile
- `GET /api/mobile/me/wallet` - Get wallet balance
- `POST /api/mobile/transfers` - Bank transfer
- `POST /api/mobile/airtime/purchase` - Purchase airtime
- `POST /api/mobile/data/purchase` - Purchase data
- `POST /api/mobile/bills/pay` - Pay bills
- And many more...

See the Postman collection for complete API documentation.

## Health Checks

- `GET /healthz` - Simple health check
- `GET /health` - Comprehensive health check with service status

## Architecture

```
mobile-backend/
├── src/
│   ├── app.js              # Main application entry point
│   ├── routes/
│   │   └── mobile.js       # All mobile API routes
│   ├── middleware/
│   │   ├── mobileAuth.js   # JWT authentication middleware
│   │   └── errorHandler.js # Error handling middleware
│   ├── services/           # All business logic services
│   ├── models/             # Database models
│   ├── database/           # Database connection and migrations
│   ├── config/             # Configuration management
│   └── utils/              # Utility functions
├── package.json
└── README.md
```

## Notes

- This server runs independently on port 3001 by default (configurable via `MOBILE_PORT`)
- All mobile app services are self-contained in this directory
- Shares the same database (Supabase) as the main backend
- Can be deployed separately for better scalability and isolation

