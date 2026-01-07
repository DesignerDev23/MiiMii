# Supabase Environment Variables Setup

## Your Current Connection String

From your environment, you have:
```
SUPABASE_DB_URL=postgresql://postgres:[QtiNWQvJiVINNqG9]@db.lqsniurvgycvtouqxuzi.supabase.co:5432/postgres
```

## Recommended: Use Individual Parameters

Instead of using the connection string, set these individual environment variables:

### Required Variables

```bash
SUPABASE_DB_HOST=db.lqsniurvgycvtouqxuzi.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=QtiNWQvJiVINNqG9
```

**Note**: Remove the brackets `[]` from the password - they're not part of the actual password.

### Optional Variables

```bash
# Only set if you want to override defaults
SUPABASE_DB_PORT=5432  # Default: 5432 for direct, 6543 for pooler
SUPABASE_DB_NAME=postgres  # Default: postgres
SUPABASE_DB_USER=postgres  # Default: postgres
```

## How to Set in DigitalOcean

1. Go to your App → **Settings** → **App-Level Environment Variables**
2. **Remove or comment out** `SUPABASE_DB_URL`
3. **Add these new variables**:

   | Key | Value |
   |-----|-------|
   | `SUPABASE_DB_HOST` | `db.lqsniurvgycvtouqxuzi.supabase.co` |
   | `SUPABASE_DB_PORT` | `5432` |
   | `SUPABASE_DB_NAME` | `postgres` |
   | `SUPABASE_DB_USER` | `postgres` |
   | `SUPABASE_DB_PASSWORD` | `QtiNWQvJiVINNqG9` |

4. **Save** and **redeploy**

## Password Note

If your password contains special characters, make sure to:
- **Remove brackets** `[]` if they're in the connection string
- **URL-encode** special characters if needed (but Supabase passwords usually don't need this)
- **Keep the password exactly as shown** in Supabase dashboard (Settings → Database)

## Verification

After setting these variables and redeploying, you should see:

```
✅ Supabase database connection established successfully
✅ Database models synchronized
```

## Connection Pooler (Optional)

If you want to use Supabase's connection pooler (recommended for production):

1. In Supabase dashboard → **Settings** → **Database**
2. Find **Connection pooling** section
3. Use the **Session mode** connection string
4. Extract the host (it will be different, like `aws-0-[region].pooler.supabase.com`)
5. Use port `6543` instead of `5432`

Then set:
```bash
SUPABASE_DB_HOST=aws-0-[region].pooler.supabase.com
SUPABASE_DB_PORT=6543
```

## Troubleshooting

### "No Supabase database configuration found"
- Verify `SUPABASE_DB_HOST` and `SUPABASE_DB_PASSWORD` are both set
- Check for typos in variable names
- Ensure no extra spaces in values

### "Authentication failed"
- Verify password is correct (check in Supabase dashboard)
- Remove any brackets `[]` from password
- Check username is `postgres` (or your custom user)

### "Connection refused"
- Verify host is correct
- Check port (5432 for direct, 6543 for pooler)
- Ensure SSL is enabled (it's automatic with Supabase)

---

**Quick Checklist:**
- [ ] Removed `SUPABASE_DB_URL` (or keep it as fallback)
- [ ] Set `SUPABASE_DB_HOST`
- [ ] Set `SUPABASE_DB_PASSWORD` (without brackets)
- [ ] Set `SUPABASE_DB_PORT` (5432 or 6543)
- [ ] Set `SUPABASE_DB_NAME` (usually `postgres`)
- [ ] Set `SUPABASE_DB_USER` (usually `postgres`)
- [ ] Saved and redeployed
- [ ] Checked logs for successful connection

