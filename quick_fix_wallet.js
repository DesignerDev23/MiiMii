const { Pool } = require('pg');

async function quickFixWallet() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/miimii'
  });

  try {
    console.log('🔧 Quick fixing wallet balance...\n');

    // Find the user by phone number (you can change this to the actual user's phone)
    const userPhone = '+15556613536'; // Replace with actual user phone
    
    // First, get the user ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE "whatsappNumber" = $1',
      [userPhone]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found with phone:', userPhone);
      return;
    }

    const userId = userResult.rows[0].id;
    console.log('✅ Found user ID:', userId);

    // Get current wallet balance
    const walletResult = await pool.query(
      'SELECT balance, "availableBalance", "pendingBalance" FROM wallets WHERE "userId" = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      console.log('❌ Wallet not found for user:', userId);
      return;
    }

    const wallet = walletResult.rows[0];
    console.log('📊 Current wallet state:');
    console.log('   Total Balance: ₦' + parseFloat(wallet.balance).toLocaleString());
    console.log('   Available Balance: ₦' + parseFloat(wallet.availableBalance).toLocaleString());
    console.log('   Pending Balance: ₦' + parseFloat(wallet.pendingBalance).toLocaleString());

    // Fix the available balance if it's 0 but total balance > 0
    if (parseFloat(wallet.availableBalance) === 0 && parseFloat(wallet.balance) > 0) {
      await pool.query(
        'UPDATE wallets SET "availableBalance" = balance WHERE "userId" = $1',
        [userId]
      );

      console.log('✅ Fixed available balance!');
      console.log('   New Available Balance: ₦' + parseFloat(wallet.balance).toLocaleString());
    } else {
      console.log('ℹ️  Wallet balance is already correct');
    }

    console.log('\n🎉 Quick fix completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the fix
quickFixWallet();
