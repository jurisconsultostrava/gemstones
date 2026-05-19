const SftpClient = require('ssh2-sftp-client');
const crypto = require('crypto');

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
    remotePath: process.env.SFTP_PATH || 'moje-kameny/database/gemstones-data.json',
    photoDir: process.env.SFTP_PHOTO_DIR || 'moje-kameny/database/foto',
    publicPhotoBaseUrl: process.env.PUBLIC_PHOTO_BASE_URL || 'https://gemstones.wz.cz/moje-kameny/database/foto'
  };
}

function validateConfig(cfg) {
  const missing = [];
  if (!cfg.host) missing.push('SFTP_HOST');
  if (!cfg.username) missing.push('SFTP_USER');
  if (!cfg.password) missing.push('SFTP_PASSWORD');
  if (!cfg.remotePath) missing.push('SFTP_PATH');
  if (!cfg.photoDir) missing.push('SFTP_PHOTO_DIR');
  if (!cfg.publicPhotoBaseUrl) missing.push('PUBLIC_PHOTO_BASE_URL');
  return missing;
}

async function ensureDir(client, remotePath) {
  const normalized = remotePath.replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const isFile = /\.[a-z0-9]+$/i.test(parts[parts.length - 1] || '');
  if (isFile) parts.pop();

  let current = '';
  for (const part of parts) {
    current += (current ? '/' : '') + part;
    try {
      const exists = await client.exists(current);
      if (!exists) await client.mkdir(current, true);
    } catch (_) {}
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL');

  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const extMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };

  const ext = extMap[mime] || 'jpg';
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) throw new Error('Empty image buffer');
  if (buffer.length > 7 * 1024 * 1024) throw new Error('Image is too large. Max 7 MB.');

  return { buffer, ext, mime };
}

async function loadProducts(client, remotePath) {
  const exists = await client.exists(remotePath);
  if (!exists) return DEFAULT_DATA;

  const buffer = await client.get(remotePath);
  const text = buffer.toString('utf8').trim();
  if (!text) return DEFAULT_DATA;

  return JSON.parse(text);
}

async function saveProducts(client, remotePath, products) {
  const payload = {
    products: Array.isArray(products) ? products : [],
    updatedAt: new Date().toISOString()
  };
  await ensureDir(client, remotePath);
  await client.put(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), remotePath);
  return payload;
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
      try {
        return json(200, await loadProducts(client, cfg.remotePath));
      } catch (e) {
        return json(500, { error: 'Remote JSON is invalid or unreadable', detail: e.message });
      }
    }

    const body = JSON.parse(event.body || '{}');

    if (body.action === 'uploadPhoto') {
      const { buffer, ext, mime } = parseDataUrl(body.image);
      const safePrefix = String(body.productId || 'gem').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'gem';
      const fileName = `${safePrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const remotePhotoPath = `${cfg.photoDir.replace(/\/+$/, '')}/${fileName}`;

      await ensureDir(client, remotePhotoPath);
      await client.put(buffer, remotePhotoPath);

      return json(200, {
        ok: true,
        fileName,
        mime,
        photoUrl: `${cfg.publicPhotoBaseUrl.replace(/\/+$/, '')}/${fileName}`
      });
    }

    const products = Array.isArray(body.products) ? body.products : [];
    const payload = await saveProducts(client, cfg.remotePath, products);

    return json(200, { ok: true, count: products.length, updatedAt: payload.updatedAt });
  } catch (e) {
    return json(500, { error: e.message || 'SFTP storage error' });
  } finally {
    try { await client.end(); } catch (_) {}
  }
};
