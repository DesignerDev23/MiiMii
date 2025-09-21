# Digital Ocean Environment Variables for Rubies Integration

This document provides the complete list of environment variables you need to set in your Digital Ocean App Platform for the Rubies banking services integration.

## 🔑 Required Rubies Environment Variables

Based on the actual Rubies API documentation, you need these environment variables:

```bash
# Rubies API Configuration (Required)
RUBIES_API_KEY=sk_test_YOUR_TEST_API_KEY_HERE  # For development
# OR
RUBIES_API_KEY=sk_live_YOUR_LIVE_API_KEY_HERE  # For production

RUBIES_WEBHOOK_SECRET=your_webhook_secret_here
```

**Important Notes:**
- The `RUBIES_API_KEY` should start with `sk_test_` for development or `sk_live_` for production
- This API key is used directly in the `Authorization` header
- No additional authentication steps are required

## 🔗 Webhook URL for Rubies Dashboard

Set this webhook URL in your Rubies dashboard:

```
https://your-app-domain.com/webhook/rubies
```

**Example:**
```
https://miimii-app.ondigitalocean.app/webhook/rubies
```

## 🌍 Environment Detection (Optional)
```bash
# Force specific environment (optional)
RUBIES_ENV=development  # or 'production' for production
APP_ENV=development     # Alternative environment variable
```

## 📋 Complete Environment Variables List

Here are ALL the environment variables your app currently uses. Add the Rubies ones above to your existing configuration:

### Database
```bash
DB_CONNECTION_URL=your_database_connection_string
```

### WhatsApp
```bash
BOT_ACCESS_TOKEN=your_whatsapp_access_token
BOT_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
BOT_BUSINESS_ACCOUNT_ID=your_whatsapp_business_account_id
WEBHOOK_SECRET=your_whatsapp_webhook_secret
```

### WhatsApp Flows
```bash
WHATSAPP_ONBOARDING_FLOW_ID=your_onboarding_flow_id
WELCOME_FLOW_ID=your_welcome_flow_id
WHATSAPP_LOGIN_FLOW_ID=your_login_flow_id
WHATSAPP_TRANSFER_PIN_FLOW_ID=your_transfer_pin_flow_id
DATA_PURCHASE_FLOW_ID=your_data_purchase_flow_id
FLOW_SECRET_KEY=your_flow_secret_key
```

### Rubies Banking (NEW - Add these)
```bash
# Rubies API Configuration
RUBIES_API_KEY=sk_test_YOUR_TEST_API_KEY_HERE  # Development
# OR
RUBIES_API_KEY=sk_live_YOUR_LIVE_API_KEY_HERE  # Production

RUBIES_WEBHOOK_SECRET=your_webhook_secret_here
```

### Legacy Banking (Keep for now, will be deprecated)
```bash
BANK_CONSUMER_KEY=your_bellbank_consumer_key
BANK_CONSUMER_SECRET=your_bellbank_consumer_secret
```

### Other Services
```bash
# Bilal (Airtime/Data provider)
PROVIDER_USERNAME=your_bilal_username
PROVIDER_PASSWORD=your_bilal_password
BILAL_API_KEY=your_bilal_api_key
BILAL_BASE_URL=your_bilal_base_url

# Dojah (KYC - if used)
DOJAH_APP_ID=your_dojah_app_id
DOJAH_SECRET_KEY=your_dojah_secret_key
DOJAH_PUBLIC_KEY=your_dojah_public_key

# Fincra (if used)
FINCRA_API_KEY=your_fincra_api_key
FINCRA_SECRET_KEY=your_fincra_secret_key
FINCRA_BUSINESS_ID=your_fincra_business_id

# OpenAI
AI_API_KEY=your_openai_api_key
AI_MODEL=gpt-4o-mini
```

### Application Settings
```bash
# App Configuration
NODE_ENV=production
PORT=3000
APP_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=30d

# Base URLs
BASE_URL=https://your-app-domain.com

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads/

# Redis (if used)
REDIS_URL=your_redis_url

# Admin
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password
```

### Fee Configuration
```bash
# Fee Settings
TRANSFER_FEE_PERCENTAGE=0.5
PLATFORM_FEE=5
BELLBANK_FEE=20
MAINTENANCE_FEE=100
DATA_PURCHASE_FEE=10
```

### Rate Limiting
```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🚀 Deployment Steps

1. **Add Environment Variables**: Add the Rubies environment variables to your Digital Ocean App Platform environment variables section.

2. **Set Webhook URL**: In your Rubies dashboard, set the webhook URL to:
   ```
   https://your-app-domain.com/webhook/rubies
   ```

3. **Run Database Migration**: After deployment, the BVN verification fields will be added automatically.

4. **Test BVN Validation**: Test the BVN validation in the onboarding flow to ensure it's working with Rubies.

5. **Test Transfers**: Test bank transfers and name enquiry functionality.

## 🔧 API Endpoints Used

The integration uses these Rubies API endpoints (from actual documentation):

- **Base URL (Dev)**: `https://api-sme-dev.rubies.ng/dev`
- **Base URL (Prod)**: `https://api-sme.rubies.ng` (to be confirmed)

### BVN Validation (baas-kyc)
- `POST /baas-kyc/bvnValidation`
- `POST /baas-kyc/cacValidation`
- `POST /baas-kyc/driverLicenseValidation`
- `POST /baas-kyc/ninValidation`
- `POST /baas-kyc/tinValidation`
- `POST /baas-kyc/votersCardValidation`

### Virtual Account (baas-virtual-account)
- `POST /baas-virtual-account/initiaiteCreateVirtualAccount`
- `POST /baas-virtual-account/getChannelCode`
- `POST /baas-virtual-account/getVirtualAccount`
- `POST /baas-virtual-account/getVirtualAccountList`
- `POST /baas-virtual-account/getVirtualAccountTransactionList`
- `POST /baas-virtual-account/resendOtp`
- `POST /baas-virtual-account/completeVirtualAccountCreation`
- `POST /baas-virtual-account/createTemporaryVirtualAccount`

### Transaction Services (baas-Transaction)
- `POST /baas-Transaction/bankList`
- `POST /baas-Transaction/fundTransfer`
- `POST /baas-Transaction/nameEnquiry`
- `POST /baas-Transaction/postSingleTransaction`
- `POST /baas-Transaction/tsq`
- `POST /baas-Transaction/webhook`

### Wallet Services (baas-wallet)
- `POST /baas-wallet/read-wallet-transaction`
- `POST /retrieve-wallet-details`
- `POST /baas-wallet/wallet-balance-enquiry`

## 🛠️ Database Changes

The migration adds these new fields to the `Users` table:
- `bvnVerified` (BOOLEAN) - Whether BVN has been verified
- `bvnVerificationDate` (DATE) - When BVN was verified
- `alternatePhone` (STRING) - Alternate phone from BVN data
- `bvnData` (JSONB) - Additional BVN verification data

## 📞 Support

If you encounter issues:
1. Check the application logs in Digital Ocean
2. Verify all environment variables are set correctly
3. Test API connectivity to Rubies development server: `https://api-sme-dev.rubies.ng/dev`
4. Check webhook logs at `/webhook/rubies` endpoint
5. Contact Rubies support for API-specific issues

## 🔄 Revenue Calculation Maintained

The revenue calculation system continues to work as before:
- Transfer out charges (fees from bank transfers)
- Monthly charges fees
- Data purchase fees
- Airtime sales (retail price + 2 naira markup)

All existing revenue tracking remains intact with the new Rubies integration.

## 📋 Rubies Response Codes

Based on the documentation, here are the key response codes:

| Code | Message | Description | Action |
|------|---------|-------------|---------|
| 00 | Success | Transaction successful | Do not retry |
| 01 | Invalid System Error | System error | Contact support |
| 02 | Existing Customer | Cannot create new customer | Use existing |
| 14 | Transaction Failed | Transfer failed | Retry if needed |
| 31 | Insufficient Balance | Not enough funds | Fund account |
| 33 | Transaction Failed | General failure | Check details |
| 34 | Settlement Required | Status unknown | Wait for settlement |
| -1 | Processing | Transaction processing | Wait for completion |

## 🎯 Testing Checklist

- [ ] BVN validation works during onboarding
- [ ] Virtual account creation initiates successfully
- [ ] OTP verification completes account creation
- [ ] Name enquiry returns correct account details
- [ ] Bank transfers process correctly
- [ ] Bank list retrieval works
- [ ] Webhook events are processed correctly
- [ ] Wallet balance enquiry works
- [ ] Transaction history retrieval works
- [ ] All existing features continue to work

## 🚨 Important Notes

1. **API Key Format**: Must start with `sk_test_` or `sk_live_`
2. **Webhook URL**: Must be accessible publicly at `/webhook/rubies`
3. **Phone Format**: Nigerian format without country code (0801234567)
4. **Response Handling**: Always check `responseCode` field
5. **OTP Flow**: Virtual account creation requires OTP verification
6. **Settlement**: Some transactions may require settlement confirmation