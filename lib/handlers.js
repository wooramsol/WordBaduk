// HTTP 핸들러 — Vercel 서버리스 함수와 로컬 http 서버 공용 (raw req/res만 사용)
const game = require('./game');

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10000) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}

// GET /api/state?since=V&client=ID
async function handleState(req, res) {
  await game.ensureLoaded();
  const url = new URL(req.url, 'http://x');
  const since = parseInt(url.searchParams.get('since'), 10);
  game.touchPresence(url.searchParams.get('client'));
  const out = {
    version: game.state.version,
    wordCount: game.state.words.length,
    users: game.userCount(),
  };
  if (!Number.isInteger(since) || since !== game.state.version) {
    out.cells = game.fullCells();
  }
  json(res, 200, out);
}

// POST /api/place {word, x, y, dir, client}
async function handlePlace(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, err: 'POST만 허용됩니다.' });
  const body = await readBody(req);
  if (!body) return json(res, 400, { ok: false, err: '잘못된 요청입니다.' });
  const { x, y, dir, client } = body;
  const typed = typeof body.word === 'string' ? body.word.trim() : '';
  if (!Number.isInteger(x) || !Number.isInteger(y) || !['h', 'v'].includes(dir)) {
    return json(res, 400, { ok: false, err: '잘못된 요청입니다.' });
  }
  if (!/^[가-힣]{1,15}$/.test(typed)) {
    return json(res, 200, { ok: false, err: '한글만 입력할 수 있습니다.' });
  }
  await game.ensureLoaded(true); // 최신 상태 기준으로 검증
  game.touchPresence(client);
  const r = game.resolvePlacement(typed, x, y, dir);
  if (r.err) return json(res, 200, { ok: false, err: r.err });
  const placed = game.placeWord(r, dir, client || '누군가');
  await game.persist();
  json(res, 200, {
    ok: true,
    word: r.word,
    canonical: r.canonical !== r.word ? r.canonical : undefined,
    cells: placed,
    version: game.state.version,
    wordCount: game.state.words.length,
  });
}

// GET /api/preview?word=&x=&y=&dir=
async function handlePreview(req, res) {
  await game.ensureLoaded();
  const url = new URL(req.url, 'http://x');
  const typed = (url.searchParams.get('word') || '').trim();
  const x = parseInt(url.searchParams.get('x'), 10);
  const y = parseInt(url.searchParams.get('y'), 10);
  const dir = url.searchParams.get('dir');
  if (!/^[가-힣]{1,15}$/.test(typed) || !Number.isInteger(x) || !Number.isInteger(y) || !['h', 'v'].includes(dir)) {
    return json(res, 200, { ok: false, err: '한글만 입력할 수 있습니다.' });
  }
  const r = game.resolvePlacement(typed, x, y, dir);
  if (r.err) return json(res, 200, { ok: false, err: r.err });
  json(res, 200, { ok: true, word: r.word, canonical: r.canonical, startX: r.startX, startY: r.startY });
}

module.exports = { handleState, handlePlace, handlePreview };
