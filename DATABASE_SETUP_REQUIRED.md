# Database Setup Required

## Current Status

Your application is configured to use **Supabase** as the database, but the connection configuration is missing.

## Quick Fix

### Step 1: Set Environment Variable

In your **DigitalOcean App Platform**:

1. Go to your App → **Settings** → **App-Level Environment Variables**
2. Add a new variable:
   - **Key**: `SUPABASE_DB_URL`
   - **Value**: Your Supabase connection string

### Step 2: Get Supabase Connection String

1. **Create Supabase Project** (if you haven't):
   - Go to https://supabase.com
   - Sign up/Login
   - Click "New Project"
   - Fill in project details and **save the database password**

2. **Get Connection String**:
   - In Supabase dashboard → **Settings** → **Database**
   - Scroll to **Connection string** section
   - Select **"URI"** tab
   - Copy the connection string

   It should look like:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
   ```

3. **Paste into DigitalOcean**:
   - Add as `SUPABASE_DB_URL` environment variable
   - Save and redeploy

### Step 3: Run Database Schema

1. In Supabase dashboard → **SQL Editor**
2. Click **"New Query"**
3. Open `supabase/schema.sql` from your project
4. Copy and paste entire contents
5. Click **Run**

### Step 4: Redeploy

After setting the environment variable, redeploy your app. You should see:
```
✅ Supabase database connection established successfully
```

## Alternative: Use Individual Parameters

Instead of `SUPABASE_DB_URL`, you can set:

```bash
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.[project-ref]
SUPABASE_DB_PASSWORD=your-password
```

## Verification

After deployment, check logs for:

✅ **Success:**
```
✅ Supabase database connection established successfully
✅ Database models synchronized
```

❌ **Still Missing Config:**
```
❌ No Supabase database configuration found!
⚠️ Supabase database configuration missing
```

## Need Help?

- See detailed guide: `SUPABASE_MIGRATION_GUIDE.md`
- Quick setup: `SUPABASE_QUICK_SETUP.md`
- Supabase Docs: https://supabase.com/docs

---

**Important**: The application will run without database connectivity, but database-dependent features will not work until `SUPABASE_DB_URL` is configured.

