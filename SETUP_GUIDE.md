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
# From BellBank developer dashboard
BELLBANK_CONSUMER_KEY=your_consumer_key_here
BELLBANK_CONSUMER_SECRET=your_consumer_secret_here
```

**Important**: BellBank uses a token-based authentication system. You'll use your `consumerKey` and `consumerSecret` to generate temporary access tokens (valid for up to 48 hours).

### Step 4: Webhook Configuration
Configure webhook URL in BellBank dashboard:
- **URL**: `https://your-domain.com/webhook/bellbank`
- **Events**: `virtual_account.credit`, `transfer.completed`, `transfer.failed`

### Key BellBank Features to Implement:
```javascript
// 1. Generate Access Token
POST /v1/generate-token
Headers: {
  "consumerKey": "your_consumer_key",
  "consumerSecret": "your_consumer_secret", 
  "validityTime": "2880" // 48 hours in minutes
}

// 2. Create Virtual Account (Individual)
POST /v1/account/clients/individual
{
  "firstname": "John",
  "lastname": "Doe", 
  "middlename": "Smith",
  "phoneNumber": "08012345678",
  "address": "123 Main Street",
  "bvn": "12345678901",
  "gender": "male",
  "dateOfBirth": "1993/12/29",
  "metadata": {}
}

// 3. Bank Transfer
POST /v1/transfer
{
  "beneficiaryBankCode": "000013",
  "beneficiaryAccountNumber": "0123456789",
  "narration": "Transfer from MiiMii",
  "amount": 5000,
  "reference": "MIIMII_1234567890ABC",
  "senderName": "MiiMii User"
}

// 4. Account Name Enquiry
POST /v1/transfer/name-enquiry
{
  "bankCode": "000013",
  "accountNumber": "0123456789"
}

// 5. Get Bank List
GET /v1/transfer/banks

// 6. Transaction Status Query
GET /v1/transactions/reference/{reference}
```

### BellBank API Endpoints:
- **Sandbox**: `https://sandbox-baas-api.bellmfb.com`
- **Production**: `https://baas-api.bellmfb.com`

### 📖 Documentation
- [BellBank API Docs](https://docs.bellmfb.com/)
- [Virtual Accounts Guide](https://docs.bellmfb.com/virtual-accounts)
- [Transfers API](https://docs.bellmfb.com/transfers)

---

## 3. 📡 Bilal Integration Setup

### Understanding Bilal Services
Bilal provides airtime, data bundles, and cable subscription services across Nigerian networks through their REST API.

### Step 1: Bilal Account Registration
1. Visit [BilalSadaSub](https://bilalsadasub.com/)
2. Click "Register" and create account
3. Complete email verification
4. Fill profile information

### Step 2: Account Verification
1. Upload required documents:
   - Valid ID (National ID, Driver's License, etc.)
   - Utility bill (for address verification)
   - Business registration (if applicable)
2. Wait for verification (1-2 business days)

### Step 3: Get API Credentials
```env
# Your Bilal login credentials are used for API access
BILAL_USERNAME=your_bilal_username
BILAL_PASSWORD=your_bilal_password
```

**Important**: Bilal uses Basic Authentication with your username and password to generate access tokens.

### Step 4: Wallet Funding
1. Fund your Bilal wallet via bank transfer or other methods
2. Minimum funding: ₦1,000
3. Note: This will be your float for purchasing services

### Step 5: Configure Webhook (Optional)
1. Set your callback URL in the Bilal dashboard
2. URL format: `https://your-domain.com/webhook/bilal`
3. Bilal will send transaction status updates to this URL

### Key Bilal Features to Implement:
```javascript
// 1. Generate Access Token
POST /api/user
Headers: {
  "Authorization": "Basic " + base64("username:password")
}

// 2. Buy Airtime  
POST /api/topup
{
  "network": 1,        // 1=MTN, 2=AIRTEL, 3=GLO, 4=9MOBILE
  "phone": "08012345678",
  "plan_type": "VTU",
  "amount": 100,
  "bypass": false,
  "request-id": "Airtime_123456789"
}

// 3. Buy Data
POST /api/data
{
  "network": 1,        // 1=MTN, 2=AIRTEL, 3=GLO, 4=9MOBILE
  "phone": "08012345678", 
  "data_plan": 1,      // Plan ID (1=500MB, 2=1GB, etc.)
  "bypass": false,
  "request-id": "Data_123456789"
}

// 4. Pay Cable Subscription
POST /api/cable
{
  "cable": 2,          // 1=GOTV, 2=DSTV, 3=STARTIME
  "iuc": "0123456789",
  "cable_plan": 1,     // Plan ID
  "bypass": false,
  "request-id": "Cable_123456789"
}
```

### Bilal API Endpoints:
- **Base URL**: `https://bilalsadasub.com/api`

### Network IDs:
- **MTN**: 1
- **AIRTEL**: 2  
- **GLO**: 3
- **9MOBILE**: 4

### Cable Provider IDs:
- **GOTV**: 1
- **DSTV**: 2
- **STARTIME**: 3

### 📖 Documentation
- [Bilal Website](https://bilalsadasub.com/)
- Contact them directly for detailed API documentation

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

### Step 3: Create Application
1. Go to "My Apps" section in dashboard
2. Click "Create App"
3. Fill in application details
4. Get your App ID and Secret Key

### Step 4: Get API Credentials
```env
# From Dojah dashboard → My Apps
DOJAH_APP_ID=your_app_id_here
DOJAH_SECRET_KEY=your_secret_key_here
```

**Important**: Dojah provides separate credentials for Sandbox and Live environments. You can toggle between them in the dashboard.

### Step 5: Configure Webhook (Optional)
- **URL**: `https://your-domain.com/webhook/dojah`
- **Events**: Custom webhook events as needed

### Key Dojah Features to Implement:
```javascript
// BVN Validation (Basic)
GET /api/v1/kyc/bvn?bvn=22222222222
Headers: {
  "AppId": "your_app_id",
  "Authorization": "your_secret_key"
}

// BVN Validation with Name and DOB Matching
GET /api/v1/kyc/bvn?bvn=22222222222&first_name=John&last_name=Doe&dob=1990-01-01
Headers: {
  "AppId": "your_app_id",
  "Authorization": "your_secret_key"
}
```

**Expected Response:**
```json
{
  "entity": {
    "bvn": {
      "value": "22222222222",
      "status": true
    },
    "first_name": {
      "confidence_value": 100,
      "status": true
    },
    "last_name": {
      "confidence_value": 95,
      "status": true
    },
    "dob": {
      "confidence_value": 100,
      "status": true
    }
  }
}
```

### Dojah API Endpoints:
- **Sandbox**: `https://sandbox.dojah.io`
- **Production**: `https://api.dojah.io`

### Test Credentials for Sandbox:
- **Test BVN**: `22222222222`

**Note**: The confidence_value indicates how closely the provided information matches the BVN record (0-100%). Status indicates if the validation was successful.

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