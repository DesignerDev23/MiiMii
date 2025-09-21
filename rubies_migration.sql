-- Rubies Migration: Add BVN verification fields to users table
-- Run this SQL script directly on your database

-- Add BVN verification fields to users table
ALTER TABLE users ADD COLUMN bvnVerified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN bvnVerificationDate TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN alternatePhone VARCHAR(255) NULL;

-- Add bvnData column (use JSONB for PostgreSQL, TEXT for other databases)
-- For PostgreSQL:
ALTER TABLE users ADD COLUMN bvnData JSONB NULL;

-- If you're using MySQL/MariaDB instead, comment out the line above and use this:
-- ALTER TABLE users ADD COLUMN bvnData TEXT NULL;

-- If you're using SQLite instead, comment out the lines above and use this:
-- ALTER TABLE users ADD COLUMN bvnData TEXT;

-- Update existing users to have bvnVerified as false by default
UPDATE users SET bvnVerified = FALSE WHERE bvnVerified IS NULL;

-- Create indexes for better query performance
CREATE INDEX idx_users_bvn_verified ON users (bvnVerified);
CREATE INDEX idx_users_bvn_verification_date ON users (bvnVerificationDate);

-- Verify the changes (adjust table name case based on your database)
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('bvnVerified', 'bvnVerificationDate', 'alternatePhone', 'bvnData')
ORDER BY column_name;

-- Alternative verification for case-sensitive databases:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'Users' 
--   AND column_name IN ('bvnVerified', 'bvnVerificationDate', 'alternatePhone', 'bvnData')
-- ORDER BY column_name;
