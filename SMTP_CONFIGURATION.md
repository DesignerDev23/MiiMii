# SMTP Configuration for Statement Generation

## Overview

The statement generation feature requires SMTP (Simple Mail Transfer Protocol) configuration to send PDF statements via email to users. This document explains how to configure SMTP settings.

## Required Environment Variables

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# SMTP Server Configuration
SMTP_HOST=smtp.gmail.com          # Your SMTP server hostname
SMTP_PORT=587                     # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                 # true for SSL (port 465), false for TLS (port 587)
SMTP_USER=your-email@gmail.com    # Your SMTP username (usually your email address)
SMTP_PASS=your-app-password       # Your SMTP password or app-specific password
SMTP_FROM=noreply@chatmiimii.com  # Email address to send from (optional, defaults to SMTP_USER)
```

## Common SMTP Providers

### Gmail

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@chatmiimii.com
```

**Note:** For Gmail, you need to:
1. Enable "Less secure app access" OR
2. Use an "App Password" (recommended):
   - Go to Google Account → Security
   - Enable 2-Step Verification
   - Generate an App Password
   - Use the generated password as `SMTP_PASS`

### Outlook/Hotmail

```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=noreply@chatmiimii.com
```

### SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@chatmiimii.com
```

### Mailgun

```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
SMTP_FROM=noreply@chatmiimii.com
```

### AWS SES (Simple Email Service)

```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Replace with your region
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-aws-ses-smtp-username
SMTP_PASS=your-aws-ses-smtp-password
SMTP_FROM=noreply@chatmiimii.com
```

## Testing SMTP Configuration

After configuring SMTP settings, you can test if the email service is working by:

1. **Check Application Logs:**
   - Look for "Email service initialized successfully" message on startup
   - If you see "Email service not configured - SMTP credentials missing", check your environment variables

2. **Request a Statement:**
   - Have a user request a statement via WhatsApp
   - Check logs for email sending attempts
   - Verify if email is received or if there are any errors

3. **Check Email Service Status:**
   - The service logs will indicate if email sending fails
   - Common errors include authentication failures, connection timeouts, or invalid email addresses

## Troubleshooting

### Email Service Not Configured
- **Error:** "Email service not configured - SMTP credentials missing"
- **Solution:** Ensure `SMTP_USER` and `SMTP_PASS` are set in environment variables

### Authentication Failed
- **Error:** "Invalid login" or "Authentication failed"
- **Solution:** 
  - Verify `SMTP_USER` and `SMTP_PASS` are correct
  - For Gmail, use an App Password instead of your regular password
  - Ensure 2FA is enabled and app password is generated

### Connection Timeout
- **Error:** "Connection timeout" or "EHOSTUNREACH"
- **Solution:**
  - Check if `SMTP_HOST` and `SMTP_PORT` are correct
  - Verify firewall/network settings allow outbound SMTP connections
  - Try using port 465 with `SMTP_SECURE=true` for SSL

### Emails Not Received
- **Check:** 
  - Spam/junk folder
  - Email address is correct
  - SMTP server logs for delivery status
  - Check if SMTP provider has sending limits (e.g., Gmail: 500 emails/day)

## Security Notes

1. **Never commit SMTP credentials to version control**
2. **Use environment variables or secure secrets management**
3. **Use App Passwords instead of main account passwords when possible**
4. **Consider using a dedicated email service (SendGrid, Mailgun, AWS SES) for production**
5. **Regularly rotate SMTP passwords**

## Statement Generation Flow

1. User requests statement via WhatsApp (e.g., "generate statement", "send me statement PDF")
2. System checks if user has email address:
   - If no email: System prompts user to provide email address
   - If email exists: System shows date range selection buttons
3. User selects date range:
   - This Month
   - Last Month
   - Last 3 Months
   - This Year
4. System generates PDF statement with:
   - MiiMii branding and logo
   - Google Outfit font
   - Transaction details
   - Summary of credits, debits, and fees
5. System sends PDF via email using configured SMTP settings
6. User receives confirmation message with email address

## Related Files

- `src/services/emailService.js` - Email service implementation
- `src/services/statementService.js` - Statement generation and PDF creation
- `src/services/aiAssistant.js` - Statement request handling and interactive flow
- `src/services/messageProcessor.js` - Email collection and date range selection handlers

