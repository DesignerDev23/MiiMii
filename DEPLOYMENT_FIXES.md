# Digital Ocean Deployment Fixes

## 🔍 Issues Identified

Based on the Digital Ocean App Platform error messages, the following issues need to be fixed:

### 1. Health Check Failure
- **Issue**: Application failed to respond to health checks on port 3000
- **Cause**: Health check endpoint might be too complex or slow
- **Fix**: Added simple `/healthz` endpoint that responds immediately

### 2. Missing Dependencies
- **Issue**: Using `npm ci --only=production` excludes dev dependencies
- **Cause**: Some runtime dependencies might be in devDependencies
- **Fix**: Changed to `npm install` to include all dependencies

### 3. Permission Issues
- **Issue**: Non-root user (miimii) might not have proper permissions
- **Cause**: Incomplete permission setup for the user
- **Fix**: Enhanced permission setup in Dockerfile

## 🔧 Fixes Applied

### 1. Dockerfile Fixes

**File**: `Dockerfile`
- Changed from `npm ci --only=production` to `npm install`
- Enhanced permission setup for non-root user
- Removed conflicting health check from Dockerfile
- Added proper ownership for all application files

### 2. Health Check Endpoints

**File**: `src/app.js`
- Added simple `/healthz` endpoint for Digital Ocean health checks
- Kept existing `/health` endpoint for detailed health monitoring
- Both endpoints respond on port 3000

### 3. Server Configuration

**File**: `src/app.js`
- Server already properly binds to `0.0.0.0:3000`
- Proper error handling for port binding
- Graceful shutdown handling

## 🚀 Deployment Steps

### Step 1: Commit and Push Changes

```bash
git add .
git commit -m "Fix Digital Ocean deployment issues: health checks, dependencies, permissions"
git push origin main
```

### Step 2: Monitor Deployment

1. Go to Digital Ocean App Platform dashboard
2. Check the deployment logs for any errors
3. Monitor the health check status

### Step 3: Verify Deployment

1. **Test Health Check**:
   ```bash
   curl https://api.chatmiimii.com/healthz
   ```

2. **Test Detailed Health**:
   ```bash
   curl https://api.chatmiimii.com/health
   ```

3. **Test Webhook**:
   ```bash
   node test-webhook.js
   ```

## 📋 Verification Checklist

- [ ] Health check endpoint responds immediately
- [ ] Server binds to 0.0.0.0:3000
- [ ] All dependencies are installed
- [ ] Non-root user has proper permissions
- [ ] Database connection works
- [ ] Webhook endpoints are accessible
- [ ] WhatsApp service is configured

## 🐛 Common Issues and Solutions

### Issue: Health Check Still Failing
**Solution**: 
1. Check Digital Ocean App Platform logs
2. Verify the `/healthz` endpoint responds quickly
3. Ensure server starts within the timeout period

### Issue: Permission Denied Errors
**Solution**:
1. Verify the Dockerfile permission setup
2. Check that all files are owned by miimii:nodejs
3. Ensure the user can write to logs and uploads directories

### Issue: Missing Dependencies
**Solution**:
1. Check package.json for any missing dependencies
2. Ensure all required packages are in dependencies (not devDependencies)
3. Verify npm install completes successfully

### Issue: Port Binding Issues
**Solution**:
1. Verify server binds to 0.0.0.0:3000
2. Check that no other process is using port 3000
3. Ensure the application starts within the expected timeframe

## 📞 Support

If deployment issues persist:

1. Check Digital Ocean App Platform logs
2. Run the health check tests locally
3. Verify all environment variables are set
4. Test the application locally with Docker

## 🔄 Monitoring

After deployment, monitor these endpoints:

- Simple Health: `https://api.chatmiimii.com/healthz`
- Detailed Health: `https://api.chatmiimii.com/health`
- Webhook Test: `https://api.chatmiimii.com/api/webhook/whatsapp`

## 📝 Notes

- The `/healthz` endpoint responds immediately without database checks
- The `/health` endpoint provides detailed service status
- All dependencies are now installed (not just production)
- Proper permissions are set for the non-root user
- Server binds to 0.0.0.0:3000 for external access