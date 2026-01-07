# Supabase Migration Guide

This guide will help you migrate your MiiMii database from your current PostgreSQL setup to Supabase.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting Up Supabase](#setting-up-supabase)
3. [Database Schema Migration](#database-schema-migration)
4. [Updating Connection Configuration](#updating-connection-configuration)
5. [Data Migration](#data-migration)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Access to your current database
- Node.js and npm installed
- `pg_dump` and `psql` tools (for data migration)

## Setting Up Supabase

### 1. Create a New Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in:
   - **Name**: MiiMii Production (or your preferred name)
   - **Database Password**: Generate a strong password (save it securely!)
   - **Region**: Choose the closest region to your users
   - **Pricing Plan**: Select appropriate plan

### 2. Get Connection Details

After creating the project:

1. Go to **Settings** → **Database**
2. Find the **Connection string** section
3. Copy the connection string (URI format recommended)

**Connection String Format:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

**Or use individual parameters:**
- **Host**: `aws-0-[region].pooler.supabase.com` (for connection pooler)
- **Port**: `6543` (pooler) or `5432` (direct)
- **Database**: `postgres`
- **User**: `postgres.[project-ref]`
- **Password**: Your database password

### 3. Connection Pooler vs Direct Connection

**Connection Pooler (Recommended for Production):**
- Port: `6543`
- Better for serverless/edge functions
- Handles connection pooling automatically
- URL: `...pooler.supabase.com:6543...`

**Direct Connection:**
- Port: `5432`
- Direct PostgreSQL connection
- Better for long-running connections
- URL: `...pooler.supabase.com:5432...` (or direct host)

## Database Schema Migration

### Step 1: Run the Schema SQL

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the contents of `supabase/schema.sql`
5. Paste into the SQL Editor
6. Click **Run** (or press `Ctrl+Enter`)

This will create:
- All ENUM types
- All tables
- All indexes
- All triggers
- All functions

### Step 2: Verify Schema Creation

Run this query to verify all tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see:
- users
- wallets
- transactions
- bankAccounts
- beneficiaries
- virtualCards
- supportTickets
- activityLogs
- notifications
- chatMessages
- dataPlans
- kvStore
- webhookLogs

## Updating Connection Configuration

### Option 1: Update Existing Connection File

Replace the contents of `src/database/connection.js` with the Supabase connection:

```javascript
// In src/database/connection.js, replace the import at the top:
const { sequelize, databaseManager } = require('./database/supabaseConnection');
```

### Option 2: Use Environment Variables

Set these environment variables:

**For Connection URL (Recommended):**
```bash
SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

**Or use individual parameters:**
```bash
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.[project-ref]
SUPABASE_DB_PASSWORD=your-password
```

### Option 3: Update app.js

In `src/app.js`, change the import:

```javascript
// Change this:
const { sequelize, databaseManager } = require('./database/connection');

// To this:
const { sequelize, databaseManager } = require('./database/supabaseConnection');
```

## Data Migration

### Step 1: Export Data from Current Database

**Using pg_dump (Recommended):**

```bash
# Export schema only (if you haven't run schema.sql yet)
pg_dump -h [current-host] -U [user] -d [database] --schema-only -f schema.sql

# Export data only
pg_dump -h [current-host] -U [user] -d [database] --data-only --column-inserts -f data.sql

# Or export everything
pg_dump -h [current-host] -U [user] -d [database] -f full_backup.sql
```

**Using Sequelize (Alternative):**

You can create a migration script to export data:

```javascript
// scripts/exportData.js
const { sequelize } = require('../src/database/connection');
const { User, Wallet, Transaction, /* ... other models */ } = require('../src/models');

async function exportData() {
  // Export users
  const users = await User.findAll({ raw: true });
  // ... export other tables
  // Save to JSON or SQL format
}
```

### Step 2: Import Data to Supabase

**Using psql:**

```bash
# Import data
psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require" -f data.sql
```

**Using Supabase SQL Editor:**

1. Go to SQL Editor
2. If your data export is in SQL format, paste and run it
3. For large datasets, use `psql` command line tool

**Important Notes:**
- Import data in this order to respect foreign keys:
  1. users
  2. wallets
  3. bankAccounts
  4. beneficiaries
  5. transactions
  6. virtualCards
  7. supportTickets
  8. activityLogs
  9. notifications
  10. chatMessages
  11. dataPlans
  12. kvStore
  13. webhookLogs

### Step 3: Verify Data Migration

Run these queries to verify data:

```sql
-- Check record counts
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'wallets', COUNT(*) FROM wallets
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'beneficiaries', COUNT(*) FROM beneficiaries;

-- Check a few sample records
SELECT * FROM users LIMIT 5;
SELECT * FROM wallets LIMIT 5;
SELECT * FROM transactions ORDER BY "createdAt" DESC LIMIT 10;
```

## Testing

### 1. Test Database Connection

```bash
# Test connection
node -e "
const { sequelize } = require('./src/database/supabaseConnection');
sequelize.authenticate()
  .then(() => console.log('✅ Connection successful'))
  .catch(err => console.error('❌ Connection failed:', err));
"
```

### 2. Test Application

1. Start your application:
   ```bash
   npm start
   ```

2. Check logs for:
   - `✅ Supabase database connection established successfully`
   - No connection errors

3. Test key functionality:
   - User registration
   - Wallet operations
   - Transaction creation
   - Data queries

### 3. Monitor Connection Pool

Check Supabase dashboard:
- Go to **Database** → **Connection Pooling**
- Monitor active connections
- Check for connection errors

## Environment Variables

Update your `.env` or environment configuration:

```bash
# Supabase Database Configuration
SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require

# Or use individual parameters
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.[project-ref]
SUPABASE_DB_PASSWORD=your-password

# Keep other environment variables unchanged
# (WhatsApp, Rubies, etc.)
```

## Troubleshooting

### Connection Issues

**Error: "Connection refused"**
- Check if you're using the correct host and port
- Verify SSL is enabled (`sslmode=require`)
- Check firewall settings

**Error: "Authentication failed"**
- Verify username format: `postgres.[project-ref]`
- Check password is correct
- Ensure you're using the database password, not the project password

**Error: "Too many connections"**
- Reduce `pool.max` in connection config
- Use connection pooler (port 6543) instead of direct connection
- Check Supabase connection limits for your plan

### SSL Certificate Issues

If you encounter SSL certificate errors:

1. Ensure `sslmode=require` is in the connection string
2. Check that `rejectUnauthorized: false` is set in dialectOptions
3. Verify Supabase SSL certificates are valid

### Performance Issues

**Slow Queries:**
- Check if indexes are created (run `\d+ table_name` in psql)
- Analyze query performance in Supabase dashboard
- Consider adding additional indexes for your query patterns

**Connection Pool Exhaustion:**
- Reduce `pool.max` value
- Increase `pool.idle` timeout
- Use connection pooler (port 6543)

### Data Migration Issues

**Foreign Key Violations:**
- Import data in the correct order (see Data Migration section)
- Temporarily disable foreign key checks if needed:
  ```sql
  SET session_replication_role = 'replica';
  -- Import data
  SET session_replication_role = 'origin';
  ```

**Enum Value Errors:**
- Ensure all ENUM types are created before importing data
- Check that enum values in data match the defined enums

**UUID Format Issues:**
- Ensure UUID extension is enabled: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
- Verify UUIDs are in correct format

## Post-Migration Checklist

- [ ] Schema created successfully
- [ ] All data migrated
- [ ] Connection working
- [ ] Application starts without errors
- [ ] User registration works
- [ ] Wallet operations work
- [ ] Transactions can be created
- [ ] Queries return correct data
- [ ] No connection pool errors
- [ ] Performance is acceptable
- [ ] Backups are configured in Supabase

## Supabase Features to Explore

After migration, consider using:

1. **Row Level Security (RLS)**: Enable RLS policies for data security
2. **Realtime**: Subscribe to database changes
3. **Storage**: Store files and media
4. **Edge Functions**: Serverless functions
5. **Database Backups**: Automatic backups
6. **Connection Pooling**: Better connection management
7. **Database Extensions**: Additional PostgreSQL extensions

## Rollback Plan

If you need to rollback:

1. Keep your old database running during migration
2. Update environment variables to point back to old database
3. Restart application
4. Verify everything works
5. Then shut down old database

## Support

- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Supabase GitHub: https://github.com/supabase/supabase

## Next Steps

1. Set up Supabase backups
2. Configure monitoring and alerts
3. Enable Row Level Security if needed
4. Set up database replication if required
5. Optimize queries based on usage patterns

---

**Note**: Always test the migration in a staging environment before applying to production!

