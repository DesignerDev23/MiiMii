# Settings Endpoints Setup Guide

## Overview
All comprehensive settings endpoints have been added to the mobile API. This includes:
- Password management (change, reset)
- Transaction PIN management (change, reset)
- Account management (delete, update profile, update email)
- Support tickets (create, list, view)
- Account statements (request, download)
- Notification preferences

## Installation

### 1. Install Nodemailer
```bash
npm install nodemailer
```

### 2. Environment Variables
Add these to your `.env` file:

```env
# Email Service Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=MiiMii <noreply@miimii.ai>
```

**For Gmail:**
- Use an App Password (not your regular password)
- Enable 2-factor authentication
- Generate App Password: https://myaccount.google.com/apppasswords

**For other providers:**
- Update `SMTP_HOST` and `SMTP_PORT` accordingly
- Set `SMTP_SECURE=true` for port 465 (SSL)

## Endpoints Added

### Password Management
- `POST /api/mobile/settings/change-password` - Change password
- `POST /api/mobile/auth/forgot-password` - Request password reset OTP (already existed, now sends email)
- `POST /api/mobile/auth/verify-otp` - Verify OTP (already existed)
- `POST /api/mobile/auth/reset-password` - Reset password with OTP (already existed)

### Transaction PIN
- `POST /api/mobile/settings/change-pin` - Change transaction PIN
- `POST /api/mobile/settings/reset-pin` - Reset transaction PIN (requires password)

### Account Management
- `PUT /api/mobile/settings/profile` - Update profile (firstName, lastName, middleName, address)
- `PUT /api/mobile/settings/email` - Update email address
- `DELETE /api/mobile/settings/account` - Delete account
- `GET /api/mobile/settings` - Get all settings and preferences

### Account Statements
- `POST /api/mobile/settings/statement` - Request statement (generates PDF and sends via email)
- `GET /api/mobile/settings/statement/download` - Download statement PDF directly

### Support Tickets
- `POST /api/mobile/support/tickets` - Create support ticket
- `GET /api/mobile/support/tickets` - List support tickets
- `GET /api/mobile/support/tickets/:ticketId` - Get ticket details

### Notifications
- `PUT /api/mobile/settings/notifications` - Update notification preferences

## Features

### Email Service
- Sends password reset OTPs
- Sends account statements as PDF attachments
- Sends account deletion confirmations
- Gracefully handles email service failures (logs warning, continues)

### Statement Service
- Generates branded PDF statements
- Includes transaction history with filters
- Supports date range, type (credit/debit), and category filters
- Can send via email or return as download

### Support Tickets
- Full CRUD operations
- Ticket types: dispute, complaint, inquiry, technical, refund
- Priority levels: low, medium, high, urgent
- Status tracking: open, in_progress, resolved, closed

## Testing

All endpoints are included in the Postman collection. Test with:
1. Valid authentication token
2. Proper request bodies
3. Valid email configuration for email-sending endpoints

## Notes

- Email service is optional - if not configured, endpoints still work but emails won't be sent
- Statements can be downloaded even if email sending fails
- Account deletion is soft delete (marks as inactive, doesn't permanently delete data)
- All endpoints require authentication except password reset flow

