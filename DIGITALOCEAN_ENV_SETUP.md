# DigitalOcean App Platform Environment Variables Setup Guide

## 🚨 CRITICAL ISSUE FIXED

Your application was not working because:
1. **Missing runtime logs**: Logger was only writing to files, not console (DigitalOcean needs console output)
2. **Environment variables not loading**: The app.yaml used template syntax `${VARIABLE_NAME}` instead of actual values

## ✅ FIXES APPLIED

### 1. Logger Configuration Fixed
- ✅ Logger now outputs to console in production for DigitalOcean runtime logs
- ✅ Added comprehensive startup logging to debug service initialization
- ✅ Enhanced error logging with environment details

### 2. Environment Variables Configuration Fixed
- ✅ Removed template syntax from app.yaml
- ✅ Added proper placeholder values with clear instructions
- ✅ Organized variables by category with priority levels

## 🔧 HOW TO SET UP ENVIRONMENT VARIABLES IN DIGITALOCEAN

### Step 1: Access Your App Settings
1. Go to your DigitalOcean dashboard
2. Navigate to your `miimii-app` application
3. Click on **Settings** tab
4. Select **Environment Variables** from the left sidebar

### Step 2: Set Required Variables (CRITICAL)

**These variables are REQUIRED for the app to work:**

#### Database Configuration (Choose ONE option)
```bash
# Option 1: Full Connection URL (RECOMMENDED)
DB_CONNECTION_URL = postgres://username:password@host:port/database_name

# Option 2: Individual Parameters
DB_HOST = your-database-host
DB_PORT = 5432
DB_NAME = your-database-name
DB_USER = your-database-username
DB_PASSWORD = your-database-password
```

#### JWT Authentication (REQUIRED)
```bash
APP_SECRET = your-32-character-secret-key
JWT_EXPIRES_IN = 30d
```

#### WhatsApp Configuration (REQUIRED for WhatsApp features)
```bash
BOT_ACCESS_TOKEN = your-whatsapp-access-token
BOT_PHONE_NUMBER_ID = your-phone-number-id
BOT_BUSINESS_ACCOUNT_ID = your-business-account-id
BOT_WEBHOOK_VERIFY_TOKEN = your-webhook-verify-token
```

### Step 3: Set Banking & Payment Variables (REQUIRED for payments)

```bash
# Banking Configuration
BANK_CONSUMER_KEY = your-bellbank-consumer-key
BANK_CONSUMER_SECRET = your-bellbank-consumer-secret

# Provider Configuration
PROVIDER_USERNAME = your-bilal-username
PROVIDER_PASSWORD = your-bilal-password
BILAL_API_KEY = your-bilal-api-key
```

### Step 4: Set AI & KYC Variables (REQUIRED for AI/KYC features)

```bash
# AI Configuration
AI_API_KEY = your-openai-api-key
AI_MODEL = gpt-4-turbo

# KYC Configuration
DOJAH_APP_ID = your-dojah-app-id
DOJAH_SECRET_KEY = your-dojah-secret-key
DOJAH_PUBLIC_KEY = your-dojah-public-key
```

### Step 5: Set Optional Variables (Recommended)

```bash
# Redis (for caching - optional but recommended)
REDIS_URL = redis://your-redis-url

# Admin Configuration
ADMIN_EMAIL = admin@miimii.com
ADMIN_PASSWORD = your-secure-admin-password

# Webhook Security
WEBHOOK_SECRET = your-webhook-secret-key

# Logging
LOG_LEVEL = info
```

## 🔍 HOW TO SET VARIABLES IN DIGITALOCEAN UI

For each variable above:

1. Click **"Add Variable"** button
2. Enter the **Key** (e.g., `DB_CONNECTION_URL`)
3. Enter the **Value** (your actual credential/configuration)
4. Set **Scope** to **"Run and Build Time"**
5. Click **"Save"**

## 🚀 DEPLOYMENT STEPS

After setting up all required environment variables:

1. **Trigger a new deployment**:
   - Go to your app's **"Deployments"** tab
   - Click **"Create Deployment"**
   - Select your latest commit
   - Click **"Deploy"**

2. **Monitor the logs**:
   - Go to **"Runtime Logs"** tab
   - You should now see detailed startup logs like:
   ```
   ✅ MiiMii Fintech Platform server started successfully on 0.0.0.0:3000
   📡 Server is ready to accept connections
   🏥 Health check available at: /healthz
   ```

## 🔧 VERIFICATION CHECKLIST

After deployment, verify these in your runtime logs:

- [ ] Server starts successfully on port 3000
- [ ] Environment variables status shows `true` for required configs
- [ ] Database connection established (if configured)
- [ ] Redis connection established (if configured)
- [ ] Health check endpoint responds at `/healthz`

## 🚨 TROUBLESHOOTING

### If you still don't see runtime logs:
1. Check that you deployed after setting environment variables
2. Verify all REQUIRED variables are set with actual values (not placeholders)
3. Check the **"Build Logs"** tab for any build errors

### If the app shows as unhealthy:
1. Missing required environment variables (check the status log)
2. Database connection issues (verify DB credentials)
3. Port configuration issues (should be 3000)

### If WhatsApp features don't work:
1. Verify all BOT_* variables are set correctly
2. Check webhook URL is pointing to your DigitalOcean app
3. Verify WhatsApp webhook verification token

## 📋 ENVIRONMENT VARIABLES PRIORITY

### 🔴 CRITICAL (App won't start without these)
- `APP_SECRET`
- At least one database configuration method

### 🟡 HIGH PRIORITY (Core features won't work)
- WhatsApp configuration (BOT_*)
- Banking configuration (BANK_*)
- AI configuration (AI_*)

### 🟢 OPTIONAL (Enhanced features)
- Redis configuration
- Google Cloud credentials
- Rate limiting settings

## 🎯 NEXT STEPS

1. Set all required environment variables in DigitalOcean UI
2. Deploy your application
3. Monitor runtime logs for successful startup
4. Test your API endpoints
5. Verify WhatsApp webhook integration

Your application should now work properly with full runtime logging! 🚀