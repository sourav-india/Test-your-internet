const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
let networkInfo = null;
let networkInfoPromise = null;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function noCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  return ip === '::1' ? '127.0.0.1' : (ip || 'Unavailable').replace(/^::ffff:/, '');
}

function sendFile(req, res, pathname) {
  const requestedPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^[/\\]+/, '');
  const safePath = path.normalize(requestedPath);
  if (safePath.startsWith('..') || path.isAbsolute(safePath)) return notFound(res);
  const filePath = path.join(publicDir, safePath);
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function publicNetworkInfo(ip) {
  if (networkInfo && networkInfo.ip === ip) return networkInfo;
  if (networkInfoPromise) return networkInfoPromise;
  if (process.env.SPEEDTEST_ISP) {
    networkInfo = { ip, isp: process.env.SPEEDTEST_ISP };
    return networkInfo;
  }
  networkInfoPromise = (async () => {
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error('Network lookup failed');
      const data = await response.json();
      networkInfo = { ip, isp: data.connection?.isp || data.connection?.org || 'Unavailable' };
    } catch {
      networkInfo = { ip, isp: 'Unavailable' };
    } finally {
      networkInfoPromise = null;
    }
    return networkInfo;
  })();
  return networkInfoPromise;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/ping' && req.method === 'GET') {
    noCache(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, timestamp: Date.now() }));
  }

  if (url.pathname === '/api/server' && req.method === 'GET') {
    noCache(res);
    const ip = clientIp(req);
    return publicNetworkInfo(ip).then((network) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
      name: process.env.SPEEDTEST_SERVER_NAME || 'Auto Select • Local Edge',
      location: process.env.SPEEDTEST_SERVER_LOCATION || 'Nearest available region',
      id: 'edge-auto-01',
      ip,
      isp: network.isp
      }));
    });
  }

  if (url.pathname === '/api/download' && req.method === 'GET') {
    noCache(res);
    const requested = Number(url.searchParams.get('bytes')) || 12 * 1024 * 1024;
    const bytes = Math.min(Math.max(requested, 512 * 1024), 50 * 1024 * 1024);
    const chunk = Buffer.allocUnsafe(64 * 1024);
    for (let i = 0; i < chunk.length; i += 1) chunk[i] = (i * 31 + Date.now()) & 255;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': bytes,
      'X-Content-Type-Options': 'nosniff'
    });
    let sent = 0;
    const write = () => {
      while (sent < bytes) {
        const amount = Math.min(chunk.length, bytes - sent);
        sent += amount;
        if (!res.write(amount === chunk.length ? chunk : chunk.subarray(0, amount))) {
          res.once('drain', write);
          return;
        }
      }
      res.end();
    };
    req.once('close', () => { if (!res.writableEnded) res.destroy(); });
    return write();
  }

  if (url.pathname === '/api/upload' && req.method === 'POST') {
    noCache(res);
    if (Number(req.headers['content-length']) > MAX_UPLOAD_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Upload payload is too large' }));
    }
    let received = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_UPLOAD_BYTES && !rejected) {
        rejected = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Upload payload is too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (rejected) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received }));
    });
    req.on('error', () => {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    });
    return;
  }

  if (req.method === 'GET') return sendFile(req, res, url.pathname);
  notFound(res);
});

server.listen(PORT, () => {
  console.log(`Pulse Speed Test is running at http://localhost:${PORT}`);
});
