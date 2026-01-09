# MiiMii Mobile Backend - Database Schema

This document describes the complete database schema for the MiiMii Mobile Backend application. This is an independent database schema designed specifically for mobile app functionality, without WhatsApp or chat features.

## Overview

The mobile backend uses PostgreSQL (via Supabase) and includes the following core tables:
- Users (with mobile app authentication)
- Wallets
- Transactions
- Beneficiaries
- Bank Accounts
- Virtual Cards
- Support Tickets
- Activity Logs
- Notifications
- Data Plans
- KV Store
- Webhook Logs

## Enums

### Gender
- `male`
- `female`

### KYC Status
- `pending`
- `verified`
- `rejected`
- `incomplete`
- `not_required`

### Onboarding Step
- `initial`
- `profile_setup`
- `kyc_submission`
- `virtual_account_creation`
- `pin_setup`
- `completed`

### Registration Source
- `api`
- `admin`
- `app` (default for mobile app registrations)

### Transaction Type
- `credit`
- `debit`
- `transfer`
- `airtime`
- `data`
- `utility`
- `maintenance_fee`
- `platform_fee`
- `refund`
- `bonus`
- `cashback`
- `penalty`
- `reversal`

### Transaction Category
- `wallet_funding`
- `wallet_transfer`
- `bank_transfer`
- `airtime_purchase`
- `data_purchase`
- `utility_payment`
- `fee_charge`
- `refund`
- `admin_adjustment`
- `bonus_credit`
- `cashback_credit`
- `referral_bonus`
- `maintenance_fee`
- `bill_payment_electricity`
- `bill_payment_cable`
- `bill_payment_internet`
- `bill_payment_water`

### Transaction Status
- `pending`
- `processing`
- `completed`
- `failed`
- `cancelled`
- `reversed`
- `disputed`
- `refunded`

### Transaction Source
- `api`
- `admin`
- `webhook`
- `scheduler`

### Beneficiary Type
- `bank_account`
- `phone_number`
- `miimii_user`

### Beneficiary Category
- `family`
- `friend`
- `business`
- `vendor`
- `other`

### Activity Log Source
- `api`
- `admin`
- `system`
- `webhook`

### Notification Type
- `transaction_success`
- `transaction_failed`
- `transaction_pending`
- `wallet_funded`
- `wallet_low_balance`
- `wallet_frozen`
- `kyc_approved`
- `kyc_rejected`
- `kyc_pending`
- `pin_changed`
- `pin_reset`
- `security_alert`
- `maintenance_fee_charged`
- `daily_limit_reached`
- `monthly_limit_reached`
- `beneficiary_added`
- `virtual_card_created`
- `support_ticket_updated`
- `referral_bonus`
- `cashback_credited`
- `promotion`
- `system_announcement`

## Tables

### users

Primary user table for mobile app authentication and profile management.

**Key Fields:**
- `id` (UUID, PK)
- `phoneNumber` (VARCHAR(255), nullable, unique) - User phone number (optional)
- `appEmail` (VARCHAR(255), unique) - Email for mobile app authentication
- `appPasswordHash` (VARCHAR(255)) - Bcrypt hashed password
- `appEmailVerified` (BOOLEAN, default false)
- `firstName`, `lastName`, `middleName` (VARCHAR(255))
- `email` (VARCHAR(255), unique) - General email
- `dateOfBirth` (DATE)
- `gender` (gender_enum)
- `address` (TEXT)
- `bvn` (VARCHAR(11), unique)
- `bvnVerified` (BOOLEAN, default false)
- `kycStatus` (kyc_status_enum, default 'not_required')
- `onboardingStep` (onboarding_step_enum, default 'initial')
- `registrationSource` (registration_source_enum, default 'app')
- `pin` (VARCHAR(255)) - Hashed transaction PIN
- `pinEnabled` (BOOLEAN, default true)
- `referralCode` (VARCHAR(255), unique)
- `referredBy` (UUID, FK to users)
- `isActive` (BOOLEAN, default true)
- `isBanned` (BOOLEAN, default false)
- `appLoginAttempts` (INTEGER, default 0)
- `appLockUntil` (TIMESTAMPTZ)
- `appLastLoginAt` (TIMESTAMPTZ)
- `appPasswordResetOTP` (VARCHAR(6))
- `appPasswordResetOTPExpiry` (TIMESTAMPTZ)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `phoneNumber`
- `appEmail`
- `kycStatus`
- `onboardingStep`
- `referralCode`
- `referredBy`
- `isActive`, `isBanned`

**Removed Fields (WhatsApp-specific):**
- `whatsappNumber` (replaced with `phoneNumber`)
- `conversationState` (removed - no chat functionality)
- `appLinkOTP`, `appLinkOTPExpiry`, `appLinkOTPAttempts` (removed - no WhatsApp linking)
- `lastWelcomedAt` (removed - no WhatsApp welcome messages)

### wallets

User wallet and virtual account information.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users, NOT NULL)
- `balance` (DECIMAL(15,2), default 0.00)
- `availableBalance` (DECIMAL(15,2), default 0.00)
- `ledgerBalance` (DECIMAL(15,2), default 0.00)
- `currency` (VARCHAR(10), default 'NGN')
- `virtualAccountNumber` (VARCHAR(255), unique)
- `virtualAccountBank` (VARCHAR(255))
- `virtualAccountName` (VARCHAR(255))
- `accountReference` (VARCHAR(255))
- `dailyLimit` (DECIMAL(15,2), default 50000.00)
- `dailySpent` (DECIMAL(15,2), default 0.00)
- `monthlyLimit` (DECIMAL(15,2), default 500000.00)
- `monthlySpent` (DECIMAL(15,2), default 0.00)
- `isActive` (BOOLEAN, default true)
- `isFrozen` (BOOLEAN, default false)
- `lastMaintenanceFee` (TIMESTAMPTZ)
- `maintenanceFeeAmount` (DECIMAL(10,2), default 50.00)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `virtualAccountNumber`
- `isActive`, `isFrozen`

### transactions

All financial transactions in the system.

**Key Fields:**
- `id` (UUID, PK)
- `reference` (VARCHAR(255), unique, NOT NULL)
- `userId` (UUID, FK to users, NOT NULL)
- `type` (transaction_type_enum, NOT NULL)
- `category` (transaction_category_enum, NOT NULL)
- `amount` (DECIMAL(15,2), NOT NULL)
- `fee` (DECIMAL(15,2), default 0.00)
- `platformFee` (DECIMAL(15,2), default 0.00)
- `totalAmount` (DECIMAL(15,2), NOT NULL)
- `currency` (VARCHAR(10), default 'NGN')
- `status` (transaction_status_enum, default 'pending')
- `source` (transaction_source_enum, default 'api')
- `beneficiaryId` (UUID, FK to beneficiaries)
- `beneficiaryName` (VARCHAR(255))
- `beneficiaryAccount` (VARCHAR(255))
- `beneficiaryBank` (VARCHAR(255))
- `parentTransactionId` (UUID, FK to transactions)
- `description` (TEXT)
- `providerReference` (VARCHAR(255))
- `providerResponse` (JSONB)
- `metadata` (JSONB)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `reference`
- `type`
- `category`
- `status`
- `createdAt`
- `parentTransactionId`
- `providerReference`

**Removed Fields:**
- `source` enum value 'whatsapp' (removed)

### beneficiaries

User saved beneficiaries for quick transfers.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users, NOT NULL)
- `type` (beneficiary_type_enum, NOT NULL)
- `name` (VARCHAR(255), NOT NULL)
- `phoneNumber` (VARCHAR(255))
- `accountNumber` (VARCHAR(255))
- `bankCode` (VARCHAR(255))
- `bankName` (VARCHAR(255))
- `nickname` (VARCHAR(255))
- `category` (beneficiary_category_enum, default 'other')
- `isVerified` (BOOLEAN, default false)
- `isFavorite` (BOOLEAN, default false)
- `isActive` (BOOLEAN, default true)
- `totalTransactions` (INTEGER, default 0)
- `totalAmount` (DECIMAL(15,2), default 0.00)
- `lastUsedAt` (TIMESTAMPTZ)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `type`
- `isActive`

### bankAccounts

User linked bank accounts.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users, NOT NULL)
- `accountNumber` (VARCHAR(10), NOT NULL)
- `accountName` (VARCHAR(255), NOT NULL)
- `bankCode` (VARCHAR(255), NOT NULL)
- `bankName` (VARCHAR(255), NOT NULL)
- `isVerified` (BOOLEAN, default false)
- `isPrimary` (BOOLEAN, default false)
- `isActive` (BOOLEAN, default true)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `accountNumber`

### virtualCards

Virtual debit/credit cards.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users, NOT NULL)
- `walletId` (UUID, FK to wallets)
- `cardNumber` (VARCHAR(16), unique, NOT NULL)
- `cvv` (VARCHAR(3), NOT NULL)
- `expiryMonth` (INTEGER, NOT NULL)
- `expiryYear` (INTEGER, NOT NULL)
- `cardHolderName` (VARCHAR(255), NOT NULL)
- `type` (virtual_card_type_enum, NOT NULL)
- `network` (virtual_card_network_enum, NOT NULL)
- `balance` (DECIMAL(15,2), default 0.00)
- `status` (virtual_card_status_enum, default 'active')
- `isDefault` (BOOLEAN, default false)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `walletId`
- `cardNumber`
- `status`

### supportTickets

Customer support tickets.

**Key Fields:**
- `id` (UUID, PK)
- `ticketNumber` (VARCHAR(255), unique, NOT NULL)
- `userId` (UUID, FK to users, NOT NULL)
- `transactionId` (UUID, FK to transactions)
- `type` (support_ticket_type_enum, NOT NULL)
- `priority` (support_ticket_priority_enum, default 'medium')
- `status` (support_ticket_status_enum, default 'open')
- `subject` (VARCHAR(255), NOT NULL)
- `description` (TEXT, NOT NULL)
- `assignedTo` (UUID, FK to users)
- `resolution` (TEXT)
- `resolvedAt` (TIMESTAMPTZ)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `ticketNumber`
- `status`
- `createdAt`

### activityLogs

System activity and audit logs.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users)
- `relatedTransactionId` (UUID, FK to transactions)
- `adminUserId` (UUID, FK to users)
- `type` (activity_log_type_enum, NOT NULL)
- `source` (activity_log_source_enum, default 'system')
- `severity` (activity_log_severity_enum, default 'info')
- `description` (TEXT, NOT NULL)
- `ipAddress` (VARCHAR(45))
- `userAgent` (TEXT)
- `requestData` (JSONB)
- `responseData` (JSONB)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `type`
- `createdAt`
- `relatedTransactionId`

**Removed:**
- `source` enum value 'whatsapp' (removed)

### notifications

User notifications.

**Key Fields:**
- `id` (UUID, PK)
- `userId` (UUID, FK to users, NOT NULL)
- `type` (notification_type_enum, NOT NULL)
- `priority` (notification_priority_enum, default 'normal')
- `title` (VARCHAR(255), NOT NULL)
- `message` (TEXT, NOT NULL)
- `actionUrl` (VARCHAR(255))
- `relatedTransactionId` (UUID, FK to transactions)
- `relatedTicketId` (UUID, FK to supportTickets)
- `isRead` (BOOLEAN, default false)
- `readAt` (TIMESTAMPTZ)
- `sentAt` (TIMESTAMPTZ)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `userId`
- `type`
- `isRead`
- `userId`, `isRead`
- `createdAt`

### dataPlans

Available data plans for purchase.

**Key Fields:**
- `id` (UUID, PK)
- `network` (data_plan_network_enum, NOT NULL)
- `type` (data_plan_type_enum, NOT NULL)
- `name` (VARCHAR(255), NOT NULL)
- `dataSize` (VARCHAR(50), NOT NULL)
- `dataSizeMB` (INTEGER, NOT NULL)
- `price` (DECIMAL(10,2), NOT NULL)
- `validityDays` (INTEGER, NOT NULL)
- `providerCode` (VARCHAR(255))
- `providerPlanId` (VARCHAR(255))
- `isActive` (BOOLEAN, default true)
- `displayOrder` (INTEGER, default 0)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `network`
- `isActive`

### kvStore

Key-value store for application data and caching.

**Key Fields:**
- `key` (VARCHAR(255), PK)
- `value` (JSONB, NOT NULL)
- `expiresAt` (TIMESTAMPTZ)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

### webhookLogs

Webhook event logs from external services.

**Key Fields:**
- `id` (UUID, PK)
- `source` (webhook_log_source_enum, NOT NULL)
- `eventType` (VARCHAR(255), NOT NULL)
- `payload` (JSONB, NOT NULL)
- `responseStatus` (INTEGER)
- `responseData` (JSONB)
- `processed` (BOOLEAN, default false)
- `processedAt` (TIMESTAMPTZ)
- `errorMessage` (TEXT)
- `createdAt`, `updatedAt` (TIMESTAMPTZ)

**Indexes:**
- `source`
- `processed`
- `createdAt`

**Removed:**
- `source` enum value 'whatsapp' (removed)

## Removed Tables

The following tables have been removed as they are WhatsApp-specific:
- `chatMessages` - Chat functionality removed from mobile backend

## Key Differences from Main App Schema

1. **Users Table:**
   - `whatsappNumber` → `phoneNumber` (nullable, optional)
   - Removed `conversationState` field
   - Removed `appLinkOTP`, `appLinkOTPExpiry`, `appLinkOTPAttempts` fields
   - `registrationSource` enum: removed 'whatsapp', default is 'app'
   - `onboardingStep` enum: simplified to mobile app steps only

2. **Transactions Table:**
   - `source` enum: removed 'whatsapp' value

3. **Activity Logs:**
   - `source` enum: removed 'whatsapp' value

4. **Webhook Logs:**
   - `source` enum: removed 'whatsapp' value

5. **Removed Tables:**
   - `chatMessages` - No chat functionality in mobile backend

## SQL Script

A complete SQL script for creating this schema is available in `mobile-backend/supabase/schema.sql` (to be created). The script includes:
- All enum types
- All table definitions
- All indexes
- Triggers for `updatedAt` timestamps
- Foreign key constraints
- Check constraints

## Migration Notes

When migrating from the main app database:
1. Users with `whatsappNumber` should have it migrated to `phoneNumber`
2. Remove all `chatMessages` records (or migrate to a separate system if needed)
3. Update `registrationSource` from 'whatsapp' to 'app' for mobile app users
4. Update `onboardingStep` to match new enum values
5. Remove `conversationState` data from users
6. Remove `appLinkOTP` related fields

