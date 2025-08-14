const fs = require('fs');
const path = require('path');

console.log('Testing current fixes...\n');

// Test 1: Check if receipt.js has correct generateAirtimeReceipt method
console.log('1. Checking receipt.js generateAirtimeReceipt method...');
try {
  const receiptPath = path.join(__dirname, 'src/services/receipt.js');
  const receiptContent = fs.readFileSync(receiptPath, 'utf8');
  
  if (receiptContent.includes('generateAirtimeReceipt')) {
    console.log('✅ generateAirtimeReceipt method exists');
    
    // Check if it uses correct variables
    if (receiptContent.includes('network') && receiptContent.includes('phoneNumber')) {
      console.log('✅ Uses correct variable names (network, phoneNumber)');
    } else {
      console.log('❌ Missing correct variable names');
    }
    
    // Check if it uses JPEG format
    if (receiptContent.includes("'image/jpeg'")) {
      console.log('✅ Uses JPEG format');
    } else {
      console.log('❌ Not using JPEG format');
    }
  } else {
    console.log('❌ generateAirtimeReceipt method not found');
  }
} catch (error) {
  console.log('❌ Error reading receipt.js:', error.message);
}

// Test 2: Check if messageProcessor.js has duplicate message fix
console.log('\n2. Checking messageProcessor.js duplicate message fix...');
try {
  const messageProcessorPath = path.join(__dirname, 'src/services/messageProcessor.js');
  const messageProcessorContent = fs.readFileSync(messageProcessorPath, 'utf8');
  
  if (messageProcessorContent.includes('// Don\'t send message here as bilal service already handles it')) {
    console.log('✅ Duplicate message fix applied');
  } else {
    console.log('❌ Duplicate message fix not found');
  }
} catch (error) {
  console.log('❌ Error reading messageProcessor.js:', error.message);
}

// Test 3: Check if bankTransfer.js has receipt generation for immediate completions
console.log('\n3. Checking bankTransfer.js receipt generation...');
try {
  const bankTransferPath = path.join(__dirname, 'src/services/bankTransfer.js');
  const bankTransferContent = fs.readFileSync(bankTransferPath, 'utf8');
  
  if (bankTransferContent.includes('Generate and send receipt for immediate completion')) {
    console.log('✅ Transfer receipt generation added');
  } else {
    console.log('❌ Transfer receipt generation not found');
  }
} catch (error) {
  console.log('❌ Error reading bankTransfer.js:', error.message);
}

// Test 4: Check if whatsapp.js uses JPEG content type
console.log('\n4. Checking whatsapp.js image format...');
try {
  const whatsappPath = path.join(__dirname, 'src/services/whatsapp.js');
  const whatsappContent = fs.readFileSync(whatsappPath, 'utf8');
  
  if (whatsappContent.includes("contentType: 'image/jpeg'")) {
    console.log('✅ Uses JPEG content type');
  } else {
    console.log('❌ Not using JPEG content type');
  }
} catch (error) {
  console.log('❌ Error reading whatsapp.js:', error.message);
}

console.log('\nTest completed!');
