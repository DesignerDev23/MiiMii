# MiiMii Fintech Platform - Deployment Troubleshooting Guide

## ✅ Fixed Issues in This Update

### 1. Application Startup Failures ✅ FIXED
**Problem**: App failed to start because database connection was required during startup
**Solution**: Modified startup sequence to start server first, then connect to dependencies asynchronously

### 2. Health Check Configuration ✅ FIXED  
**Problem**: Health checks were too strict and failed when dependencies weren't ready
**Solution**: Improved health checks to be more graceful and return 200 even with degraded services

### 3. Docker Health Check Timeout ✅ FIXED
**Problem**: Health check had insufficient time for app startup
**Solution**: Increased startup period from 40s to 60s and timeout from 10s to 15s

### 4. Missing Environment Variables ✅ FIXED
**Problem**: App crashed when critical environment variables were missing
**Solution**: Added fallback mechanisms and graceful degradation for missing config

## 🚀 Application Startup Behavior

The application now follows this improved startup sequence:

1. **Server Starts Immediately** - HTTP server starts on port 3000 right away
2. **Health Checks Pass** - `/healthz` endpoint responds immediately 
3. **Dependencies Initialize Async** - Database and Redis connect in background
4. **Graceful Degradation** - App continues running even if some services fail

## 📋 Environment Variables Configuration

### Required for Basic Operation
```bash
PORT=3000                    # Server port (defaults to 3000)
NODE_ENV=production         # Environment mode
```

### Required for Full Functionality
```bash
# Database (at least one method required)
DB_CONNECTION_URL=postgres://user:pass@host:port/dbname
# OR individual parameters:
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password

# JWT Authentication
APP_SECRET=your-jwt-secret-key

# WhatsApp Integration
BOT_ACCESS_TOKEN=your-whatsapp-token
BOT_PHONE_NUMBER_ID=your-phone-number-id
BOT_BUSINESS_ACCOUNT_ID=your-business-account-id
BOT_WEBHOOK_VERIFY_TOKEN=your-webhook-token
```

### Optional Services
```bash
# Redis (optional - app works without it)
REDIS_URL=redis://user:pass@host:port

# AI Features (optional)
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4-turbo

# Banking Integration (optional)
BANK_CONSUMER_KEY=your-bellbank-key
BANK_CONSUMER_SECRET=your-bellbank-secret

# Other services...
```

## 🔍 Health Check Endpoints

### `/healthz` - Simple Health Check
- Returns 200 if server is running
- No dependency checks
- Used by Docker health check
- **Always use this for load balancer health checks**

### `/health` - Comprehensive Health Check  
- Returns detailed service status
- Shows database and Redis connectivity
- Returns 200 even if some services are degraded
- Use for monitoring and diagnostics

## 🐛 Common Issues and Solutions

### Issue: "Connection Refused on Port 3000"
**Symptoms**: Cannot connect to application
**Solutions**:
1. Check if PORT environment variable is set correctly
2. Verify container is exposing port 3000
3. Check firewall/security group settings
4. Ensure application started successfully (check logs)

### Issue: "Database Connection Failed"
**Symptoms**: App starts but database features don't work
**Solutions**:
1. Verify DB_CONNECTION_URL is correctly formatted
2. Check database server is accessible from app
3. Validate database credentials
4. Ensure SSL configuration matches your database setup

### Issue: "WhatsApp Features Not Working"
**Symptoms**: App starts but doesn't respond to WhatsApp messages
**Solutions**:
1. Set BOT_ACCESS_TOKEN environment variable
2. Configure webhook URL in Meta Developer Console
3. Verify BOT_PHONE_NUMBER_ID is correct
4. Check webhook verify token matches

### Issue: "Health Check Failing"
**Symptoms**: Container keeps restarting
**Solutions**:
1. Increase health check timeout and start period
2. Use `/healthz` endpoint instead of `/health`
3. Check application logs for startup errors
4. Verify all required environment variables are set

## 📊 Monitoring and Diagnostics

### Check Application Status
```bash
# Test basic connectivity
curl http://your-app-url/healthz

# Get detailed health information
curl http://your-app-url/health

# Test main API endpoint
curl http://your-app-url/
```

### View Application Logs
```bash
# In DigitalOcean App Platform
# Go to your app dashboard → Runtime Logs

# Look for these log messages:
# ✅ "MiiMii Fintech Platform server started successfully"
# ✅ "Database connection established successfully" 
# ℹ️ "Redis not configured - running without Redis features"
# ⚠️ "Database connection failed - continuing without database features"
```

## ⚙️ DigitalOcean Specific Configuration

### App Platform Settings
- **Instance Size**: Minimum `apps-s-1vcpu-0.5gb` recommended
- **Health Check**: Use `/healthz` endpoint
- **Port**: Ensure HTTP port is set to 3000
- **Start Period**: Minimum 60 seconds recommended

### Environment Variables in DO Console
1. Go to your app in DigitalOcean dashboard
2. Navigate to Settings → Environment Variables
3. Add variables using the format from this guide
4. Deploy changes

## 🔧 Quick Fixes

### If App Won't Start At All
1. Check that `PORT=3000` is set
2. Verify Docker image builds successfully
3. Check startup command is `npm start`
4. Review runtime logs for specific errors

### If App Starts But Features Don't Work
1. Add missing environment variables one by one
2. Check `/health` endpoint to see which services are down
3. Start with database configuration first
4. Add other integrations after basic app is working

### If Health Checks Keep Failing
1. Change health check URL to `/healthz`
2. Increase timeout to 15+ seconds
3. Increase start period to 60+ seconds
4. Test endpoint manually first

## 📞 Support

If issues persist after following this guide:
1. Check application logs in DigitalOcean dashboard
2. Test endpoints manually using curl
3. Verify environment variables are set correctly
4. Review the `/health` endpoint response for detailed status

The application is now designed to be much more resilient and should start successfully even with minimal configuration!