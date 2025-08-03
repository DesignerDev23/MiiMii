const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');
const config = require('../config');

class WhatsAppService {
    constructor() {
        this.apiKey = process.env.GUPSHUP_API_KEY;
        this.appName = process.env.GUPSHUP_APP_NAME;
        this.sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER;
        this.baseURL = 'https://api.gupshup.io/sm/api/v1';
        this.botStudioURL = 'https://api.gupshup.io/wa/api/v1';
    }

    // Helper method to make API requests
    async makeRequest(endpoint, data, method = 'POST', isFormData = false) {
        try {
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: {
                    'Content-Type': isFormData ? 'multipart/form-data' : 'application/json',
                    'apikey': this.apiKey,
                },
                data
            };

            const response = await axios(config);
            return response.data;
        } catch (error) {
            logger.error('WhatsApp API Request Error:', error.response?.data || error.message);
            throw new Error(`WhatsApp API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    // Opt-in user to receive messages
    async optInUser(phoneNumber) {
        try {
            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'text',
                    text: 'Welcome to MiiMii Financial Assistant! You have successfully opted in to receive messages.'
                })
            };

            const response = await this.makeRequest('/app/opt/in', data);
            logger.info(`User ${phoneNumber} opted in successfully`);
            return response;
        } catch (error) {
            logger.error(`Failed to opt-in user ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Send text message
    async sendTextMessage(phoneNumber, message) {
        try {
            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'text',
                    text: message
                })
            };

            const response = await this.makeRequest('/msg', data);
            logger.info(`Text message sent to ${phoneNumber}`);
            return response;
        } catch (error) {
            logger.error(`Failed to send text message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Send interactive button message
    async sendButtonMessage(phoneNumber, text, buttons) {
        try {
            const buttonObjects = buttons.map((btn, index) => ({
                type: 'reply',
                reply: {
                    id: btn.id || `btn_${index}`,
                    title: btn.title
                }
            }));

            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: {
                            text: text
                        },
                        action: {
                            buttons: buttonObjects
                        }
                    }
                })
            };

            const response = await this.makeRequest('/msg', data);
            logger.info(`Button message sent to ${phoneNumber}`);
            return response;
        } catch (error) {
            logger.error(`Failed to send button message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Send list message
    async sendListMessage(phoneNumber, text, buttonText, sections) {
        try {
            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'interactive',
                    interactive: {
                        type: 'list',
                        body: {
                            text: text
                        },
                        action: {
                            button: buttonText,
                            sections: sections
                        }
                    }
                })
            };

            const response = await this.makeRequest('/msg', data);
            logger.info(`List message sent to ${phoneNumber}`);
            return response;
        } catch (error) {
            logger.error(`Failed to send list message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Send WhatsApp Flow message for onboarding
    async sendFlowMessage(phoneNumber, flowData) {
        try {
            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'interactive',
                    interactive: {
                        type: 'flow',
                        header: {
                            type: 'text',
                            text: flowData.header || 'Complete Your Registration'
                        },
                        body: {
                            text: flowData.body || 'Please fill out the form below to complete your MiiMii account setup.'
                        },
                        footer: {
                            text: flowData.footer || 'Secure • Encrypted • Private'
                        },
                        action: {
                            name: 'flow',
                            parameters: {
                                flow_message_version: '3',
                                flow_token: flowData.flow_token,
                                flow_id: flowData.flow_id,
                                flow_cta: flowData.cta || 'Get Started',
                                flow_action: 'navigate',
                                flow_action_payload: {
                                    screen: flowData.screen || 'personal_info',
                                    data: flowData.data || {}
                                }
                            }
                        }
                    }
                })
            };

            const response = await this.makeRequest('/msg', data);
            logger.info(`Flow message sent to ${phoneNumber}`);
            return response;
        } catch (error) {
            logger.error(`Failed to send flow message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Create onboarding flow for new users
    async sendOnboardingFlow(phoneNumber, userType = 'individual') {
        const flowData = {
            header: '🚀 Welcome to MiiMii!',
            body: 'Complete your profile setup to start your financial journey with us. This will take just 2 minutes.',
            footer: '🔒 Your data is secure and encrypted',
            flow_token: `onboarding_${Date.now()}`,
            flow_id: process.env.GUPSHUP_ONBOARDING_FLOW_ID,
            cta: 'Complete Setup',
            screen: 'personal_info',
            data: {
                user_type: userType,
                phone: phoneNumber,
                timestamp: new Date().toISOString()
            }
        };

        return await this.sendFlowMessage(phoneNumber, flowData);
    }

    // Send KYC verification flow
    async sendKYCFlow(phoneNumber, userId) {
        const flowData = {
            header: '📋 KYC Verification',
            body: 'Complete your identity verification to unlock all MiiMii features. Upload your documents securely.',
            footer: '✅ Bank-grade security',
            flow_token: `kyc_${userId}_${Date.now()}`,
            flow_id: process.env.GUPSHUP_KYC_FLOW_ID,
            cta: 'Verify Identity',
            screen: 'document_upload',
            data: {
                user_id: userId,
                phone: phoneNumber,
                verification_level: 'basic'
            }
        };

        return await this.sendFlowMessage(phoneNumber, flowData);
    }

    // Send transaction confirmation flow
    async sendTransactionFlow(phoneNumber, transactionData) {
        const flowData = {
            header: '💳 Confirm Transaction',
            body: `Please review and confirm your ${transactionData.type} of ${transactionData.currency} ${transactionData.amount}`,
            footer: 'Tap to proceed securely',
            flow_token: `txn_${transactionData.id}_${Date.now()}`,
            flow_id: process.env.GUPSHUP_TRANSACTION_FLOW_ID,
            cta: 'Confirm & Pay',
            screen: 'transaction_review',
            data: transactionData
        };

        return await this.sendFlowMessage(phoneNumber, flowData);
    }

    // Send template message
    async sendTemplateMessage(phoneNumber, templateId, templateParams = []) {
        try {
            const data = {
                'channel': 'whatsapp',
                'source': this.sourceNumber,
                'destination': phoneNumber,
                'src.name': this.appName,
                'message': JSON.stringify({
                    type: 'template',
                    template: {
                        namespace: process.env.GUPSHUP_NAMESPACE,
                        name: templateId,
                        language: {
                            policy: 'deterministic',
                            code: 'en'
                        },
                        components: templateParams.length > 0 ? [
                            {
                                type: 'body',
                                parameters: templateParams.map(param => ({
                                    type: 'text',
                                    text: param
                                }))
                            }
                        ] : []
                    }
                })
            };

            const response = await this.makeRequest('/msg', data);
            logger.info(`Template message sent to ${phoneNumber}`);
            return response;
        } catch (error) {
            logger.error(`Failed to send template message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    // Send welcome message with quick actions
    async sendWelcomeMessage(phoneNumber, userName) {
        const buttons = [
            { id: 'register', title: '📝 Register' },
            { id: 'learn_more', title: '📚 Learn More' },
            { id: 'support', title: '🎧 Support' }
        ];

        const welcomeText = `👋 Hello ${userName}!\n\nWelcome to MiiMii - Your AI-powered financial assistant. 🚀\n\nI can help you with:\n💰 Money transfers\n📊 Account management\n📈 Investment tracking\n💳 Bill payments\n\nWhat would you like to do?`;

        return await this.sendButtonMessage(phoneNumber, welcomeText, buttons);
    }

    // Send financial services menu
    async sendServicesMenu(phoneNumber) {
        const sections = [
            {
                title: '💰 Banking Services',
                rows: [
                    { id: 'balance', title: 'Check Balance', description: 'View your account balance' },
                    { id: 'transfer', title: 'Send Money', description: 'Transfer funds to others' },
                    { id: 'transactions', title: 'Transaction History', description: 'View recent transactions' }
                ]
            },
            {
                title: '📈 Investment Services',
                rows: [
                    { id: 'portfolio', title: 'Portfolio', description: 'View your investments' },
                    { id: 'invest', title: 'Invest Now', description: 'Explore investment options' },
                    { id: 'market', title: 'Market Updates', description: 'Latest market news' }
                ]
            },
            {
                title: '💳 Payment Services',
                rows: [
                    { id: 'bills', title: 'Pay Bills', description: 'Utility and service payments' },
                    { id: 'mobile', title: 'Mobile Recharge', description: 'Top up your mobile' },
                    { id: 'qr_pay', title: 'QR Payment', description: 'Scan and pay' }
                ]
            }
        ];

        const text = '🏦 *MiiMii Financial Services*\n\nChoose from our comprehensive financial services:';
        
        return await this.sendListMessage(phoneNumber, text, 'Select Service', sections);
    }

    // Send account verification code
    async sendVerificationCode(phoneNumber, code) {
        const message = `🔐 Your MiiMii verification code is: *${code}*\n\nThis code will expire in 10 minutes. Do not share this code with anyone.\n\n#MiiMiiSecure`;
        
        return await this.sendTextMessage(phoneNumber, message);
    }

    // Send transaction notification
    async sendTransactionNotification(phoneNumber, transaction) {
        const emoji = transaction.type === 'credit' ? '💰' : '💳';
        const message = `${emoji} *Transaction ${transaction.type === 'credit' ? 'Received' : 'Sent'}*\n\n` +
                       `Amount: ${transaction.currency} ${transaction.amount}\n` +
                       `${transaction.type === 'credit' ? 'From' : 'To'}: ${transaction.counterparty}\n` +
                       `Date: ${new Date(transaction.timestamp).toLocaleDateString()}\n` +
                       `Reference: ${transaction.reference}\n\n` +
                       `Balance: ${transaction.currency} ${transaction.balance}`;

        return await this.sendTextMessage(phoneNumber, message);
    }

    // Send payment reminder
    async sendPaymentReminder(phoneNumber, billData) {
        const message = `🔔 *Payment Reminder*\n\n` +
                       `Bill: ${billData.service}\n` +
                       `Amount: ${billData.currency} ${billData.amount}\n` +
                       `Due Date: ${billData.dueDate}\n\n` +
                       `Pay now to avoid late fees!`;

        const buttons = [
            { id: `pay_${billData.id}`, title: '💳 Pay Now' },
            { id: 'remind_later', title: '⏰ Remind Later' },
            { id: 'view_details', title: '📄 View Details' }
        ];

        return await this.sendButtonMessage(phoneNumber, message, buttons);
    }

    // Handle webhook messages
    async handleWebhook(webhookData) {
        try {
            const { type, payload } = webhookData;

            switch (type) {
                case 'message':
                    return await this.handleIncomingMessage(payload);
                case 'flow-response':
                    return await this.handleFlowResponse(payload);
                case 'delivery-status':
                    return await this.handleDeliveryStatus(payload);
                default:
                    logger.warn('Unknown webhook type:', type);
                    return { status: 'ignored' };
            }
        } catch (error) {
            logger.error('Webhook handling error:', error);
            throw error;
        }
    }

    // Handle incoming messages
    async handleIncomingMessage(payload) {
        const { from, message, timestamp } = payload;
        
        logger.info(`Incoming message from ${from}:`, message);

        // Basic message routing
        if (message.type === 'text') {
            const text = message.text.toLowerCase();
            
            if (text.includes('balance')) {
                return await this.sendBalanceInfo(from);
            } else if (text.includes('help')) {
                return await this.sendServicesMenu(from);
            } else if (text.includes('register') || text.includes('signup')) {
                return await this.sendOnboardingFlow(from);
            }
        } else if (message.type === 'interactive') {
            return await this.handleInteractiveMessage(from, message);
        }

        return { status: 'processed' };
    }

    // Handle interactive message responses
    async handleInteractiveMessage(from, message) {
        const { interactive } = message;
        
        if (interactive.type === 'button_reply') {
            const buttonId = interactive.button_reply.id;
            
            switch (buttonId) {
                case 'register':
                    return await this.sendOnboardingFlow(from);
                case 'learn_more':
                    return await this.sendAboutMessage(from);
                case 'support':
                    return await this.sendSupportMessage(from);
                default:
                    return await this.sendServicesMenu(from);
            }
        } else if (interactive.type === 'list_reply') {
            const listId = interactive.list_reply.id;
            return await this.handleServiceSelection(from, listId);
        }

        return { status: 'processed' };
    }

    // Handle flow responses
    async handleFlowResponse(payload) {
        const { from, flow_token, response_data } = payload;
        
        logger.info(`Flow response from ${from}:`, { flow_token, response_data });

        if (flow_token.startsWith('onboarding_')) {
            return await this.processOnboardingResponse(from, response_data);
        } else if (flow_token.startsWith('kyc_')) {
            return await this.processKYCResponse(from, response_data);
        } else if (flow_token.startsWith('txn_')) {
            return await this.processTransactionResponse(from, response_data);
        }

        return { status: 'processed' };
    }

    // Process onboarding flow response
    async processOnboardingResponse(phoneNumber, responseData) {
        try {
            // Save user data to database
            const userData = {
                phone: phoneNumber,
                firstName: responseData.first_name,
                lastName: responseData.last_name,
                email: responseData.email,
                dateOfBirth: responseData.date_of_birth,
                address: responseData.address,
                userType: responseData.user_type || 'individual'
            };

            // TODO: Save to database
            logger.info('User onboarding data:', userData);

            // Send confirmation message
            const confirmationMessage = `✅ *Registration Successful!*\n\n` +
                                      `Welcome to MiiMii, ${userData.firstName}!\n\n` +
                                      `Your account has been created. Next steps:\n` +
                                      `1. Complete KYC verification\n` +
                                      `2. Set up your PIN\n` +
                                      `3. Start using MiiMii services\n\n` +
                                      `Would you like to proceed with verification?`;

            const buttons = [
                { id: 'start_kyc', title: '✅ Start KYC' },
                { id: 'later', title: '⏳ Do Later' },
                { id: 'help', title: '🎧 Need Help' }
            ];

            await this.sendButtonMessage(phoneNumber, confirmationMessage, buttons);

            return { status: 'onboarding_completed', userData };
        } catch (error) {
            logger.error('Onboarding processing error:', error);
            await this.sendTextMessage(phoneNumber, '❌ There was an error processing your registration. Please try again or contact support.');
            throw error;
        }
    }

    // Additional helper methods
    async sendBalanceInfo(phoneNumber) {
        // TODO: Fetch actual balance from database
        const message = `💰 *Account Balance*\n\nMain Account: USD 1,250.00\nSavings: USD 5,500.00\nInvestments: USD 2,100.00\n\nTotal: USD 8,850.00\n\nLast updated: ${new Date().toLocaleString()}`;
        
        return await this.sendTextMessage(phoneNumber, message);
    }

    async sendAboutMessage(phoneNumber) {
        const message = `🌟 *About MiiMii*\n\nMiiMii is your AI-powered financial assistant that helps you:\n\n💰 Manage your money\n📊 Track investments\n💳 Make payments\n📈 Plan your future\n\nSecure • Fast • Intelligent\n\nReady to get started?`;
        
        const buttons = [
            { id: 'register', title: '🚀 Register Now' },
            { id: 'demo', title: '🎮 Try Demo' }
        ];

        return await this.sendButtonMessage(phoneNumber, message, buttons);
    }

    async sendSupportMessage(phoneNumber) {
        const message = `🎧 *MiiMii Support*\n\nNeed help? We're here for you!\n\n📧 Email: support@miimii.com\n📞 Phone: +1-800-MIIMII\n💬 Live Chat: Available 24/7\n\nOr describe your issue and we'll help you right away.`;
        
        return await this.sendTextMessage(phoneNumber, message);
    }
}

module.exports = new WhatsAppService();