#!/usr/bin/env node

/**
 * MiiMii Real-time Log Monitor
 * This script continuously monitors your deployed application for WhatsApp activity
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const config = {
  baseUrl: 'https://api.chatmiimii.com',
  monitorInterval: 5000, // Check every 5 seconds
  logFile: 'monitoring_log.txt',
  maxLogLines: 1000
};

class LogMonitor {
  constructor() {
    this.isRunning = false;
    this.webhookCount = 0;
    this.lastCheckedTime = new Date();
    this.logBuffer = [];
    this.startTime = new Date();
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    const logLine = `${prefix} [${timestamp}] ${message}`;
    
    console.log(logLine);
    
    // Save to buffer and file
    this.logBuffer.push(logLine);
    if (this.logBuffer.length > config.maxLogLines) {
      this.logBuffer = this.logBuffer.slice(-config.maxLogLines);
    }
    
    fs.appendFileSync(config.logFile, logLine + '\n');
  }

  async checkServerHealth() {
    try {
      const response = await axios.get(`${config.baseUrl}/health`, {
        timeout: 5000
      });

      return {
        status: response.data.status,
        uptime: response.data.uptime,
        database: response.data.services?.database?.status,
        redis: response.data.services?.redis?.status,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  async testWhatsAppFunctionality() {
    try {
      // Test webhook endpoint availability
      const response = await axios.post(`${config.baseUrl}/webhook/whatsapp`, {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'monitor_test_' + Date.now(),
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: 'test_number',
                phone_number_id: 'test_phone_id'
              },
              messages: [{
                from: '2349123456789',
                id: 'monitor_message_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: {
                  body: 'Monitor test message'
                },
                type: 'text'
              }]
            },
            field: 'messages'
          }]
        }]
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.webhookCount++;
      return {
        success: true,
        status: response.status,
        webhookCount: this.webhookCount
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  async performMonitoringCycle() {
    try {
      // Check server health
      const health = await this.checkServerHealth();
      this.log(`Server Status: ${health.status} | Uptime: ${Math.floor(health.uptime)}s | DB: ${health.database} | Redis: ${health.redis}`);

      // Test WhatsApp webhook
      const whatsapp = await this.testWhatsAppFunctionality();
      if (whatsapp.success) {
        this.log(`✅ WhatsApp webhook responding (Test #${whatsapp.webhookCount})`, 'success');
      } else {
        this.log(`❌ WhatsApp webhook test failed: ${whatsapp.error} (Status: ${whatsapp.status})`, 'error');
      }

      // Report overall status
      const runtime = Math.floor((new Date() - this.startTime) / 1000);
      this.log(`📊 Monitor Runtime: ${runtime}s | Webhook Tests: ${this.webhookCount} | Status: ${health.status}`);

    } catch (error) {
      this.log(`❌ Monitoring cycle failed: ${error.message}`, 'error');
    }
  }

  async startMonitoring() {
    this.log('🚀 Starting MiiMii Log Monitor...');
    this.log(`📡 Monitoring deployment at: ${config.baseUrl}`);
    this.log(`⏱️ Check interval: ${config.monitorInterval}ms`);
    this.log('─'.repeat(80));

    this.isRunning = true;

    // Initial check
    await this.performMonitoringCycle();

    // Set up periodic monitoring
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }

      this.log('─'.repeat(40));
      await this.performMonitoringCycle();
    }, config.monitorInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.log('🛑 Stopping monitor...');
      this.isRunning = false;
      clearInterval(interval);
      this.generateReport();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('🛑 Stopping monitor...');
      this.isRunning = false;
      clearInterval(interval);
      this.generateReport();
      process.exit(0);
    });
  }

  generateReport() {
    const runtime = Math.floor((new Date() - this.startTime) / 1000);
    
    this.log('─'.repeat(80));
    this.log('📋 MONITORING REPORT');
    this.log(`🕐 Total Runtime: ${runtime} seconds`);
    this.log(`🔄 Webhook Tests Performed: ${this.webhookCount}`);
    this.log(`📄 Log file: ${config.logFile}`);
    this.log('─'.repeat(80));
    
    // Save final report
    const report = {
      startTime: this.startTime,
      endTime: new Date(),
      runtime: runtime,
      webhookTests: this.webhookCount,
      logFile: config.logFile,
      logs: this.logBuffer
    };
    
    fs.writeFileSync('monitoring_report.json', JSON.stringify(report, null, 2));
    this.log('📄 Final report saved to: monitoring_report.json');
  }

  async sendTestMessage(phoneNumber, message) {
    if (!phoneNumber || phoneNumber === '2349XXXXXXXXX') {
      throw new Error('Please provide a valid phone number');
    }

    try {
      const response = await axios.post(`${config.baseUrl}/api/whatsapp/send-message`, {
        to: phoneNumber,
        message: message || `🧪 Test message from MiiMii Monitor at ${new Date().toISOString()}`
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.log(`📱 Test message sent successfully to ${phoneNumber}`, 'success');
      return response.data;
    } catch (error) {
      this.log(`❌ Failed to send test message: ${error.message}`, 'error');
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const monitor = new LogMonitor();
  
  const args = process.argv.slice(2);
  
  if (args[0] === 'test-message') {
    // Send a test message
    const phoneNumber = args[1];
    const message = args.slice(2).join(' ');
    
    if (!phoneNumber) {
      console.log('Usage: node monitor_logs.js test-message <phone_number> [message]');
      console.log('Example: node monitor_logs.js test-message 2349123456789 "Hello from MiiMii!"');
      process.exit(1);
    }
    
    try {
      await monitor.sendTestMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send test message:', error.message);
      process.exit(1);
    }
  } else {
    // Start monitoring
    console.log('🔧 MiiMii Real-time Log Monitor');
    console.log('📱 Usage:');
    console.log('  - Press Ctrl+C to stop monitoring');
    console.log('  - To send test message: node monitor_logs.js test-message <phone_number> [message]');
    console.log('');
    
    await monitor.startMonitoring();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LogMonitor;