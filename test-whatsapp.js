#!/usr/bin/env node

/**
 * WhatsApp Business API Test Script
 * 
 * This script demonstrates the various WhatsApp features integrated with Gupshup
 * including flow messages, interactive messages, and standard messaging.
 * 
 * Usage: node test-whatsapp.js [phone_number]
 * Example: node test-whatsapp.js +1234567890
 */

require('dotenv').config();
const whatsappService = require('./src/services/whatsappService');

const testPhoneNumber = process.argv[2] || process.env.TEST_PHONE_NUMBER;

if (!testPhoneNumber) {
    console.log('❌ Please provide a phone number as argument or set TEST_PHONE_NUMBER in .env');
    console.log('Usage: node test-whatsapp.js +1234567890');
    process.exit(1);
}

console.log('🚀 Starting WhatsApp Business API Test Suite');
console.log('📱 Test Phone Number:', testPhoneNumber);
console.log('---');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    try {
        console.log('1️⃣ Testing User Opt-in...');
        await whatsappService.optInUser(testPhoneNumber);
        console.log('✅ User opt-in successful');
        await sleep(2000);

        console.log('\n2️⃣ Testing Welcome Message...');
        await whatsappService.sendWelcomeMessage(testPhoneNumber, 'Test User');
        console.log('✅ Welcome message sent');
        await sleep(3000);

        console.log('\n3️⃣ Testing Services Menu...');
        await whatsappService.sendServicesMenu(testPhoneNumber);
        console.log('✅ Services menu sent');
        await sleep(3000);

        console.log('\n4️⃣ Testing Button Message...');
        const buttons = [
            { id: 'test1', title: '🔵 Option 1' },
            { id: 'test2', title: '🟢 Option 2' },
            { id: 'test3', title: '🟡 Option 3' }
        ];
        await whatsappService.sendButtonMessage(
            testPhoneNumber, 
            '🎛️ Interactive Button Test\n\nChoose one of the options below:',
            buttons
        );
        console.log('✅ Button message sent');
        await sleep(3000);

        console.log('\n5️⃣ Testing List Message...');
        const sections = [
            {
                title: '🏦 Banking',
                rows: [
                    { id: 'bal', title: 'Check Balance', description: 'View account balance' },
                    { id: 'trans', title: 'Transfer Money', description: 'Send money to others' }
                ]
            },
            {
                title: '📈 Investments',
                rows: [
                    { id: 'port', title: 'Portfolio', description: 'View investments' },
                    { id: 'invest', title: 'Invest Now', description: 'Start investing' }
                ]
            }
        ];
        await whatsappService.sendListMessage(
            testPhoneNumber,
            '📋 Test List Message\n\nSelect a service from the menu below:',
            'Select Service',
            sections
        );
        console.log('✅ List message sent');
        await sleep(3000);

        console.log('\n6️⃣ Testing Verification Code...');
        const verificationCode = Math.floor(100000 + Math.random() * 900000);
        await whatsappService.sendVerificationCode(testPhoneNumber, verificationCode.toString());
        console.log('✅ Verification code sent');
        await sleep(3000);

        console.log('\n7️⃣ Testing Transaction Notification...');
        const transaction = {
            type: 'credit',
            amount: '125.50',
            currency: 'USD',
            counterparty: 'John Doe',
            reference: 'TXN' + Date.now(),
            balance: '1,350.75',
            timestamp: new Date().toISOString()
        };
        await whatsappService.sendTransactionNotification(testPhoneNumber, transaction);
        console.log('✅ Transaction notification sent');
        await sleep(3000);

        console.log('\n8️⃣ Testing Payment Reminder...');
        const billData = {
            id: 'BILL' + Date.now(),
            service: 'Electricity Bill',
            amount: '89.99',
            currency: 'USD',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
        await whatsappService.sendPaymentReminder(testPhoneNumber, billData);
        console.log('✅ Payment reminder sent');
        await sleep(3000);

        // Test Flow Messages (if flow IDs are configured)
        if (process.env.GUPSHUP_ONBOARDING_FLOW_ID) {
            console.log('\n9️⃣ Testing Onboarding Flow...');
            await whatsappService.sendOnboardingFlow(testPhoneNumber, 'individual');
            console.log('✅ Onboarding flow sent');
            await sleep(3000);
        } else {
            console.log('\n9️⃣ ⚠️ Skipping Onboarding Flow (GUPSHUP_ONBOARDING_FLOW_ID not configured)');
        }

        console.log('\n🎉 All WhatsApp tests completed successfully!');
        console.log('\n📋 Test Summary:');
        console.log('✅ User opt-in');
        console.log('✅ Welcome message');
        console.log('✅ Services menu');
        console.log('✅ Button interactions');
        console.log('✅ List messages');
        console.log('✅ Verification codes');
        console.log('✅ Transaction notifications');
        console.log('✅ Payment reminders');
        if (process.env.GUPSHUP_ONBOARDING_FLOW_ID) {
            console.log('✅ Flow messages');
        }

        console.log('\n💡 Next Steps:');
        console.log('1. Check your WhatsApp messages');
        console.log('2. Test interactive responses');
        console.log('3. Complete flow forms if sent');
        console.log('4. Set up webhook URL for production');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('1. Check your Gupshup API credentials in .env');
        console.error('2. Ensure phone number is registered with WhatsApp Business');
        console.error('3. Verify webhook URL is accessible');
        console.error('4. Check Gupshup dashboard for errors');
        process.exit(1);
    }
}

// Run the tests
runTests();