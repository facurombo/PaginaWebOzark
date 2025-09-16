const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(__dirname, 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'resenas.json');

// Ensure data directory and file exist
function ensureStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]', 'utf8');
  } catch (err) {
    console.error('Storage init error:', err);
  }
}

function readJsonFileSafe(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw || '[]');
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    return [];
  }
}

function writeJsonFileSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

function parseBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('Body too large'));
        req.connection.destroy();
      }
    });
    req.on('end', () => {
      try {
        if (!data) return resolve({});
        const obj = JSON.parse(data);
        resolve(obj);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let pathname = url.parse(req.url).pathname;
  if (pathname === '/') pathname = '/index.html';
  // prevent path traversal
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname)).replace(/\\/g, '/');
  if (!safePath.startsWith(PUBLIC_DIR.replace(/\\/g, '/'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(safePath).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);

  if (pathname === '/api/reviews' && req.method === 'GET') {
    ensureStorage();
    const list = readJsonFileSafe(REVIEWS_FILE);
    return sendJson(res, 200, list);
  }

  if (pathname === '/api/reviews' && req.method === 'POST') {
    try {
      ensureStorage();
      const body = await parseBody(req);
      const review = {
        nombre: String(body.nombre || '').slice(0, 200),
        sexo: String(body.sexo || '').slice(0, 50),
        edad: String(body.edad || '').slice(0, 10),
        email: String(body.email || '').slice(0, 200),
        rating: Number(body.rating || 0),
        resena: String(body.resena || body['reseña'] || '').slice(0, 2000),
        createdAt: new Date().toISOString()
      };
      if (!review.nombre || !review.resena) {
        return sendJson(res, 400, { error: 'nombre y resena son requeridos' });
      }
      if (review.rating < 0 || review.rating > 5 || isNaN(review.rating)) review.rating = 0;

      const list = readJsonFileSafe(REVIEWS_FILE);
      list.unshift(review); // newest first
      writeJsonFileSafe(REVIEWS_FILE, list);
      return sendJson(res, 201, review);
    } catch (e) {
      return sendJson(res, 400, { error: 'JSON inválido' });
    }
  }

  // Fallback: static
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  ensureStorage();
  console.log(`Servidor listo en http://localhost:${PORT}`);
});
