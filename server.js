// WordVine 로컬 개발 서버 (Vercel과 동일한 API를 로컬에서 제공)
// 실행: node server.js  →  http://localhost:3000
// 상태는 data.json에 저장됨
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleState, handlePlace, handlePreview } = require('./lib/handlers');

const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/state') return handleState(req, res);
  if (url.pathname === '/api/place') return handlePlace(req, res);
  if (url.pathname === '/api/preview') return handlePreview(req, res);

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const fp = path.join(__dirname, 'public', path.normalize(file).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(fp)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`WordVine 로컬 서버: http://localhost:${PORT}`);
});
