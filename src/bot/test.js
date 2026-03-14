require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { bot, startBot, queueApproval } = require('./index');

async function test() {
  console.log('Starting bot...');
  await startBot();

  // Wait a bit for bot to connect
  await new Promise(r => setTimeout(r, 2000));

  // Send test approval card
  const testItem = {
    site: 'adultfolio',
    siteLabel: 'adultfolio.com',
    model: 'Ana V',
    photographer: 'Test_Photographer',
    url: 'https://www.adultfolio.com/message.php?user=12345',
    language: 'en',
    lastIncoming: 'Hi Ana, I would like to book a shoot with you in Brussels on May 15th. What are your rates for art nude? Best, John',
    draft: 'Hello John,\n\nThank you for your message. My rate for art nude is 150€/h.\n\nPlease send me the exact time, duration, and location so I can confirm.\n\nBest regards,\nAna',
    draftType: 'standard',
    messages: [
      { role: 'interlocutor', text: 'Hi Ana, I would like to book a shoot with you in Brussels on May 15th. What are your rates for art nude? Best, John' }
    ]
  };

  console.log('Sending test approval card...');
  console.log('Waiting for your response in Telegram (OK / EDIT / SKIP)...\n');

  const result = await queueApproval(testItem);

  console.log('\n=== RESULT ===');
  console.log(`Action: ${result.action}`);
  console.log(`Text: ${result.text || '(none)'}`);
  console.log('==============\n');

  console.log('Test complete. Stopping bot...');
  bot.stop();
  process.exit(0);
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
