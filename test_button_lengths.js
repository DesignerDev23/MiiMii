// Test script to verify WhatsApp button title lengths
console.log('🔍 Testing WhatsApp button title lengths...\n');

// Test the updated button titles
const updatedButtons = [
  { id: 'complete_onboarding', title: '✅ Get Started' },
  { id: 'learn_more', title: '📚 Learn More' },
  { id: 'get_help', title: '❓ Get Help' }
];

console.log('📋 Updated welcome buttons:');
updatedButtons.forEach(button => {
  const length = button.title.length;
  const status = length <= 20 ? '✅' : '❌';
  console.log(`  ${status} "${button.title}" (${length} chars)`);
});

// Test other potential button titles from the codebase
const otherButtons = [
  { title: '💰 Money Services' },
  { title: '📱 Mobile Services' },
  { title: '💰 Standard Account' },
  { title: '⭐ Premium Account' },
  { title: '📱 To Phone Number' },
  { title: '💰 Missing Money' },
  { title: '💸 Transfer Money' },
  { title: '💵 Request Money' },
  { title: '📊 Check Balance' },
  { title: '📞 Buy Airtime' },
  { title: '📶 Buy Data' },
  { title: '🎁 Gift Data' },
  { title: '💡 Electricity' },
  { title: '📺 Cable TV' },
  { title: '🌐 Internet' }
];

console.log('\n📋 Other button titles in codebase:');
otherButtons.forEach(button => {
  const length = button.title.length;
  const status = length <= 20 ? '✅' : '❌';
  console.log(`  ${status} "${button.title}" (${length} chars)`);
});

console.log('\n📊 Summary:');
const allButtons = [...updatedButtons, ...otherButtons];
const validButtons = allButtons.filter(b => b.title.length <= 20);
const invalidButtons = allButtons.filter(b => b.title.length > 20);

console.log(`✅ Valid buttons: ${validButtons.length}`);
console.log(`❌ Invalid buttons: ${invalidButtons.length}`);

if (invalidButtons.length > 0) {
  console.log('\n❌ Buttons that need fixing:');
  invalidButtons.forEach(button => {
    console.log(`  "${button.title}" (${button.title.length} chars)`);
  });
} else {
  console.log('\n🎉 All button titles are within the 20-character limit!');
}