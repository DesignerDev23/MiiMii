const { Wallet } = require('./src/models');
const logger = require('./src/utils/logger');

async function fixWalletBalances() {
  try {
    console.log('🔧 Fixing wallet balances...\n');

    // Find wallets where balance > 0 but availableBalance = 0
    const walletsToFix = await Wallet.findAll({
      where: {
        balance: { [require('sequelize').Op.gt]: 0 },
        availableBalance: 0
      }
    });

    console.log(`Found ${walletsToFix.length} wallets to fix\n`);

    for (const wallet of walletsToFix) {
      const oldAvailableBalance = parseFloat(wallet.availableBalance);
      const totalBalance = parseFloat(wallet.balance);
      
      // Set availableBalance equal to total balance
      await wallet.update({
        availableBalance: totalBalance
      });

      console.log(`✅ Fixed wallet ${wallet.id}:`);
      console.log(`   User ID: ${wallet.userId}`);
      console.log(`   Old Available Balance: ₦${oldAvailableBalance.toLocaleString()}`);
      console.log(`   New Available Balance: ₦${totalBalance.toLocaleString()}`);
      console.log(`   Total Balance: ₦${totalBalance.toLocaleString()}\n`);
    }

    console.log('🎉 Wallet balance fix completed!');

  } catch (error) {
    console.error('❌ Error fixing wallet balances:', error.message);
    logger.error('Failed to fix wallet balances', { error: error.message });
  }
}

// Run the fix
fixWalletBalances();
