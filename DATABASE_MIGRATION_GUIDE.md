# Database Migration Guide

## Manual Database Setup

Since the automatic migration might not work in all environments, you can run the database migration manually using the provided SQL file.

### Option 1: Using DigitalOcean Database Console

1. **Access your DigitalOcean Database:**
   - Go to your DigitalOcean Dashboard
   - Navigate to Databases → Your MiiMii Database
   - Click on "Console" or "Query" tab

2. **Run the Migration:**
   - Copy the contents of `database_migration.sql`
   - Paste it into the console
   - Execute the script

### Option 2: Using psql Command Line

If you have PostgreSQL client installed locally:

```bash
# Connect to your database
psql "postgresql://YOUR_DB_USER:YOUR_PASSWORD@YOUR_DB_HOST:25060/defaultdb?sslmode=require"

# Run the migration file
\i database_migration.sql

# Or copy and paste the content directly
```

### Option 3: Using pgAdmin or Similar GUI

1. Connect to your database using the connection details:
   - Host: `YOUR_DB_HOST`
   - Port: `25060`
   - Database: `defaultdb`
   - Username: `YOUR_DB_USER`
   - Password: `YOUR_DB_PASSWORD`
   - SSL Mode: `require`

2. Open Query Tool and paste the contents of `database_migration.sql`
3. Execute the script

## What the Migration Creates

The SQL script will create the following tables:

1. **`users`** - User accounts and profile information
   - WhatsApp number, full name, email
   - KYC status and verification flags
   - PIN hash for security

2. **`wallets`** - User wallet balances and limits
   - Balance in NGN
   - Daily and monthly transaction limits
   - Wallet status

3. **`transactions`** - All financial transactions
   - Transfer, deposit, withdrawal records
   - Transaction status and references
   - Provider data and metadata

4. **`webhook_logs`** - External service webhook logs
   - WhatsApp, BellBank, Bilal, Dojah webhooks
   - Processing status and error tracking

5. **`support_tickets`** - Customer support system
   - User complaints and inquiries
   - Ticket status and resolution tracking

## Verification

After running the migration, you can verify the tables were created:

```sql
-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'wallets', 'transactions', 'webhook_logs', 'support_tickets');

-- Check table structures
\d users
\d wallets
\d transactions
\d webhook_logs
\d support_tickets
```

## Sample Data

The migration includes a sample admin user for testing:
- WhatsApp: `+2349012345678`
- Email: `admin@miimii.com`
- Initial balance: ₦1,000,000

## Important Notes

- The migration uses `CREATE TABLE IF NOT EXISTS` so it's safe to run multiple times
- All tables have proper indexes for performance
- Triggers are set up to automatically update `updated_at` timestamps
- Foreign key constraints ensure data integrity

## Troubleshooting

If you encounter errors:

1. **Permission errors**: Ensure your database user has CREATE table permissions
2. **Connection errors**: Verify your SSL configuration and network access
3. **Syntax errors**: Ensure you're running on PostgreSQL (not MySQL or other databases)

## After Migration

Once the tables are created, your MiiMii application should start successfully and connect to the database without issues.