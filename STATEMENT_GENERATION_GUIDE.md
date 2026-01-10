# How to Generate Your Account Statement

## Quick Guide

Users can request their account statement through WhatsApp chat. The system will guide them through an interactive process to collect email and select a date range.

## Step-by-Step Process

### 1. **Request a Statement**

Users can request a statement by sending any of these messages:
- "Generate statement"
- "Send me statement PDF"
- "I need my account statement"
- "Email my statement"
- "Account statement"
- "Statement PDF"
- "Send statement to email"

**Example:**
```
User: "Generate my account statement"
```

### 2. **Email Collection (If Required)**

If the user doesn't have an email address saved in their profile, the system will prompt them to provide one:

```
Bot: 📧 Email Required for Statement

To send you your account statement PDF, I need your email address.

Please provide your email address:
• Reply with your email (e.g., example@email.com)
• Or say "My email is example@email.com"

Your email will be securely stored and used only for sending statements.
```

**User Response:**
- `"myemail@gmail.com"` ✅
- `"My email is john@example.com"` ✅
- `"Send to user@email.com"` ✅

The system will:
- Validate the email format
- Save it to the user's profile
- Proceed to date range selection

### 3. **Date Range Selection**

Once email is confirmed, the system shows interactive buttons for date range selection:

```
Bot: 📅 Select Statement Period

Choose the date range for your account statement:

📧 Email: user@example.com

Select an option below:

[📅 This Month]    [📅 Last Month]
[📅 Last 3 Months] [📅 This Year]
```

**Available Options:**
- **This Month**: Transactions from the 1st day of the current month to today
- **Last Month**: All transactions from the previous month
- **Last 3 Months**: Transactions from 3 months ago to today
- **This Year**: All transactions from January 1st of the current year to today

**User Action:**
- Click one of the buttons to select the desired period

### 4. **Statement Generation**

After selecting a date range, the system will:

```
Bot: 📄 Generating Your Statement

I'm generating your account statement and will send it to your email shortly.

📧 Email: user@example.com
📅 Period: This Month
📆 Date Range: 01/01/2026 - 10/01/2026

⏳ This might take a moment. Please check your email inbox in a few minutes! 🎉
```

### 5. **Email Delivery**

The system generates a branded PDF statement with:
- ✅ MiiMii logo and branding
- ✅ Google Outfit font
- ✅ Account holder information
- ✅ Statement period
- ✅ Transaction summary (credits, debits, fees)
- ✅ Detailed transaction table
- ✅ Professional formatting

**Success Message:**
```
Bot: ✅ Statement Sent Successfully!

Your account statement has been generated and sent to:
📧 user@example.com

The PDF includes:
• 45 transactions
• Complete transaction details
• Summary of credits, debits, and fees
• Professional branded format with MiiMii logo

📬 Please check your inbox (and spam folder if needed).

If you didn't receive it, please let me know!
```

## Complete Flow Example

```
User: "I need my account statement"

Bot: 📧 Email Required for Statement

To send you your account statement PDF, I need your email address.

Please provide your email address:
• Reply with your email (e.g., example@email.com)
• Or say "My email is example@email.com"

---

User: "myemail@gmail.com"

Bot: 📅 Select Statement Period

Choose the date range for your account statement:

📧 Email: myemail@gmail.com

Select an option below:

[📅 This Month]    [📅 Last Month]
[📅 Last 3 Months] [📅 This Year]

---

User: [Clicks "This Month"]

Bot: 📄 Generating Your Statement

I'm generating your account statement and will send it to your email shortly.

📧 Email: myemail@gmail.com
📅 Period: This Month
📆 Date Range: 01/01/2026 - 10/01/2026

⏳ This might take a moment. Please check your email inbox in a few minutes! 🎉

---

[After PDF generation]

Bot: ✅ Statement Sent Successfully!

Your account statement has been generated and sent to:
📧 myemail@gmail.com

The PDF includes:
• 45 transactions
• Complete transaction details
• Summary of credits, debits, and fees
• Professional branded format with MiiMii logo

📬 Please check your inbox (and spam folder if needed).
```

## Requirements

### For Users:
- ✅ Completed onboarding
- ✅ WhatsApp number registered
- ✅ Valid email address (will be collected if not set)

### For System:
- ✅ SMTP configuration set up (see `SMTP_CONFIGURATION.md`)
- ✅ Email service initialized
- ✅ PDF generation service working

## Troubleshooting for Users

### "I didn't receive the email"
1. **Check Spam/Junk Folder**: The email might have been filtered
2. **Verify Email Address**: Make sure you provided the correct email
3. **Wait a Few Minutes**: PDF generation and email sending can take 2-3 minutes
4. **Contact Support**: If issue persists, contact support@chatmiimii.com

### "Email format invalid"
- Make sure your email includes:
  - `@` symbol
  - Valid domain (e.g., gmail.com, yahoo.com)
  - Example: `name@example.com`

### "Statement generation failed"
- Try again after a few moments
- Check your internet connection
- Contact support if the issue persists

### "I want a different date range"
- Currently, only preset ranges are available (This Month, Last Month, Last 3 Months, This Year)
- Custom date ranges may be added in future updates

## Tips for Users

1. **First Time**: You'll need to provide your email address once. It will be saved for future requests.

2. **Fast Access**: After the first time, you can directly request a statement and skip email collection.

3. **Regular Statements**: You can request statements as often as needed.

4. **Email Check**: Always check your spam folder if you don't see the email in your inbox.

5. **PDF Features**: The PDF includes:
   - All transaction details
   - Transaction summaries
   - Account information
   - Professional MiiMii branding
   - Print-ready format

## Technical Details

### Intent Recognition

The system recognizes these phrases as statement requests:
- "statement"
- "account statement"
- "pdf statement"
- "email statement"
- "generate statement"
- "send statement"

### Date Range Calculations

- **This Month**: From 1st day of current month to current date
- **Last Month**: From 1st day to last day of previous month
- **Last 3 Months**: From 3 months ago to current date
- **This Year**: From January 1st to December 31st of current year

### PDF Contents

The generated PDF includes:
- Header with MiiMii logo and branding
- Account holder information (name, phone, email)
- Statement period
- Transaction summary (total credits, debits, fees, net amount)
- Detailed transaction table with:
  - Date and time
  - Transaction type
  - Description
  - Amount
  - Status
  - Reference number
- Footer with contact information
- Page numbers

## Support

If you encounter any issues:
- **Email**: support@chatmiimii.com
- **WhatsApp**: Send "help" or "support" to get assistance
- **In-App**: Use the help menu for additional support

