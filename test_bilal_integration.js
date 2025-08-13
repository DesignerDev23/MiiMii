const bilalService = require('./src/services/bilal');
const billsService = require('./src/services/bills');

async function testBilalIntegration() {
  console.log('🧪 Testing BILALSADASUB Integration...\n');

  try {
    // Test 1: Generate token
    console.log('1. Testing token generation...');
    const tokenData = await bilalService.generateToken();
    console.log('✅ Token generated successfully');
    console.log(`   Username: ${tokenData.username}`);
    console.log(`   Balance: ₦${tokenData.balance}\n`);

    // Test 2: Get available networks
    console.log('2. Testing network retrieval...');
    const networks = await bilalService.getAvailableNetworks();
    console.log('✅ Networks retrieved successfully');
    console.log(`   Available networks: ${networks.map(n => n.name).join(', ')}\n`);

    // Test 3: Get data plans for MTN
    console.log('3. Testing data plans retrieval...');
    const dataPlans = await bilalService.getDataPlans('MTN');
    console.log('✅ Data plans retrieved successfully');
    console.log(`   MTN plans available: ${dataPlans.length}`);
    console.log(`   Sample plans:`);
    dataPlans.slice(0, 3).forEach(plan => {
      console.log(`   - ${plan.dataplan} - ₦${plan.amount} (${plan.validity})`);
    });
    console.log('');

    // Test 4: Get available discos
    console.log('4. Testing electricity discos retrieval...');
    const discos = await billsService.getElectricityDiscos();
    console.log('✅ Electricity discos retrieved successfully');
    console.log(`   Available discos: ${discos.map(d => d.name).join(', ')}\n`);

    // Test 5: Get cable providers
    console.log('5. Testing cable providers retrieval...');
    const cableProviders = await billsService.getCableProviders();
    console.log('✅ Cable providers retrieved successfully');
    console.log(`   Available providers: ${cableProviders.map(p => p.name).join(', ')}\n`);

    // Test 6: Get bill limits
    console.log('6. Testing bill limits retrieval...');
    const billLimits = await billsService.getBillLimits();
    console.log('✅ Bill limits retrieved successfully');
    console.log(`   Electricity limits: ₦${billLimits.limits.electricity.minimum} - ₦${billLimits.limits.electricity.maximum}`);
    console.log(`   Cable limits: ₦${billLimits.limits.cable.minimum} - ₦${billLimits.limits.cable.maximum}\n`);

    console.log('🎉 All tests passed! BILALSADASUB integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testBilalIntegration();
