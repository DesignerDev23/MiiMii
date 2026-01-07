# Supabase Connection Fix

## Issue

The connection is failing with `EHOSTUNREACH` IPv6 error. This is because Node.js is trying to connect via IPv6, but the network might not support it.

## Solution Applied

1. **Force IPv4 connections** - Added `family: 4` to connection options
2. **Use correct host format** - Ensure you're using the right Supabase host

## Environment Variables to Set

Based on your Supabase project URL `https://lqsniurvgycvtouqxuzi.supabase.co`, set these:

### Option 1: Direct Connection (Current)

```bash
SUPABASE_DB_HOST=db.lqsniurvgycvtouqxuzi.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=QtiNWQvJiVINNqG9
```

### Option 2: Connection Pooler (Recommended - More Reliable)

1. Go to Supabase Dashboard → **Settings** → **Database**
2. Scroll to **Connection pooling** section
3. Select **Session mode**
4. Copy the connection string
5. Extract the host (it will look like `aws-0-[region].pooler.supabase.com`)
6. Use port `6543`

Then set:
```bash
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.[project-ref]
SUPABASE_DB_PASSWORD=QtiNWQvJiVINNqG9
```

**Note**: For pooler, the username format is `postgres.[project-ref]` not just `postgres`

## Get Your Project Reference

Your project reference is: `lqsniurvgycvtouqxuzi`

So:
- Direct host: `db.lqsniurvgycvtouqxuzi.supabase.co`
- Pooler username: `postgres.lqsniurvgycvtouqxuzi` (if using pooler)

## How to Find Pooler Connection Details

1. Supabase Dashboard → **Settings** → **Database**
2. Scroll to **Connection pooling**
3. Click **Session mode** tab
4. Copy the **Connection string**
5. It will look like:
   ```
   postgresql://postgres.lqsniurvgycvtouqxuzi:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
   ```
6. Extract:
   - Host: `aws-0-[region].pooler.supabase.com`
   - Port: `6543`
   - User: `postgres.lqsniurvgycvtouqxuzi`
   - Password: `[password]`

## Recommended Setup

**Use Connection Pooler** - It's more reliable and handles connections better:

```bash
# Remove or comment out SUPABASE_DB_URL
# SUPABASE_DB_URL=...

# Set individual parameters
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.lqsniurvgycvtouqxuzi
SUPABASE_DB_PASSWORD=your-actual-password
```

## IPv6 Fix Applied

The code now forces IPv4 connections (`family: 4`) which should resolve the `EHOSTUNREACH` error.

## Verification

After setting variables and redeploying, check logs for:

✅ **Success:**
```
✅ Supabase database connection established successfully
```

❌ **Still failing:**
- Check host is correct
- Verify password (get fresh one from Supabase dashboard)
- Try connection pooler instead of direct connection
- Check Supabase project is active and not paused

## Troubleshooting

### "EHOSTUNREACH" or IPv6 errors
- ✅ Fixed: Code now forces IPv4
- If still failing, try connection pooler

### "Authentication failed"
- Get fresh password from Supabase dashboard
- Check username format (direct: `postgres`, pooler: `postgres.[project-ref]`)

### "Connection refused"
- Verify host is correct
- Check port (5432 for direct, 6543 for pooler)
- Ensure Supabase project is not paused

---

**Next Steps:**
1. Get connection pooler details from Supabase dashboard
2. Set `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`
3. Redeploy
4. Check logs

