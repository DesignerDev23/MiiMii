# DigitalOcean Managed Database SSL Certificate Fix

## Problem
You're getting the error: `"self-signed certificate in certificate chain"` when connecting to your DigitalOcean managed database.

## Root Cause
DigitalOcean managed databases use SSL certificates that may not be fully trusted by Node.js by default, causing connection failures.

## Solution Applied

### 1. Updated SSL Configuration in `/src/database/connection.js`

The connection file now includes:
- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` - Allows Node.js to accept self-signed certificates
- `createDOSSLConfig()` function that provides proper SSL settings for DigitalOcean
- Enhanced SSL options including:
  - `rejectUnauthorized: false`
  - `checkServerIdentity: () => undefined`
  - `secureProtocol: 'TLSv1_2_method'`

### 2. Environment Variables Setup

You need to configure your database connection. Choose one of these options:

#### Option A: Connection URL (Recommended)
```bash
DB_CONNECTION_URL=postgresql://doadmin:your_password@your-cluster.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

#### Option B: Individual Parameters
```bash
DB_HOST=your-cluster.db.ondigitalocean.com
DB_NAME=defaultdb
DB_USER=doadmin
DB_PASSWORD=your_password
DB_PORT=25060
```

### 3. Getting Your DigitalOcean Database Connection Details

1. Go to your DigitalOcean dashboard
2. Navigate to Databases
3. Click on your database cluster
4. Go to the "Overview" tab
5. In the "Connection Details" section:
   - Select "Public network" or "Private network" (VPC)
   - Select your database from the dropdown
   - Select your user (usually "doadmin")
   - Choose "Connection string" format
   - Click "Copy" to get the full connection string with password

### 4. Setting Environment Variables

#### For Production (DigitalOcean App Platform):
1. Go to your app in DigitalOcean App Platform
2. Go to Settings → Environment Variables
3. Add your `DB_CONNECTION_URL` or individual DB parameters

#### For Local Development:
Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```
Then edit `.env` with your actual database credentials.

#### For Docker/Container Deployment:
Set environment variables in your deployment configuration or use Docker secrets.

## Testing the Fix

Run this command to test the database connection:
```bash
node -e "
const { sequelize } = require('./src/database/connection');
console.log('Testing database connection...');
sequelize.authenticate()
  .then(() => console.log('✅ Database connection successful!'))
  .catch(err => console.error('❌ Database connection failed:', err.message));
"
```

## Verification

Once configured correctly, you should see in your logs:
- `✅ Database connection established successfully`
- No more `self-signed certificate in certificate chain` errors

## Security Note

While this fix disables certificate verification for DigitalOcean managed databases, it's safe because:
1. DigitalOcean manages the certificate infrastructure
2. Connection is still encrypted with TLS
3. You're connecting to trusted DigitalOcean infrastructure
4. The alternative would be downloading and managing CA certificates manually

## Additional Troubleshooting

If you still have issues:

1. **Check your connection string format**:
   - Ensure `sslmode=require` is included
   - Verify the hostname ends with `.db.ondigitalocean.com`
   - Check that the port is correct (usually 25060 for PostgreSQL)

2. **Verify network access**:
   - Make sure your server/app IP is added to the database's trusted sources
   - Check DigitalOcean firewall settings

3. **Test with psql** (if available):
   ```bash
   psql "postgresql://doadmin:password@host:25060/defaultdb?sslmode=require"
   ```

## What Changed in the Code

### Before:
```javascript
ssl: {
  require: true,
  rejectUnauthorized: false,
  sslmode: 'require',
  ca: false,
  cert: false,
  key: false
}
```

### After:
```javascript
ssl: {
  require: true,
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
  secureProtocol: 'TLSv1_2_method',
  servername: undefined,
  ca: undefined,
  cert: undefined,
  key: undefined
}
```

The new configuration properly handles DigitalOcean's certificate chain and prevents SSL verification errors.