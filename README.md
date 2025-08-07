# MiiMii - WhatsApp Fintech Platform

A comprehensive WhatsApp-based fintech assistant platform built with Node.js, integrating AI/NLP for natural language processing, multiple payment providers, and advanced features like voice transcription and OCR.

## 🚀 Features

### Core Functionality
- **AI-Powered Assistant**: Natural language understanding via OpenAI GPT-4
- **WhatsApp Integration**: Native WhatsApp Business API (not third-party)
- **Multi-Modal Input**: Text, voice notes, and image processing
- **Virtual Banking**: BellBank integration for virtual accounts and transfers
- **Bill Payments**: Bilal integration for airtime, data, and utility bills
- **KYC Verification**: Dojah integration for identity verification
- **OCR Processing**: Tesseract for extracting text from bank documents
- **Voice Transcription**: Google Cloud Speech-to-Text

### Technical Features
- **Production-Ready**: Scalable architecture with proper error handling
- **Security**: JWT authentication, webhook verification, rate limiting
- **Admin Dashboard**: Complete management interface
- **Fee Management**: Configurable fee structures
- **Logging & Monitoring**: Comprehensive logging with Winston
- **Database**: PostgreSQL with Sequelize ORM

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   WhatsApp      │    │   MiiMii     │    │   External      │
│   Business API  │◄───┤   Platform   ├───►│   Services      │
└─────────────────┘    └──────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
              ┌──────▼───┐ ┌───▼───┐ ┌───▼────┐
              │PostgreSQL│ │ Redis │ │ Logs   │
              └──────────┘ └───────┘ └────────┘
```

### External Integrations
- **BellBank**: Virtual accounts and bank transfers
- **Bilal**: Airtime, data, and utility bill payments
- **Dojah**: KYC and identity verification
- **OpenAI**: AI/NLP for intent recognition
- **Google Cloud**: Speech-to-text transcription
- **WhatsApp Business API**: Message handling

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 7+ (optional, for caching)
- API keys for:
  - WhatsApp Business API
  - BellBank
  - Bilal
  - Dojah
  - OpenAI
  - Google Cloud Speech (optional)

## 🛠️ Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-username/miimii-platform.git
cd miimii-platform
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Database Setup
```bash
# Create database
createdb miimii_db

# Run migrations
npm run migrate
```

### 5. Start Development Server
```bash
npm run dev
```

## 🔧 Configuration

### Environment Variables

#### Required
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/miimii_db

# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# BellBank API
BELLBANK_API_URL=https://api.bellmfb.com
BELLBANK_API_KEY=your_api_key
BELLBANK_MERCHANT_ID=your_merchant_id

# Bilal API
BILAL_API_URL=https://app.bilalsadasub.com/api
BILAL_API_KEY=your_api_key

# Dojah KYC
DOJAH_API_URL=https://api.dojah.io
DOJAH_APP_ID=your_app_id
DOJAH_SECRET_KEY=your_secret

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
```

#### Optional
```env
# Google Cloud Speech (for voice transcription)
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Redis (for caching)
REDIS_URL=redis://localhost:6379

# Fees Configuration
TRANSFER_FEE_PERCENTAGE=0.5
PLATFORM_FEE=5
BELLBANK_FEE=20
MAINTENANCE_FEE=100
DATA_PURCHASE_FEE=10
```

## 🚀 Deployment

### DigitalOcean App Platform (Recommended)

This application is optimized for DigitalOcean App Platform with Managed Databases.

1. **Prerequisites**
   - GitHub repository with your code
   - DigitalOcean account

2. **Create App**
   ```bash
   # Push your code to GitHub
   git push origin main
   ```

3. **Deploy via App Platform**
   - Go to DigitalOcean App Platform console
   - Create new app from GitHub repository
   - Use the provided `.digitalocean/app.yaml` configuration
   - App Platform will automatically:
     - Create PostgreSQL managed database
     - Create Redis managed database
     - Set up autoscaling (1-5 instances)
     - Configure health checks

4. **Environment Variables**
   Set these in DigitalOcean App Platform dashboard:
   ```env
   JWT_SECRET=your-secure-jwt-secret
   WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
   WHATSAPP_PHONE_NUMBER_ID=your-phone-id
   WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-id
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-verify-token
   BELLBANK_API_URL=https://api.bellbank.com
   BELLBANK_API_KEY=your-bellbank-api-key-here
   BELLBANK_MERCHANT_ID=your-merchant-id
   BILAL_API_URL=https://api.bilal.com
   BILAL_API_KEY=your-bilal-api-key-here
   BILAL_MERCHANT_ID=your-bilal-merchant-id
   DOJAH_API_URL=https://api.dojah.io
   DOJAH_APP_ID=your-dojah-app-id
   DOJAH_SECRET_KEY=your-dojah-secret
   OPENAI_API_KEY=your-openai-api-key-here
   WEBHOOK_SECRET=your-webhook-secret
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_PASSWORD=secure-admin-password
   ```

5. **Post-Deployment Setup**
   - Configure WhatsApp webhook URL: `https://your-app.ondigitalocean.app/webhook/whatsapp`
   - Set up other provider webhooks as needed
   - Test application health: `https://your-app.ondigitalocean.app/health`

6. **Monitoring**
   - App Platform provides built-in monitoring
   - Redis and PostgreSQL have separate monitoring dashboards
   - Check logs in App Platform console

### Docker Deployment
```bash
# Build image
docker build -t miimii-platform .

# Run container
docker run -d \
  --name miimii \
  -p 3000:3000 \
  --env-file .env \
  miimii-platform
```

## 📖 API Documentation

### WhatsApp Integration

#### Webhook Endpoint
```http
POST /webhook/whatsapp
```

#### Send Message
```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
  "to": "2348012345678",
  "message": "Hello from MiiMii!"
}
```

### User Management

#### Get User Balance
```http
GET /api/wallet/balance/08012345678
```

#### User Transactions
```http
GET /api/wallet/transactions/08012345678?limit=10
```

### Admin Operations

#### Dashboard Overview
```http
GET /api/admin/dashboard
```

#### Manage Users
```http
GET /api/admin/users?page=1&limit=20&search=john
POST /api/admin/users/:userId/ban
POST /api/admin/users/:userId/unban
```

#### Transaction Management
```http
GET /api/admin/transactions?status=pending
PATCH /api/transactions/:reference/status
```

## 🤖 AI Integration

### Supported Commands

Users can interact naturally with MiiMii using these patterns:

**Money Transfers**
- "Send 5000 to John 08012345678"
- "Transfer 10k to my brother 08098765432"

**Airtime Purchase**
- "Buy 1000 airtime"
- "Buy 500 airtime for 08012345678"

**Data Purchase**
- "Buy 2GB data"
- "Get 1GB data for 08098765432"

**Balance & History**
- "What's my balance?"
- "Check balance"
- "Show my transactions"

**Utility Bills**
- "Pay PHCN bill for meter 12345678"
- "Pay DStv bill for 1234567890"

### Voice & Image Support

**Voice Messages**: Automatically transcribed and processed
**Images**: OCR extraction for bank details, receipts, etc.

## 💳 Fee Structure

### Incoming Transfers
- ₦0 - ₦500: Free
- Above ₦1,000: 0.5% of amount

### Outgoing Transfers
- MiiMii → MiiMii: Free
- Bank transfers: ₦25 (₦20 BellBank + ₦5 platform)

### Services
- Airtime/Data: ₦10 fee
- Utility bills: Standard provider fees
- Monthly maintenance: ₦100

## 🔒 Security Features

- **Webhook Verification**: All incoming webhooks are verified
- **Rate Limiting**: API endpoints are rate-limited
- **PIN Protection**: 4-digit PIN for transactions
- **KYC Compliance**: Required for financial operations
- **Audit Logging**: All operations are logged
- **Data Encryption**: Sensitive data is encrypted

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Test specific endpoint
curl -X GET http://localhost:3000/health
```

## 📊 Monitoring

### Health Check
```http
GET /health
```

### Logs
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Winston logger with structured JSON logging

### Admin Dashboard
Access the admin interface at `/admin` to monitor:
- User activities
- Transaction volumes
- System health
- Webhook logs

## 🔧 Maintenance

### Database Maintenance
```bash
# Run migrations
npm run migrate

# Backup database
pg_dump miimii_db > backup.sql
```

### Cron Jobs
The platform includes automated maintenance:
- Monthly maintenance fee charging
- Cleanup of old logs
- Health checks

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For technical support or questions:
- Email: support@miimii.com
- Documentation: [docs.miimii.com](https://docs.miimii.com)
- Issues: [GitHub Issues](https://github.com/your-username/miimii-platform/issues)

## 🗺️ Roadmap

- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Mobile app companion
- [ ] Cryptocurrency integration
- [ ] Loan and savings features
- [ ] Merchant payment processing
- [ ] International transfers

---

**Built with ❤️ for the Nigerian fintech ecosystem**