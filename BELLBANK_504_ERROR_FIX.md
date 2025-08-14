# BellBank 504 Gateway Timeout Error Fix

## Problem Summary

The BellBank API was returning 504 Gateway Timeout errors when attempting to create virtual accounts during user onboarding. This was causing the onboarding process to fail and preventing users from getting their virtual accounts created.

## Root Cause Analysis

The 504 Gateway Timeout error indicates that:
1. BellBank's API server is taking too long to respond
2. The request is timing out at the gateway/proxy level (Cloudflare)
3. BellBank's backend services are experiencing high load or temporary issues

## Implemented Solution

### 1. Enhanced Retry Logic with Circuit Breaker Pattern

**File: `src/services/bellbank.js`**

- Added circuit breaker pattern to prevent cascading failures
- Implemented exponential backoff retry strategy
- Increased timeout for virtual account creation (3 minutes)
- Added specific error handling for different HTTP status codes

**Key Features:**
- **Circuit Breaker**: Opens after 3 consecutive failures, resets after 5 minutes
- **Retry Strategy**: Up to 5 attempts with exponential backoff (3s, 6s, 12s, 24s, 48s)
- **Smart Retry Logic**: Only retries server errors (500+) and specific client errors (408, 429, 499)
- **Timeout Management**: 3-minute timeout for virtual account creation operations

### 2. Improved Error Handling and User Experience

**File: `src/services/wallet.js`**

- Added specific error classification for BellBank API errors
- Implemented graceful degradation when BellBank is unavailable
- Enhanced logging for better debugging and monitoring
- Added activity logging for failed virtual account creations

**Key Features:**
- **Error Classification**: Distinguishes between BellBank API errors and other errors
- **Graceful Degradation**: Onboarding continues even if virtual account creation fails
- **User Communication**: Sends appropriate messages to users about temporary issues
- **Comprehensive Logging**: Detailed logs for troubleshooting and monitoring

### 3. Background Retry System

**File: `src/workers/maintenance.js`**

- Added background job to retry failed virtual account creations
- Processes users without virtual accounts every 5 minutes
- Sends success notifications when virtual accounts are created
- Handles batch processing to avoid overwhelming the API

**Key Features:**
- **Automatic Retry**: Checks for failed virtual account creations every 5 minutes
- **Batch Processing**: Processes up to 10 users at a time
- **Success Notifications**: Informs users when their virtual account is ready
- **Rate Limiting**: 2-second delay between retries to avoid API overload

### 4. Admin Tools for Monitoring and Debugging

**File: `src/routes/admin.js`**

- Added endpoints to check BellBank API status
- Created tools to manually retry virtual account creation
- Added endpoint to list users without virtual accounts
- Implemented force recreation option for testing

**Available Endpoints:**
- `POST /admin/retry-virtual-accounts` - Manually retry virtual account creation
- `GET /admin/bellbank-status` - Check BellBank API health
- `GET /admin/users-without-va` - List users without virtual accounts

## Error Handling Strategy

### 1. Immediate Response (During Onboarding)
- If BellBank API fails, onboarding continues successfully
- User receives message about temporary banking partner issues
- Virtual account creation is marked for background retry

### 2. Background Recovery
- Maintenance worker automatically retries failed creations
- Users are notified when their virtual account is ready
- System continues to function normally for other features

### 3. Monitoring and Alerting
- Comprehensive logging of all BellBank API interactions
- Activity logs for failed virtual account creations
- Admin tools for manual intervention when needed

## Configuration

### Environment Variables
```bash
# BellBank API Configuration
BELLBANK_ENV=sandbox|production  # Override environment
BANK_CONSUMER_KEY=your_consumer_key
BANK_CONSUMER_SECRET=your_consumer_secret

# Retry Configuration (in code)
MAX_RETRY_ATTEMPTS=5
BASE_RETRY_DELAY=3000ms
MAX_RETRY_DELAY=60000ms
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_RESET_TIMEOUT=300000ms
```

### Timeout Settings
- **Virtual Account Creation**: 180 seconds (3 minutes)
- **Transfer Operations**: 180 seconds (3 minutes)
- **Other Operations**: 120 seconds (2 minutes)

## Testing and Monitoring

### 1. Manual Testing
```bash
# Check BellBank API status
curl -X GET http://localhost:3000/admin/bellbank-status

# Retry virtual account creation for specific user
curl -X POST http://localhost:3000/admin/retry-virtual-accounts \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-id-here"}'

# List users without virtual accounts
curl -X GET "http://localhost:3000/admin/users-without-va?limit=10&offset=0"
```

### 2. Monitoring Logs
Look for these log patterns:
- `BellBank API server error, will retry` - Normal retry behavior
- `BellBank API temporarily unavailable` - Circuit breaker active
- `Successfully retried virtual account creation` - Recovery successful
- `Sent virtual account creation success message` - User notified

### 3. Key Metrics to Monitor
- Virtual account creation success rate
- BellBank API response times
- Circuit breaker state changes
- Background retry success rate
- User notification delivery rate

## Best Practices

### 1. For Developers
- Always use `makeRequestWithRetry` instead of `makeRequest` for BellBank API calls
- Handle `BellBankAPIError` specifically in error handling
- Use the admin endpoints for testing and debugging
- Monitor the maintenance worker logs for background retry status

### 2. For Operations
- Monitor BellBank API status regularly using the admin endpoint
- Check for users without virtual accounts periodically
- Review circuit breaker logs for API health trends
- Set up alerts for high failure rates

### 3. For Users
- Users are automatically notified when virtual accounts are created
- Onboarding continues even if virtual account creation fails
- All other MiiMii features remain functional during BellBank issues

## Future Improvements

1. **Multiple Banking Partners**: Implement fallback to other virtual account providers
2. **Real-time Status Dashboard**: Create a dashboard showing BellBank API health
3. **Advanced Circuit Breaker**: Implement half-open state with success rate monitoring
4. **Predictive Retry**: Use historical data to predict optimal retry times
5. **User Self-Service**: Allow users to manually trigger virtual account creation

## Conclusion

This solution provides a robust, fault-tolerant system for virtual account creation that:
- Handles BellBank API outages gracefully
- Maintains good user experience during issues
- Automatically recovers when the API becomes available
- Provides comprehensive monitoring and debugging tools
- Scales well with increased load and failure scenarios

The implementation follows industry best practices for handling external API dependencies and ensures that temporary issues with BellBank don't impact the overall user experience of the MiiMii platform.
