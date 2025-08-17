# Simplified Bank Transfer Guide

## Overview

The MiiMii platform now supports a simplified bank transfer format that allows users to initiate transfers with just a single message containing the amount, account number, and bank name.

## New Transfer Format

Users can now send messages like:

```
send 4k to 9072874728 Opay Bank
send 4000 to 9072874728 Opay
transfer 5k to 1001011000 test bank
send 10k to 0123456789 GTBank
transfer 2000 to 9876543210 Access Bank
```

## How It Works

1. **Message Parsing**: The AI extracts the amount, account number, and bank name from the user's message
2. **Bank Code Resolution**: The system automatically gets the bank code from the BellBank API bank list
3. **Account Validation**: Uses BellBank name enquiry to validate the account and get the recipient name
4. **Confirmation**: Shows a confirmation message with the recipient name and asks for PIN

## Supported Amount Formats

- `4k` = ₦4,000
- `5k` = ₦5,000
- `10k` = ₦10,000
- `4000` = ₦4,000
- `5000` = ₦5,000

## Supported Account Number Formats

- Traditional banks: 10 digits (e.g., `0123456789`)
- Digital banks: 8-11 digits, can include phone number format (e.g., `9072874728`)

## Supported Bank Names

### Traditional Banks
- GTBank, GTB, Guaranty Trust
- Access Bank, Access
- UBA, United Bank for Africa
- First Bank, FirstBank, FBN
- Zenith Bank, Zenith
- Fidelity Bank, Fidelity
- Wema Bank, Wema
- Union Bank, Union
- FCMB, First City Monument Bank
- Stanbic IBTC, Stanbic, IBTC
- Sterling Bank, Sterling
- Ecobank, Eco Bank
- Heritage Bank, Heritage
- Unity Bank, Unity
- And many more...

### Digital Banks
- Opay
- PalmPay
- Kuda
- Carbon
- ALAT
- V Bank, VBank
- Rubies
- Mintyn
- FairMoney
- Branch
- Eyowo
- Flutterwave
- PayStack
- MoniePoint
- 9PSB
- Providus
- And many more...

### Test Bank
- Test Bank, TestBank, Test (for testing purposes)

## User Experience Flow

1. **User sends**: `send 4k to 9072874728 Opay Bank`
2. **AI responds**: `Great! I can see you want to send ₦4,000 to Opay Bank. Let me verify the account details and get the recipient name for you. 🔍`
3. **System validates account and gets recipient name**
4. **AI shows confirmation**: 
   ```
   💸 Bank Transfer Confirmation

   💰 Amount: ₦4,000
   💳 Fee: ₦50
   🧾 Total: ₦4,050

   👤 Recipient: John Doe
   🏦 Bank: Opay
   🔢 Account: 9072874728

   Reply YES to confirm, or NO to cancel.
   ```
5. **User confirms**: `YES`
6. **AI requests PIN**: `🔐 Please enter your 4-digit transaction PIN to confirm.`
7. **User enters PIN**: `1234`
8. **Transfer processed**

## Technical Implementation

### Key Components Modified

1. **AI Assistant Service** (`src/services/aiAssistant.js`)
   - Updated system prompt to handle new format
   - Enhanced intent patterns for better recognition
   - Modified `handleBankTransfer` method to use BellBank API
   - Improved bank code resolution logic

2. **BellBank Service** (`src/services/bellbank.js`)
   - Uses `/v1/transfer/banks` endpoint to get bank list
   - Uses `/v1/transfer/name-enquiry` endpoint for account validation

3. **Bank Transfer Service** (`src/services/bankTransfer.js`)
   - Enhanced account validation with name enquiry
   - Improved bank code mapping

### API Endpoints Used

- **Bank List**: `GET /v1/transfer/banks` - Get all supported banks
- **Name Enquiry**: `POST /v1/transfer/name-enquiry` - Validate account and get recipient name

## Benefits

1. **Simplified User Experience**: Users don't need to remember bank codes
2. **Automatic Validation**: Account details are validated automatically
3. **Recipient Name Display**: Shows actual recipient name in confirmation
4. **Flexible Format**: Supports various ways to express amounts and bank names
5. **Error Handling**: Graceful fallback to static mapping if API fails

## Error Handling

- If bank name is not recognized, user gets helpful error message
- If account validation fails, user gets clear error message
- If API calls fail, system falls back to static bank mapping
- All errors are logged for debugging

## Testing

Use the test script to verify functionality:

```bash
node test_bank_transfer.js
```

This will test various message formats and verify the AI correctly extracts and processes the transfer details.
