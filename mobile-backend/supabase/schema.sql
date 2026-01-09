-- ============================================
-- MiiMii Mobile Backend - Complete Database Schema
-- ============================================
-- This SQL script creates the complete database schema for the MiiMii Mobile Backend
-- Run this script in your Supabase SQL Editor
-- 
-- Note: This schema is designed for mobile app only, without WhatsApp or chat functionality
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

-- Gender enum
DO $$ BEGIN
    CREATE TYPE gender_enum AS ENUM ('male', 'female');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- KYC Status enum
DO $$ BEGIN
    CREATE TYPE kyc_status_enum AS ENUM ('pending', 'verified', 'rejected', 'incomplete', 'not_required');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Onboarding Step enum (Mobile app only - no WhatsApp steps)
DO $$ BEGIN
    CREATE TYPE onboarding_step_enum AS ENUM (
        'initial', 
        'profile_setup', 
        'kyc_submission', 
        'virtual_account_creation', 
        'pin_setup', 
        'completed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Registration Source enum (Mobile app only - no WhatsApp)
DO $$ BEGIN
    CREATE TYPE registration_source_enum AS ENUM ('api', 'admin', 'app');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Type enum
DO $$ BEGIN
    CREATE TYPE transaction_type_enum AS ENUM (
        'credit', 'debit', 'transfer', 'airtime', 'data', 
        'utility', 'maintenance_fee', 'platform_fee', 'refund',
        'bonus', 'cashback', 'penalty', 'reversal'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Category enum
DO $$ BEGIN
    CREATE TYPE transaction_category_enum AS ENUM (
        'wallet_funding', 'wallet_transfer', 'bank_transfer', 
        'airtime_purchase', 'data_purchase', 'utility_payment',
        'fee_charge', 'refund', 'admin_adjustment', 'bonus_credit',
        'cashback_credit', 'referral_bonus', 'maintenance_fee',
        'bill_payment_electricity', 'bill_payment_cable', 
        'bill_payment_internet', 'bill_payment_water'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Status enum
DO $$ BEGIN
    CREATE TYPE transaction_status_enum AS ENUM (
        'pending', 'processing', 'completed', 'failed', 
        'cancelled', 'reversed', 'disputed', 'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Priority enum
DO $$ BEGIN
    CREATE TYPE transaction_priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Source enum (Mobile app only - no WhatsApp)
DO $$ BEGIN
    CREATE TYPE transaction_source_enum AS ENUM ('api', 'admin', 'webhook', 'scheduler');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Transaction Approval Status enum
DO $$ BEGIN
    CREATE TYPE transaction_approval_status_enum AS ENUM ('auto_approved', 'pending_approval', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Beneficiary Type enum
DO $$ BEGIN
    CREATE TYPE beneficiary_type_enum AS ENUM ('bank_account', 'phone_number', 'miimii_user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Beneficiary Category enum
DO $$ BEGIN
    CREATE TYPE beneficiary_category_enum AS ENUM ('family', 'friend', 'business', 'vendor', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Wallet Risk Level enum
DO $$ BEGIN
    CREATE TYPE wallet_risk_level_enum AS ENUM ('low', 'medium', 'high');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Wallet Compliance Status enum
DO $$ BEGIN
    CREATE TYPE wallet_compliance_status_enum AS ENUM ('compliant', 'under_review', 'flagged', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Virtual Card Type enum
DO $$ BEGIN
    CREATE TYPE virtual_card_type_enum AS ENUM ('virtual_debit', 'virtual_credit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Virtual Card Network enum
DO $$ BEGIN
    CREATE TYPE virtual_card_network_enum AS ENUM ('visa', 'mastercard', 'verve');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Virtual Card Status enum
DO $$ BEGIN
    CREATE TYPE virtual_card_status_enum AS ENUM ('active', 'inactive', 'frozen', 'expired', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Support Ticket Type enum
DO $$ BEGIN
    CREATE TYPE support_ticket_type_enum AS ENUM ('dispute', 'complaint', 'inquiry', 'technical', 'refund');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Support Ticket Priority enum
DO $$ BEGIN
    CREATE TYPE support_ticket_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Support Ticket Status enum
DO $$ BEGIN
    CREATE TYPE support_ticket_status_enum AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Activity Log Type enum
DO $$ BEGIN
    CREATE TYPE activity_log_type_enum AS ENUM (
        'user_registration', 'user_login', 'user_logout', 'profile_update',
        'transaction_initiated', 'transaction_completed', 'transaction_failed',
        'wallet_funded', 'wallet_debited', 'pin_changed', 'pin_reset',
        'kyc_submitted', 'kyc_verified', 'kyc_rejected',
        'beneficiary_added', 'beneficiary_removed', 'beneficiary_updated',
        'virtual_card_created', 'virtual_card_blocked', 'virtual_card_unblocked',
        'support_ticket_created', 'support_ticket_resolved',
        'admin_action', 'system_event', 'webhook_received', 'webhook_processed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Activity Log Source enum (Mobile app only - no WhatsApp)
DO $$ BEGIN
    CREATE TYPE activity_log_source_enum AS ENUM ('api', 'admin', 'system', 'webhook');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Activity Log Severity enum
DO $$ BEGIN
    CREATE TYPE activity_log_severity_enum AS ENUM ('info', 'warning', 'error', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Notification Type enum
DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'transaction_success', 'transaction_failed', 'transaction_pending',
        'wallet_funded', 'wallet_low_balance', 'wallet_frozen',
        'kyc_approved', 'kyc_rejected', 'kyc_pending',
        'pin_changed', 'pin_reset', 'security_alert',
        'maintenance_fee_charged', 'daily_limit_reached', 'monthly_limit_reached',
        'beneficiary_added', 'virtual_card_created', 'support_ticket_updated',
        'referral_bonus', 'cashback_credited', 'promotion', 'system_announcement'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Notification Priority enum
DO $$ BEGIN
    CREATE TYPE notification_priority_enum AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Data Plan Network enum
DO $$ BEGIN
    CREATE TYPE data_plan_network_enum AS ENUM ('MTN', 'AIRTEL', 'GLO', '9MOBILE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Data Plan Type enum
DO $$ BEGIN
    CREATE TYPE data_plan_type_enum AS ENUM ('SME', 'COOPERATE GIFTING', 'GIFTING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Webhook Log Source enum (Mobile app only - no WhatsApp)
DO $$ BEGIN
    CREATE TYPE webhook_log_source_enum AS ENUM ('bellbank', 'bilal', 'dojah', 'rubies');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLES
-- ============================================

-- Users Table (Mobile app focused)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "phoneNumber" VARCHAR(255) UNIQUE,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "middleName" VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    "dateOfBirth" DATE,
    gender gender_enum,
    address TEXT,
    bvn VARCHAR(11) UNIQUE,
    "bvnVerified" BOOLEAN DEFAULT false NOT NULL,
    "bvnVerificationDate" TIMESTAMPTZ,
    "alternatePhone" VARCHAR(255),
    "bvnData" JSONB,
    "kycStatus" kyc_status_enum DEFAULT 'not_required',
    "kycData" JSONB,
    "onboardingStep" onboarding_step_enum DEFAULT 'initial',
    "sessionData" JSONB,
    "preferredLanguage" VARCHAR(10) DEFAULT 'en',
    "isActive" BOOLEAN DEFAULT true,
    "isBanned" BOOLEAN DEFAULT false,
    "banReason" VARCHAR(255),
    "bannedAt" TIMESTAMPTZ,
    "lastSeen" TIMESTAMPTZ DEFAULT NOW(),
    "lastActivityType" VARCHAR(255),
    "fullName" VARCHAR(255),
    "profilePicture" VARCHAR(255),
    "registrationSource" registration_source_enum DEFAULT 'app',
    "deviceInfo" JSONB,
    "securitySettings" JSONB DEFAULT '{"transactionLimits":{"daily":50000,"single":20000},"notificationPreferences":{"sms":true,"push":true,"email":false}}',
    metadata JSONB,
    pin VARCHAR(255),
    "pinAttempts" INTEGER DEFAULT 0,
    "pinLockedUntil" TIMESTAMPTZ,
    "pinSetAt" TIMESTAMPTZ,
    "pinEnabled" BOOLEAN DEFAULT true NOT NULL,
    "referralCode" VARCHAR(255) UNIQUE,
    "referredBy" UUID REFERENCES users(id),
    "totalReferrals" INTEGER DEFAULT 0,
    "lifetimeValue" DECIMAL(15,2) DEFAULT 0.00,
    "riskScore" DECIMAL(3,2) DEFAULT 0.00,
    "lastTransactionAt" TIMESTAMPTZ,
    "totalTransactionCount" INTEGER DEFAULT 0,
    -- Mobile app authentication fields
    "appEmail" VARCHAR(255) UNIQUE,
    "appEmailVerified" BOOLEAN DEFAULT false NOT NULL,
    "appPasswordHash" VARCHAR(255),
    "appPasswordResetOTP" VARCHAR(6),
    "appPasswordResetOTPExpiry" TIMESTAMPTZ,
    "appPasswordResetOTPAttempts" INTEGER DEFAULT 0 NOT NULL,
    "appLoginAttempts" INTEGER DEFAULT 0 NOT NULL,
    "appLockUntil" TIMESTAMPTZ,
    "appLastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_risk_score CHECK ("riskScore" >= 0 AND "riskScore" <= 1)
);

-- Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(15,2) DEFAULT 0.00,
    "previousBalance" DECIMAL(15,2) DEFAULT 0.00,
    "ledgerBalance" DECIMAL(15,2) DEFAULT 0.00,
    "availableBalance" DECIMAL(15,2) DEFAULT 0.00,
    "totalCredits" DECIMAL(15,2) DEFAULT 0.00,
    "totalDebits" DECIMAL(15,2) DEFAULT 0.00,
    "pendingBalance" DECIMAL(15,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'NGN',
    "virtualAccountNumber" VARCHAR(255) UNIQUE,
    "virtualAccountBank" VARCHAR(255),
    "virtualAccountName" VARCHAR(255),
    "bankCode" VARCHAR(255),
    "accountReference" VARCHAR(255),
    "dailyLimit" DECIMAL(15,2) DEFAULT 50000.00,
    "dailySpent" DECIMAL(15,2) DEFAULT 0.00,
    "lastResetDate" DATE DEFAULT CURRENT_DATE,
    "monthlyLimit" DECIMAL(15,2) DEFAULT 500000.00,
    "monthlySpent" DECIMAL(15,2) DEFAULT 0.00,
    "isActive" BOOLEAN DEFAULT true,
    "isFrozen" BOOLEAN DEFAULT false,
    "freezeReason" VARCHAR(255),
    "frozenAt" TIMESTAMPTZ,
    "frozenBy" UUID REFERENCES users(id),
    "lastMaintenanceFee" TIMESTAMPTZ,
    "maintenanceFeeAmount" DECIMAL(10,2) DEFAULT 50.00,
    "feeExempt" BOOLEAN DEFAULT false,
    "lastTransactionAt" TIMESTAMPTZ,
    "transactionCount" INTEGER DEFAULT 0,
    "riskLevel" wallet_risk_level_enum DEFAULT 'low',
    "complianceStatus" wallet_compliance_status_enum DEFAULT 'compliant',
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(255) NOT NULL UNIQUE,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type transaction_type_enum NOT NULL,
    category transaction_category_enum NOT NULL,
    "subCategory" VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL,
    fee DECIMAL(15,2) DEFAULT 0.00,
    "platformFee" DECIMAL(15,2) DEFAULT 0.00,
    "providerFee" DECIMAL(15,2) DEFAULT 0.00,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'NGN',
    status transaction_status_enum DEFAULT 'pending',
    "failureReason" TEXT,
    "beneficiaryId" UUID,
    "beneficiaryName" VARCHAR(255),
    "beneficiaryAccount" VARCHAR(255),
    "beneficiaryBank" VARCHAR(255),
    "beneficiaryBankCode" VARCHAR(255),
    "parentTransactionId" UUID REFERENCES transactions(id),
    description TEXT,
    "providerReference" VARCHAR(255),
    "providerResponse" JSONB,
    "webhookData" JSONB,
    priority transaction_priority_enum DEFAULT 'normal',
    source transaction_source_enum DEFAULT 'api',
    "approvalStatus" transaction_approval_status_enum DEFAULT 'auto_approved',
    "approvedBy" UUID REFERENCES users(id),
    "approvedAt" TIMESTAMPTZ,
    "rejectedBy" UUID REFERENCES users(id),
    "rejectedAt" TIMESTAMPTZ,
    "rejectionReason" TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_amount_positive CHECK (amount >= 0)
);

-- Bank Accounts Table
CREATE TABLE IF NOT EXISTS "bankAccounts" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "accountNumber" VARCHAR(10) NOT NULL,
    "accountName" VARCHAR(255) NOT NULL,
    "bankCode" VARCHAR(255) NOT NULL,
    "bankName" VARCHAR(255) NOT NULL,
    "isVerified" BOOLEAN DEFAULT false,
    "verificationData" JSONB,
    "isPrimary" BOOLEAN DEFAULT false,
    "isActive" BOOLEAN DEFAULT true,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_account_number_length CHECK (LENGTH("accountNumber") = 10)
);

-- Beneficiaries Table
CREATE TABLE IF NOT EXISTS beneficiaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type beneficiary_type_enum NOT NULL,
    name VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(255),
    "accountNumber" VARCHAR(255),
    "bankCode" VARCHAR(255),
    "bankName" VARCHAR(255),
    nickname VARCHAR(255),
    category beneficiary_category_enum DEFAULT 'other',
    "isVerified" BOOLEAN DEFAULT false,
    "verificationData" JSONB,
    "isFavorite" BOOLEAN DEFAULT false,
    "isActive" BOOLEAN DEFAULT true,
    "addedAt" TIMESTAMPTZ,
    "lastUsedAt" TIMESTAMPTZ,
    "totalTransactions" INTEGER DEFAULT 0,
    "totalAmount" DECIMAL(15,2) DEFAULT 0.00,
    "averageAmount" DECIMAL(15,2) DEFAULT 0.00,
    notes TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Virtual Cards Table
CREATE TABLE IF NOT EXISTS "virtualCards" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "walletId" UUID REFERENCES wallets(id) ON DELETE CASCADE,
    "cardNumber" VARCHAR(16) NOT NULL UNIQUE,
    "cvv" VARCHAR(3) NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "cardHolderName" VARCHAR(255) NOT NULL,
    type virtual_card_type_enum NOT NULL,
    network virtual_card_network_enum NOT NULL,
    "providerCardId" VARCHAR(255),
    "providerReference" VARCHAR(255),
    "providerData" JSONB,
    balance DECIMAL(15,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'NGN',
    "dailyLimit" DECIMAL(15,2) DEFAULT 100000.00,
    "dailySpent" DECIMAL(15,2) DEFAULT 0.00,
    "monthlyLimit" DECIMAL(15,2) DEFAULT 1000000.00,
    "monthlySpent" DECIMAL(15,2) DEFAULT 0.00,
    status virtual_card_status_enum DEFAULT 'active',
    "isDefault" BOOLEAN DEFAULT false,
    "blockedAt" TIMESTAMPTZ,
    "blockedReason" VARCHAR(255),
    "lastTransactionAt" TIMESTAMPTZ,
    "transactionCount" INTEGER DEFAULT 0,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_expiry_month CHECK ("expiryMonth" >= 1 AND "expiryMonth" <= 12),
    CONSTRAINT check_expiry_year CHECK ("expiryYear" >= 2020)
);

-- Support Tickets Table
CREATE TABLE IF NOT EXISTS "supportTickets" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ticketNumber" VARCHAR(255) NOT NULL UNIQUE,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "transactionId" UUID REFERENCES transactions(id),
    type support_ticket_type_enum NOT NULL,
    priority support_ticket_priority_enum DEFAULT 'medium',
    status support_ticket_status_enum DEFAULT 'open',
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    attachments JSONB,
    "assignedTo" UUID REFERENCES users(id),
    resolution TEXT,
    "resolvedAt" TIMESTAMPTZ,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS "activityLogs" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
    "relatedTransactionId" UUID REFERENCES transactions(id) ON DELETE SET NULL,
    "adminUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
    type activity_log_type_enum NOT NULL,
    source activity_log_source_enum DEFAULT 'system',
    severity activity_log_severity_enum DEFAULT 'info',
    description TEXT NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "requestData" JSONB,
    "responseData" JSONB,
    "reviewedBy" UUID REFERENCES users(id),
    "reviewedAt" TIMESTAMPTZ,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL,
    priority notification_priority_enum DEFAULT 'normal',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    "actionUrl" VARCHAR(255),
    "relatedTransactionId" UUID REFERENCES transactions(id),
    "relatedTicketId" UUID REFERENCES "supportTickets"(id),
    "isRead" BOOLEAN DEFAULT false,
    "readAt" TIMESTAMPTZ,
    "sentAt" TIMESTAMPTZ,
    "deliveredAt" TIMESTAMPTZ,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data Plans Table
CREATE TABLE IF NOT EXISTS "dataPlans" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    network data_plan_network_enum NOT NULL,
    type data_plan_type_enum NOT NULL,
    name VARCHAR(255) NOT NULL,
    "dataSize" VARCHAR(50) NOT NULL,
    "dataSizeMB" INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "providerCode" VARCHAR(255),
    "providerPlanId" VARCHAR(255),
    "isActive" BOOLEAN DEFAULT true,
    "displayOrder" INTEGER DEFAULT 0,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KV Store Table
CREATE TABLE IF NOT EXISTS "kvStore" (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Logs Table
CREATE TABLE IF NOT EXISTS "webhookLogs" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source webhook_log_source_enum NOT NULL,
    "eventType" VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseData" JSONB,
    "processed" BOOLEAN DEFAULT false,
    "processedAt" TIMESTAMPTZ,
    "errorMessage" TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users("phoneNumber");
CREATE INDEX IF NOT EXISTS idx_users_app_email ON users("appEmail");
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users("kycStatus");
CREATE INDEX IF NOT EXISTS idx_users_onboarding_step ON users("onboardingStep");
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users("referralCode");
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users("referredBy");
CREATE INDEX IF NOT EXISTS idx_users_active_banned ON users("isActive", "isBanned");
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users("lastSeen");

-- Wallets indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets("userId");
CREATE INDEX IF NOT EXISTS idx_wallets_virtual_account_number ON wallets("virtualAccountNumber");
CREATE INDEX IF NOT EXISTS idx_wallets_active_frozen ON wallets("isActive", "isFrozen");
CREATE INDEX IF NOT EXISTS idx_wallets_compliance_status ON wallets("complianceStatus");
CREATE INDEX IF NOT EXISTS idx_wallets_risk_level ON wallets("riskLevel");

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions("userId");
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions("createdAt");
CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions("parentTransactionId");
CREATE INDEX IF NOT EXISTS idx_transactions_provider_reference ON transactions("providerReference");
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);

-- Bank Accounts indexes
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON "bankAccounts"("userId");
CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_number ON "bankAccounts"("accountNumber");

-- Beneficiaries indexes
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_id ON beneficiaries("userId");
CREATE INDEX IF NOT EXISTS idx_beneficiaries_type ON beneficiaries(type);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_active ON beneficiaries("isActive");

-- Virtual Cards indexes
CREATE INDEX IF NOT EXISTS idx_virtual_cards_user_id ON "virtualCards"("userId");
CREATE INDEX IF NOT EXISTS idx_virtual_cards_wallet_id ON "virtualCards"("walletId");
CREATE INDEX IF NOT EXISTS idx_virtual_cards_card_number ON "virtualCards"("cardNumber");
CREATE INDEX IF NOT EXISTS idx_virtual_cards_status ON "virtualCards"(status);

-- Support Tickets indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON "supportTickets"("userId");
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number ON "supportTickets"("ticketNumber");
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON "supportTickets"(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON "supportTickets"("createdAt");

-- Activity Logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON "activityLogs"("userId");
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON "activityLogs"(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON "activityLogs"("createdAt");
CREATE INDEX IF NOT EXISTS idx_activity_logs_related_transaction ON "activityLogs"("relatedTransactionId");
CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON "activityLogs"(source);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications("userId");
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications("isRead");
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications("userId", "isRead");
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications("createdAt");

-- Data Plans indexes
CREATE INDEX IF NOT EXISTS idx_data_plans_network ON "dataPlans"(network);
CREATE INDEX IF NOT EXISTS idx_data_plans_active ON "dataPlans"("isActive");

-- Webhook Logs indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON "webhookLogs"(source);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON "webhookLogs"("processed");
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON "webhookLogs"("createdAt");

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updatedAt trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON "bankAccounts"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_beneficiaries_updated_at BEFORE UPDATE ON beneficiaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_virtual_cards_updated_at BEFORE UPDATE ON "virtualCards"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON "supportTickets"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_logs_updated_at BEFORE UPDATE ON "activityLogs"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_plans_updated_at BEFORE UPDATE ON "dataPlans"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kv_store_updated_at BEFORE UPDATE ON "kvStore"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_logs_updated_at BEFORE UPDATE ON "webhookLogs"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE users IS 'User accounts and profiles for mobile app';
COMMENT ON TABLE wallets IS 'User wallets and virtual accounts';
COMMENT ON TABLE transactions IS 'All financial transactions';
COMMENT ON TABLE "bankAccounts" IS 'User linked bank accounts';
COMMENT ON TABLE beneficiaries IS 'User saved beneficiaries for quick transfers';
COMMENT ON TABLE "virtualCards" IS 'Virtual debit/credit cards';
COMMENT ON TABLE "supportTickets" IS 'Customer support tickets';
COMMENT ON TABLE "activityLogs" IS 'System activity and audit logs';
COMMENT ON TABLE notifications IS 'User notifications';
COMMENT ON TABLE "dataPlans" IS 'Available data plans for purchase';
COMMENT ON TABLE "kvStore" IS 'Key-value store for application data and caching';
COMMENT ON TABLE "webhookLogs" IS 'Webhook event logs from external services';

COMMENT ON COLUMN users."phoneNumber" IS 'User phone number (optional for mobile app registration)';
COMMENT ON COLUMN users."appEmail" IS 'Email address for mobile app authentication';
COMMENT ON COLUMN users."appPasswordHash" IS 'Bcrypt hash of the mobile app password';
COMMENT ON COLUMN users."registrationSource" IS 'Source of user registration (api, admin, app)';
COMMENT ON COLUMN users."onboardingStep" IS 'Current step in mobile app onboarding process';
COMMENT ON COLUMN users."sessionData" IS 'Temporary session data for ongoing transactions';

-- ============================================
-- END OF SCHEMA
-- ============================================

