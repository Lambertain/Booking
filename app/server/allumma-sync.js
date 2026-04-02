const https = require('https')
const http = require('http')

async function syncShootToAllumma({ bookingShootId, shootDate, rate, currency, modelName }) {
  const apiUrl = process.env.ALLUMMA_API_URL
  const secret = process.env.ALLUMMA_SYNC_SECRET

  if (!apiUrl || !secret) {
    console.log('[allumma-sync] Not configured, skipping')
    return null
  }

  const url = new URL('/api/v1/sync/booking', apiUrl)
  const body = JSON.stringify({ bookingShootId, shootDate, rate, currency, modelName })

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:'
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const client = isHttps ? https : http
    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        if (res.statusCode === 409) {
          console.log(`[allumma-sync] Shoot #${bookingShootId} already synced`)
          resolve({ alreadySynced: true })
          return
        }
        if (res.statusCode !== 200) {
          console.error(`[allumma-sync] HTTP ${res.statusCode}:`, data)
          reject(new Error(`Allumma sync failed: ${res.statusCode}`))
          return
        }
        resolve(JSON.parse(data))
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = { syncShootToAllumma }
