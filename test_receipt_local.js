const receiptService = require('./src/services/receipt');
const fs = require('fs');

async function testReceiptGeneration() {
  console.log('Testing receipt generation...\n');
  
  try {
    // Test airtime receipt
    console.log('1. Testing airtime receipt generation...');
    const airtimeData = {
      network: 'MTN',
      phoneNumber: '07035437910',
      amount: 100,
      reference: 'TEST_AIRTIME_001',
      date: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      status: 'Successful',
      discount: 0
    };
    
    const airtimeReceipt = await receiptService.generateAirtimeReceipt(airtimeData);
    fs.writeFileSync('test_airtime_receipt.jpg', airtimeReceipt);
    console.log('✅ Airtime receipt generated successfully (test_airtime_receipt.jpg)');
    
    // Test transfer receipt
    console.log('\n2. Testing transfer receipt generation...');
    const transferData = {
      transactionType: 'Bank Transfer',
      amount: 200,
      sender: 'John Doe',
      beneficiary: 'Jane Smith',
      reference: 'TEST_TRANSFER_001',
      date: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      status: 'Successful',
      remark: 'Test transfer',
      charges: 25,
      discount: 0
    };
    
    const transferReceipt = await receiptService.generateReceipt(transferData);
    fs.writeFileSync('test_transfer_receipt.jpg', transferReceipt);
    console.log('✅ Transfer receipt generated successfully (test_transfer_receipt.jpg)');
    
    console.log('\n✅ All receipt tests passed!');
    
  } catch (error) {
    console.error('❌ Receipt generation failed:', error.message);
    console.error(error.stack);
  }
}

testReceiptGeneration();
