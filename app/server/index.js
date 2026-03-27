require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { migrate } = require('./db');

const app = express();
const PORT = process.env.APP_PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/shoots',        require('./routes/shoots'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/sync',          require('./routes/sync'));

// Serve React build in production
const distDir = path.join(__dirname, '../dist');
if (require('fs').existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

async function start() {
  await migrate();
  app.listen(PORT, () => {
    console.log(`[app] Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[app] Fatal:', err.message);
  process.exit(1);
});
