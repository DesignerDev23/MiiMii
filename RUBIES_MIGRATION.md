# Rubies Banking Services Migration

This document outlines the migration from BellBank to Rubies as the primary banking services provider for MiiMii.

## Changes Made

### 1. New Rubies Service (`src/services/rubies.js`)
- Created comprehensive Rubies API integration
- Implemented authentication with API key and secret
- Added support for:
  - Virtual account creation
  - Bank transfers
  - Name enquiry
  - Bank list retrieval
  - Webhook handling

### 2. Updated Services
- **`src/services/bankTransfer.js`**: Replaced BellBank with Rubies for all banking operations
- **`src/services/wallet.js`**: Updated virtual account creation to use Rubies
- **`src/services/onboarding.js`**: Updated user onboarding to use Rubies
- **`src/routes/webhook.js`**: Updated webhook handlers to process Rubies events

### 3. Configuration Updates (`src/config/index.js`)
- Added Rubies configuration section
- Maintained BellBank config as legacy (deprecated)
- Added environment variable support for Rubies

## Required Environment Variables

Based on actual Rubies API documentation:

### Development Environment
```bash
# Rubies Development API Credentials
RUBIES_API_KEY=SK-BUS0000000042-DEV-your_dev_api_key_here
RUBIES_WEBHOOK_SECRET=your_webhook_secret
```

### Production Environment  
```bash
# Rubies Production API Credentials
RUBIES_API_KEY=SK-BUS0000000042-PROD-your_production_api_key_here
RUBIES_WEBHOOK_SECRET=your_webhook_secret
```

### Environment Detection
The service automatically detects the environment using:
1. `RUBIES_ENV` environment variable (prod/production for production)
2. `APP_ENV` environment variable (prod/production for production)
3. `NODE_ENV` environment variable (production for production)

## API Endpoints

### Base URLs
- **Development**: `https://api-sme-dev.rubies.ng/dev`
- **Production**: `https://api-sme.rubies.ng` (to be confirmed)

### Key Endpoints Used (from actual Rubies documentation)
- `POST /baas-kyc/bvnValidation` - BVN validation
- `POST /baas-virtual-account/initiate-create-virtual-account` - Initiate virtual account creation
- `POST /baas-virtual-account/get-channel-code` - Get channel code for virtual accounts
- `POST /baas-virtual-account/complete-virtual-account-creation` - Complete virtual account after OTP
- `POST /baas-virtual-account/get-virtual-account` - Get virtual account details
- `POST /baas-Transaction/nameEnquiry` - Account name verification
- `POST /baas-Transaction/fundTransfer` - Initiate bank transfer
- `POST /baas-Transaction/bankList` - Get supported banks list
- `POST /baas-Transaction/webhook` - Webhook notifications

## Migration Checklist

- [x] Create Rubies service with all required methods
- [x] Update configuration to support Rubies
- [x] Replace BellBank references in bankTransfer service
- [x] Update wallet service virtual account creation
- [x] Update onboarding service
- [x] Update webhook handlers
- [x] Maintain backward compatibility where possible
- [ ] Set up Rubies API credentials in production
- [ ] Test all banking functionality
- [ ] Update webhook URLs in Rubies dashboard
- [ ] Monitor for any issues after deployment

## Revenue Calculation Updates

Based on your memory about revenue stats calculation, the system will continue to calculate revenue from:
- Transfer out charges (fees from bank transfers)
- Monthly charges fees
- Data purchase fees
- Airtime sales (retail price + 2 naira markup)

The Rubies integration maintains the same fee structure and calculation methods.

## Testing

1. **Sandbox Testing**: Use sandbox credentials to test all flows
2. **Bank Transfer Testing**: Test transfers to various banks
3. **Virtual Account Testing**: Verify account creation and funding
4. **Webhook Testing**: Ensure webhook events are processed correctly

## Rollback Plan

If issues arise, you can temporarily switch back to BellBank by:
1. Reverting the service imports in affected files
2. Ensuring BellBank credentials are still available
3. The old BellBank service (`src/services/bellbank.js`) remains unchanged

## Support

For Rubies API support and documentation:
- API Documentation: https://documenter.getpostman.com/view/23052206/2sB2x3otmY
- Developer Portal: https://rubies.io
- Support: Contact Rubies technical support team
