// Manual scan trigger — runs pipeline once for all models
require('dotenv').config();
const { runNext } = require('./scheduler/index');

runNext().then(() => {
  console.log('Scan complete');
  process.exit(0);
}).catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
