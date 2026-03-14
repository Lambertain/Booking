require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { extractShootDetails } = require('../ai/grok');
const { recordShoot } = require('./index');

async function test() {
  // Real dialog from test run — la vida (Model Mayhem)
  const messages = [
    { role: 'self', text: 'Hello! I am Ana V, professional model. I will be available in Belgium May 13-18. Would you be interested in a shoot collaboration?' },
    { role: 'interlocutor', text: 'Hi Ana! Yes, I could be interested. I have a small studio in Antwerp.' },
    { role: 'self', text: 'Great! Could you please send me the details — date, time, duration, shooting level, and your budget?' },
    { role: 'interlocutor', text: 'I was thinking May 15th, around 10am, 3 hours. My budget is 210 euros including your transportation to Antwerp. I do art nude and boudoir.' }
  ];

  console.log('1. Extracting shoot details with Grok...');
  const details = await extractShootDetails(messages, 'la vida', 'Model Mayhem');
  console.log('Extracted:', JSON.stringify(details, null, 2));

  if (!details) {
    console.error('Failed to extract details');
    process.exit(1);
  }

  console.log('\n2. Recording to Airtable...');
  const record = await recordShoot({
    ...details,
    photographer: 'la vida',
    siteName: 'Model Mayhem'
  });

  console.log('\nDone! Record ID:', record.id);
  console.log('Fields:', JSON.stringify(record.fields, null, 2));
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
