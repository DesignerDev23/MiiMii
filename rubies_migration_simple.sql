-- Rubies Migration: Add BVN verification fields to users table
-- Simple PostgreSQL migration without IF NOT EXISTS

-- Add BVN verification fields to users table
ALTER TABLE users ADD COLUMN "bvnVerified" BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN "bvnVerificationDate" TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN "alternatePhone" VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN "bvnData" JSONB NULL;

-- Add comments to document the new fields
COMMENT ON COLUMN users."bvnVerified" IS 'Whether BVN has been verified with Rubies API';
COMMENT ON COLUMN users."bvnVerificationDate" IS 'Date when BVN was successfully verified';
COMMENT ON COLUMN users."alternatePhone" IS 'Alternate phone number from BVN data';
COMMENT ON COLUMN users."bvnData" IS 'Additional data returned from BVN verification';

-- Create indexes for better query performance
CREATE INDEX "idx_users_bvn_verified" ON users ("bvnVerified");
CREATE INDEX "idx_users_bvn_verification_date" ON users ("bvnVerificationDate");

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('bvnVerified', 'bvnVerificationDate', 'alternatePhone', 'bvnData')
ORDER BY column_name;
