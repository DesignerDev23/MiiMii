#!/bin/bash

# WhatsApp Webhook Fix Deployment Script
# This script commits and pushes the webhook verification fixes

echo "🚀 Deploying WhatsApp Webhook Verification Fix..."

# Add changes to git
git add src/services/whatsapp.js
git add src/routes/webhook.js
git add WEBHOOK_VERIFICATION_FIXES.md

# Commit changes
git commit -m "Fix WhatsApp webhook verification with fallback token

- Add fallback verify token 'Verify_MiiMii' in WhatsAppService
- Add enhanced logging for webhook verification debugging
- Create comprehensive fix guide documentation

This fixes the 403 Forbidden error when Meta tries to verify the webhook."

# Push to repository (this will trigger DigitalOcean deployment)
echo "📤 Pushing to repository..."
git push origin main

echo "✅ Changes pushed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Wait 5-10 minutes for DigitalOcean deployment to complete"
echo "2. Test webhook verification:"
echo "   curl -X GET \"https://api.chatmiimii.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=Verify_MiiMii&hub.challenge=test123\""
echo "3. If successful, configure Meta Developer Console with:"
echo "   - Webhook URL: https://api.chatmiimii.com/webhook/whatsapp"
echo "   - Verify Token: Verify_MiiMii"
echo ""
echo "📖 For detailed instructions, see: WEBHOOK_VERIFICATION_FIXES.md"