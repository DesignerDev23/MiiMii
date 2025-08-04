#!/bin/bash

# MiiMii Deployment Verification Script
# Run this after deploying to DigitalOcean

echo "🚀 MiiMii Deployment Verification"
echo "================================="
echo ""

BASE_URL="miimii-app-p8gzu.ondigitalocean.app"
WEBHOOK_URL="https://${BASE_URL}/webhook/whatsapp"
VERIFY_TOKEN="Verify_MiiMii"

echo "📋 Configuration:"
echo "   Base URL: ${BASE_URL}"
echo "   Webhook URL: ${WEBHOOK_URL}"
echo "   Verify Token: ${VERIFY_TOKEN}"
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Server Health..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${BASE_URL}/health" 2>/dev/null)

if [ "$HEALTH_STATUS" = "200" ]; then
    echo "   ✅ Server is healthy (HTTP $HEALTH_STATUS)"
else
    echo "   ❌ Server health check failed (HTTP $HEALTH_STATUS)"
    echo "   💡 Check DigitalOcean App Platform logs"
fi
echo ""

# Test 2: Webhook Verification
echo "2️⃣ Testing Webhook Verification..."
CHALLENGE="test_$(date +%s)"
WEBHOOK_RESPONSE=$(curl -s "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}" 2>/dev/null)

if [ "$WEBHOOK_RESPONSE" = "$CHALLENGE" ]; then
    echo "   ✅ Webhook verification successful"
    echo "   ✅ Challenge response: $WEBHOOK_RESPONSE"
else
    echo "   ❌ Webhook verification failed"
    echo "   ❌ Expected: $CHALLENGE"
    echo "   ❌ Got: $WEBHOOK_RESPONSE"
    echo "   💡 Check webhook token and server logs"
fi
echo ""

# Summary
echo "📊 Summary:"
if [ "$HEALTH_STATUS" = "200" ] && [ "$WEBHOOK_RESPONSE" = "$CHALLENGE" ]; then
    echo "   🎉 All tests passed! Your webhook is ready."
    echo ""
    echo "📱 Next Steps:"
    echo "   1. Configure webhook in Meta Developer Console:"
    echo "      URL: ${WEBHOOK_URL}"
    echo "      Token: ${VERIFY_TOKEN}"
    echo ""
    echo "   2. Subscribe to webhook fields:"
    echo "      - messages"
    echo "      - message_deliveries"
    echo "      - message_reads"
    echo "      - message_echoes"
    echo ""
    echo "   3. Send test message to your WhatsApp Business number"
    echo ""
    echo "🚀 MiiMii is ready for production!"
else
    echo "   ❌ Some tests failed. Please fix issues before proceeding."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Check DigitalOcean App Platform deployment status"
    echo "   - Verify environment variables are set correctly"
    echo "   - Check application logs for errors"
fi