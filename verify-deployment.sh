#!/bin/bash

# MiiMii API Deployment Verification Script
# This script verifies that all critical services are running correctly

echo "🔍 MiiMii API Deployment Verification"
echo "======================================"

API_URL="${1:-http://localhost:3000}"
echo "Testing API at: $API_URL"
echo ""

# Test basic health endpoint
echo "1. Testing basic health endpoint..."
HEALTH_RESPONSE=$(curl -s "$API_URL/health" 2>/dev/null)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo "✅ Basic health check passed"
else
    echo "❌ Basic health check failed"
    echo "Response: $HEALTH_RESPONSE"
fi
echo ""

# Test WhatsApp service health
echo "2. Testing WhatsApp service health..."
if [ "$NODE_ENV" != "production" ]; then
    WA_HEALTH_RESPONSE=$(curl -s "$API_URL/api/test/whatsapp-health" 2>/dev/null)
    if echo "$WA_HEALTH_RESPONSE" | grep -q "success"; then
        echo "✅ WhatsApp service health check passed"
        echo "Response: $WA_HEALTH_RESPONSE"
    else
        echo "❌ WhatsApp service health check failed"
        echo "Response: $WA_HEALTH_RESPONSE"
    fi
else
    echo "⚠️  WhatsApp health check only available in development mode"
fi
echo ""

# Test system info
echo "3. Testing system info endpoint..."
if [ "$NODE_ENV" != "production" ]; then
    SYSTEM_RESPONSE=$(curl -s "$API_URL/api/test/system-info" 2>/dev/null)
    if echo "$SYSTEM_RESPONSE" | grep -q "success"; then
        echo "✅ System info endpoint working"
        # Check if critical environment variables are set
        if echo "$SYSTEM_RESPONSE" | grep -q '"WHATSAPP_ACCESS_TOKEN":"Set"'; then
            echo "✅ WhatsApp access token is configured"
        else
            echo "❌ WhatsApp access token is NOT configured"
        fi
    else
        echo "❌ System info endpoint failed"
        echo "Response: $SYSTEM_RESPONSE"
    fi
else
    echo "⚠️  System info only available in development mode"
fi
echo ""

# Test 2: Webhook Verification
echo "2️⃣ Testing Webhook Verification..."
CHALLENGE="test_$(date +%s)"
WEBHOOK_URL="https://${BASE_URL}/webhook/whatsapp"
VERIFY_TOKEN="Verify_MiiMii"

echo "📋 Configuration:"
echo "   Base URL: ${BASE_URL}"
echo "   Webhook URL: ${WEBHOOK_URL}"
echo "   Verify Token: ${VERIFY_TOKEN}"
echo ""

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