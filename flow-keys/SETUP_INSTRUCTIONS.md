# WhatsApp Flow Setup Instructions

## 1. Generated Files
- Private Key: C:\Users\lenovo\Desktop\node.js\MiiMii\flow-keys\private_key.pem
- Public Key: C:\Users\lenovo\Desktop\node.js\MiiMii\flow-keys\public_key.pem
- Environment Variables: C:\Users\lenovo\Desktop\node.js\MiiMii\flow-keys\.env.flow

## 2. Next Steps

### A. Upload Public Key to Meta
1. Go to WhatsApp Business Manager
2. Navigate to Message Templates
3. Find Flow Settings or Endpoint Configuration
4. Upload the public_key.pem file

### B. Add Environment Variables to Digital Ocean
Copy the contents of .env.flow to your Digital Ocean environment variables.

### C. Test Your Endpoint
```bash
# Test health check
curl -X GET "https://api.chatmiimii.com/api/flow/health"

# Expected response:
{
  "status": "healthy",
  "encryption": true,
  "services": {
    "database": "connected",
    "userService": "available",
    "onboardingService": "available"
  }
}
```

### D. Create Flows in WhatsApp Manager
1. Get Flow JSON:
   ```bash
   curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/onboarding"
   curl -X GET "https://api.chatmiimii.com/api/whatsapp/test-flow-json/login"
   ```

2. Create flows in WhatsApp Business Manager using the JSON responses

3. Update Flow IDs in environment variables

## 3. Security Notes
- Keep private_key.pem secure and never share it
- The passphrase is: miimii-flow-secure-passphrase-2024
- Delete the keys directory after setting up environment variables

## 4. Testing
After setup, test with:
```bash
curl -X POST "https://api.chatmiimii.com/api/whatsapp/send-flow-message" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "2348012345678",
    "flowType": "onboarding"
  }'
```
