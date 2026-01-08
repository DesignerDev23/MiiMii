require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('🔍 Testing Supabase Database Connection...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
console.log('');

async function testSupabaseClient() {
  console.log('1️⃣ Testing Supabase Client Connection...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('   ❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return false;
  }
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    // Test connection
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.log('   ❌ Supabase client connection failed:', error.message);
      if (error.code) {
        console.log('   🔍 Error code:', error.code);
      }
      return false;
    }
    
    console.log('   ✅ Supabase client connection successful!');
    console.log('   📊 Test query returned:', data ? 'Data received' : 'No data');
    return true;
  } catch (error) {
    console.log('   ❌ Supabase client connection error:', error.message);
    return false;
  }
}

async function runTests() {
  const clientTest = await testSupabaseClient();
  
  console.log('\n📊 Test Results:');
  console.log('  Supabase Client:', clientTest ? '✅ PASS' : '❌ FAIL');
  
  if (clientTest) {
    console.log('\n🎉 Connection test passed! Your Supabase setup is working.');
    console.log('💡 No connection strings needed - just SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY!');
    process.exit(0);
  } else {
    console.log('\n❌ Connection test failed. Please check your configuration.');
    console.log('💡 Make sure you have:');
    console.log('   - SUPABASE_URL=https://your-project.supabase.co');
    console.log('   - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
