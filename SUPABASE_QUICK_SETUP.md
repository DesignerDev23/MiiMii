# Supabase Quick Setup Guide

## Current Issue

Your application is trying to connect to DigitalOcean database but getting connection errors:
- `ENOTFOUND miimiidb-do-user-20025867-0.f.db.ondigitalocean.com`
- `EHOSTUNREACH` (IPv6 connection unreachable)

## Solution: Switch to Supabase

### Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up/Login
3. Click **"New Project"**
4. Fill in:
   - **Name**: MiiMii Production
   - **Database Password**: Generate strong password (SAVE IT!)
   - **Region**: Choose closest to your users
   - **Plan**: Select appropriate plan

### Step 2: Get Connection String

1. In Supabase dashboard, go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **"URI"** tab
4. Copy the connection string (it looks like):
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
   ```

### Step 3: Set Environment Variable

**In DigitalOcean App Platform:**

1. Go to your App → **Settings** → **App-Level Environment Variables**
2. Add new variable:
   - **Key**: `SUPABASE_DB_URL`
   - **Value**: Paste your Supabase connection string
3. **Remove or comment out** old DigitalOcean database variables:
   - `DB_CONNECTION_URL` (if it points to DigitalOcean)
   - `DB_HOST` (if it points to DigitalOcean)
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD` (if used)

**Or use individual parameters:**

```bash
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.[project-ref]
SUPABASE_DB_PASSWORD=your-password
```

### Step 4: Run Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open `supabase/schema.sql` from your project
4. Copy entire contents
5. Paste into SQL Editor
6. Click **Run** (or press `Ctrl+Enter`)

### Step 5: Migrate Your Data (If Needed)

If you have existing data:

```bash
# Export from DigitalOcean (if still accessible)
pg_dump -h [old-host] -U [user] -d [database] --data-only --column-inserts -f data.sql

# Import to Supabase
psql "your-supabase-connection-string" -f data.sql
```

### Step 6: Deploy

1. Commit your changes
2. Push to trigger deployment
3. Check logs for: `✅ Supabase database connection established successfully`

## Environment Variables Summary

**Required for Supabase:**
```bash
SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

**Keep these (unchanged):**
```bash
BOT_ACCESS_TOKEN=...
BOT_PHONE_NUMBER_ID=...
RUBIES_API_KEY=...
AI_API_KEY=...
APP_SECRET=...
# ... other service configs
```

**Remove/Disable these (DigitalOcean DB):**
```bash
# DB_CONNECTION_URL=postgresql://...ondigitalocean.com...  # Remove or comment out
# DB_HOST=...ondigitalocean.com...  # Remove or comment out
```

## Verification

After deployment, check logs for:

✅ **Success:**
```
✅ Supabase database connection established successfully
✅ Database models synchronized
```

❌ **Failure:**
```
❌ Failed to connect to Supabase database
⚠️ Supabase database configuration missing
```

## Troubleshooting

### "No Supabase database configuration found"
- Verify `SUPABASE_DB_URL` is set in environment variables
- Check the connection string format is correct
- Ensure `sslmode=require` is included

### "Connection refused" or "ENOTFOUND"
- Verify hostname is correct (should contain `supabase.com`)
- Check port (6543 for pooler, 5432 for direct)
- Ensure SSL is enabled

### "Authentication failed"
- Verify username format: `postgres.[project-ref]`
- Check password is correct (database password, not project password)
- Ensure no extra spaces in connection string

## Connection String Format

**Connection Pooler (Recommended):**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

**Direct Connection:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require
```

## Need Help?

- See full guide: `SUPABASE_MIGRATION_GUIDE.md`
- Supabase Docs: https://supabase.com/docs
- Check application logs in DigitalOcean dashboard

---

**Quick Checklist:**
- [ ] Supabase project created
- [ ] Connection string copied
- [ ] `SUPABASE_DB_URL` environment variable set
- [ ] Old DigitalOcean DB variables removed/commented
- [ ] Schema SQL run in Supabase
- [ ] Application deployed
- [ ] Connection successful in logs

