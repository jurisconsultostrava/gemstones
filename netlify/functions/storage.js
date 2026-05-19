const SftpClient = require('ssh2-sftp-client');

const DEFAULT_DATA = { products: [], updatedAt: null };

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function getConfig() {
  return {
    host: process.env.SFTP_HOST,
    port: Number(process.env.SFTP_PORT || 22),
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    remotePath: process.env.SFTP_PATH || 'moje-kameny/database/gemstones-data.json'
  };
}

function validateConfig(cfg) {
  const missing = [];
  if (!cfg.host) missing.push('SFTP_HOST');
  if (!cfg.username) missing.push('SFTP_USER');
  if (!cfg.password) missing.push('SFTP_PASSWORD');
  if (!cfg.remotePath) missing.push('SFTP_PATH');
  return missing;
}

async function ensureDir(client, remotePath) {
  const parts = remotePath.split('/').filter(Boolean);
  parts.pop();
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      const exists = await client.exists(current);
      if (!exists) await client.mkdir(current, true);
    } catch (_) {}
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });

  const cfg = getConfig();
  const missing = validateConfig(cfg);
  if (missing.length) return json(500, { error: 'Missing env variables: ' + missing.join(', ') });

  const client = new SftpClient();

  try {
    await client.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      readyTimeout: 20000
    });

    if (event.httpMethod === 'GET') {
      const exists = await client.exists(cfg.remotePath);
      if (!exists) return json(200, DEFAULT_DATA);
      const buffer = await client.get(cfg.remotePath);
      const text = buffer.toString('utf8').trim();
      if (!text) return json(200, DEFAULT_DATA);
      try {
        return json(200, JSON.parse(text));
      } catch (e) {
        return json(500, { error: 'Remote JSON is invalid', detail: e.message });
      }
    }

    const body = JSON.parse(event.body || '{}');
    const products = Array.isArray(body.products) ? body.products : [];
    const payload = {
      products,
      updatedAt: new Date().toISOString()
    };

    await ensureDir(client, cfg.remotePath);
    await client.put(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), cfg.remotePath);

    return json(200, { ok: true, count: products.length, updatedAt: payload.updatedAt });
  } catch (e) {
    return json(500, { error: e.message || 'SFTP storage error' });
  } finally {
    try { await client.end(); } catch (_) {}
  }
};
