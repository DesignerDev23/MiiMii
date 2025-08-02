# 🚀 MiiMii Platform - Complete Setup Guide

This guide will walk you through obtaining all necessary credentials and setting up each service integration for the MiiMii platform.

## 📋 Prerequisites Checklist

Before starting, ensure you have:
- [ ] A valid Nigerian phone number for business verification
- [ ] Business registration documents (CAC certificate)
- [ ] Bank account for business operations
- [ ] Valid government-issued ID
- [ ] Email address for business communications

---

## 1. 📱 WhatsApp Business API Setup

### Step 1: Facebook Business Account
1. Go to [Facebook Business](https://business.facebook.com/)
2. Click "Create Account" and fill in your business details
3. Verify your business with official documents
4. Complete business verification (may take 1-3 days)

### Step 2: WhatsApp Business API Access
1. Visit [Facebook Developers](https://developers.facebook.com/)
2. Create a new app → Select "Business" → "WhatsApp"
3. Go to WhatsApp → Getting Started
4. Add a phone number (must be different from your personal WhatsApp)
5. Verify the phone number via SMS/call

### Step 3: Get Required Credentials
```env
# From WhatsApp → Getting Started page
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
WHATSAPP_BUSINESS_ACCOUNT_ID=1234567890123456

# From WhatsApp → Configuration → Access tokens
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxx

# Create your own secure token for webhook verification
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_secure_random_string_here
```

### Step 4: Configure Webhooks
1. In WhatsApp configuration, add webhook URL:
   - **URL**: `https://your-domain.com/webhook/whatsapp`
   - **Verify Token**: Use the token from step 3
2. Subscribe to webhook fields: `messages`, `message_deliveries`

### 📖 Documentation
- [WhatsApp Business API Guide](https://developers.facebook.com/docs/whatsapp)
- [Getting Started](https://developers.facebook.com/docs/whatsapp/getting-started)

---

## 2. 🏦 BellBank Integration Setup

### Understanding BellBank Services
BellBank provides virtual account services and bank transfer capabilities. Based on their documentation structure, here's how to integrate:

### Step 1: BellBank Account Registration
1. Visit [BellBank Developer Portal](https://docs.bellmfb.com/)
2. Click "Get Started" or "Register"
3. Fill out business registration form:
   - Business name and CAC number
   - Contact information
   - Bank account details
   - Business documents upload

### Step 2: API Access Request
1. Submit API access request with:
   - Business use case description
   - Expected transaction volume
   - Integration timeline
2. Wait for approval (typically 3-5 business days)
3. Complete KYB (Know Your Business) verification

### Step 3: Get API Credentials
After approval, you'll receive:
```env
BELLBANK_API_URL=https://api.bellmfb.com/v1
BELLBANK_API_KEY=your_api_key_here
BELLBANK_MERCHANT_ID=your_merchant_id
```

### Step 4: Webhook Configuration
Configure webhook URL in BellBank dashboard:
- **URL**: `https://your-domain.com/webhook/bellbank`
- **Events**: `virtual_account.credit`, `transfer.completed`, `transfer.failed`

### Key BellBank Features to Implement:
```javascript
// Virtual Account Creation
POST /virtual-accounts
{
  "customer_id": "user_uuid",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "08012345678"
}

// Bank Transfer
POST /transfers
{
  "amount": 5000,
  "recipient_bank_code": "058",
  "recipient_account_number": "0123456789",
  "recipient_name": "Jane Doe",
  "narration": "Transfer from MiiMii"
}

// Account Validation
POST /account-validation
{
  "bank_code": "058",
  "account_number": "0123456789"
}
```

### 📖 Documentation
- [BellBank API Docs](https://docs.bellmfb.com/)
- [Virtual Accounts Guide](https://docs.bellmfb.com/virtual-accounts)
- [Transfers API](https://docs.bellmfb.com/transfers)

---

## 3. 📡 Bilal Integration Setup

### Understanding Bilal Services
Bilal provides airtime, data bundles, and utility bill payment services across Nigerian networks.

### Step 1: Bilal Account Registration
1. Visit [Bilal Dashboard](https://app.bilalsadasub.com/)
2. Click "Register" and create account
3. Complete email verification
4. Fill business profile information

### Step 2: Account Verification
1. Upload required documents:
   - Valid ID (National ID, Driver's License, etc.)
   - Utility bill (for address verification)
   - Business registration (if applicable)
2. Wait for verification (1-2 business days)

### Step 3: API Access
1. Navigate to "API Documentation" section
2. Generate API credentials in dashboard
3. Copy your credentials:

```env
BILAL_API_URL=https://app.bilalsadasub.com/api/v1
BILAL_API_KEY=your_api_key_here
BILAL_MERCHANT_ID=your_merchant_id
```

### Step 4: Wallet Funding
1. Fund your Bilal wallet via bank transfer
2. Minimum funding: ₦1,000
3. Note: This will be your float for purchasing services

### Key Bilal Features to Implement:
```javascript
// Get Available Services
GET /services

// Buy Airtime
POST /airtime
{
  "network": "MTN",
  "phone": "08012345678",
  "amount": 1000
}

// Buy Data
POST /data
{
  "network": "MTN", 
  "phone": "08012345678",
  "plan_id": "mtn_1gb_30days"
}

// Pay Utility Bill
POST /utility
{
  "service": "phcn",
  "meter_number": "12345678901",
  "amount": 5000
}
```

### 📖 Documentation
- [Bilal API Documentation](https://app.bilalsadasub.com/documentation/home)
- [Service Integration Guide](https://app.bilalsadasub.com/documentation/api)

---

## 4. 🔐 Dojah KYC Integration Setup

### Step 1: Dojah Account Registration
1. Visit [Dojah](https://dojah.io/)
2. Click "Get Started" or "Sign Up"
3. Choose "Developer" account type
4. Complete business registration

### Step 2: Business Verification
1. Upload business documents:
   - CAC certificate
   - Tax identification number
   - Business bank statement
2. Complete compliance questionnaire
3. Wait for verification (2-5 business days)

### Step 3: Get API Credentials
```env
DOJAH_API_URL=https://api.dojah.io/api/v1
DOJAH_APP_ID=your_app_id
DOJAH_SECRET_KEY=your_secret_key
```

### Step 4: Configure Webhook
- **URL**: `https://your-domain.com/webhook/dojah`
- **Events**: `kyc.verified`, `kyc.rejected`

### Key Dojah Features:
```javascript
// BVN Verification
POST /kyc/bvn
{
  "bvn": "12345678901"
}

// Phone Number Verification
POST /kyc/phone
{
  "phone": "08012345678"
}

// Document Verification
POST /kyc/document
{
  "type": "drivers_license",
  "number": "ABC123456789"
}
```

### 📖 Documentation
- [Dojah API Documentation](https://docs.dojah.io/)
- [KYC Integration Guide](https://docs.dojah.io/kyc/introduction)

---

## 5. 🤖 OpenAI Setup

### Step 1: OpenAI Account
1. Visit [OpenAI](https://platform.openai.com/)
2. Sign up or log in
3. Complete phone verification

### Step 2: API Key Generation
1. Go to [API Keys](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy and save the key immediately (you won't see it again)

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4-turbo
```

### Step 3: Billing Setup
1. Add payment method in billing section
2. Set usage limits to control costs
3. Recommended limit: $50/month for testing

### 📖 Documentation
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Pricing](https://openai.com/pricing)

---

## 6. 🎙️ Google Cloud Speech Setup (Optional)

### Step 1: Google Cloud Account
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create account and enable billing
3. Get $300 free credits for new accounts

### Step 2: Enable Speech-to-Text API
1. Create new project or select existing
2. Go to "APIs & Services" → "Library"
3. Search for "Cloud Speech-to-Text API"
4. Click "Enable"

### Step 3: Create Service Account
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Fill in service account details
4. Download JSON key file

```env
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
```

### 📖 Documentation
- [Speech-to-Text Documentation](https://cloud.google.com/speech-to-text/docs)

---

## 7. 🗃️ Database Setup

### Option 1: Local PostgreSQL
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE miimii_db;
CREATE USER miimii_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE miimii_db TO miimii_user;
\q
```

### Option 2: Cloud Database (Recommended for Production)
- **DigitalOcean Managed Database**
- **AWS RDS PostgreSQL**
- **Google Cloud SQL**
- **ElephantSQL** (free tier available)

```env
DATABASE_URL=postgresql://username:password@host:port/database_name
```

---

## 8. 🔄 Redis Setup (Optional)

### Local Redis
```bash
# Install Redis (Ubuntu/Debian)
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Cloud Redis
- **DigitalOcean Managed Redis**
- **AWS ElastiCache**
- **Redis Cloud** (free tier available)

```env
REDIS_URL=redis://username:password@host:port
```

---

## 9. 🔐 Security Configuration

### JWT Secret Generation
```bash
# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Webhook Secret Generation
```bash
# Generate webhook verification secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Final Environment Configuration
```env
# Security
JWT_SECRET=your_generated_jwt_secret_here
JWT_EXPIRES_IN=30d
WEBHOOK_SECRET=your_generated_webhook_secret

# Admin Access
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=your_secure_admin_password

# App Configuration
PORT=3000
NODE_ENV=development
BASE_URL=https://your-domain.com
```

---

## 10. 🚀 Deployment Setup

### DigitalOcean App Platform
1. Push code to GitHub repository
2. Connect DigitalOcean to your GitHub
3. Use provided `.digitalocean/app.yaml` configuration
4. Set all environment variables in DO dashboard
5. Deploy and configure webhook URLs

### Domain and SSL
1. Purchase domain or use DigitalOcean's provided URL
2. SSL is automatically provided by DigitalOcean
3. Update webhook URLs in all services

---

## 🧪 Testing Your Setup

### 1. Test Database Connection
```bash
npm run migrate
```

### 2. Test WhatsApp Integration
```bash
curl -X POST http://localhost:3000/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{"to":"YOUR_PHONE_NUMBER","message":"Test from MiiMii!"}'
```

### 3. Test AI Integration
Send a WhatsApp message: "What's my balance?"

### 4. Health Check
```bash
curl http://localhost:3000/health
```

---

## 💰 Cost Estimation

### Monthly Costs (Estimated)
- **DigitalOcean App Platform**: $12-25/month
- **PostgreSQL Database**: $15/month
- **Redis**: $15/month (optional)
- **OpenAI API**: $10-50/month (usage-based)
- **Google Cloud Speech**: $5-20/month (usage-based)
- **Domain**: $10-15/year

**Total**: ~$60-130/month

---

## 🆘 Troubleshooting

### Common Issues

#### 1. WhatsApp Webhook Not Working
- Check webhook URL is publicly accessible
- Verify webhook token matches
- Check DigitalOcean logs for errors

#### 2. Database Connection Failed
- Verify DATABASE_URL format
- Check firewall settings
- Ensure database exists

#### 3. API Integration Failures
- Verify all API keys are correct
- Check API service status
- Review request/response logs

#### 4. Voice/Image Processing Issues
- Ensure ffmpeg and tesseract are installed
- Check file upload permissions
- Verify Google Cloud credentials

### Getting Help
- Check logs: `tail -f logs/combined.log`
- Enable debug mode: `NODE_ENV=development`
- Test individual API endpoints
- Review service provider documentation

---

## 📞 Support Contacts

### Service Providers
- **BellBank Support**: support@bellmfb.com
- **Bilal Support**: Available via their dashboard
- **Dojah Support**: support@dojah.io
- **WhatsApp Business**: Facebook Business Support
- **OpenAI**: platform.openai.com/support

### Next Steps
After completing this setup, you'll have a fully functional WhatsApp fintech platform. Start with small test transactions and gradually scale up as you gain confidence in the system.

---

**🎉 Congratulations! Your MiiMii platform is now ready for production use!**