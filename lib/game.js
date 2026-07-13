// WordVine 게임 로직 + 상태 + 영속화
// Vercel 서버리스와 로컬 서버 양쪽에서 사용
const fs = require('fs');
const path = require('path');

// ---- 사전 로드 (로컬 파일 → /tmp 캐시 → 원격 URL 순) ----
// 서버리스 배포에 words.txt(2.9MB)가 포함되지 않은 경우
// 콜드스타트 때 GitHub 레포에서 내려받아 /tmp에 캐시한다.
const WORDS_URL = process.env.WORDS_URL
  || 'https://raw.githubusercontent.com/wooramsol/WordVine/main/words.txt';
const TMP_WORDS = '/tmp/wordvine-words.txt';

let DICT = null;
let dictPromise = null;
async function loadDict() {
  if (DICT) return;
  if (!dictPromise) {
    dictPromise = (async () => {
      const candidates = [
        path.join(process.cwd(), 'words.txt'),
        path.join(__dirname, '..', 'words.txt'),
        TMP_WORDS,
      ];
      let text = null;
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) { text = fs.readFileSync(p, 'utf-8'); break; }
        } catch {}
      }
      if (!text) {
        const r = await fetch(WORDS_URL);
        if (!r.ok) throw new Error('사전 다운로드 실패: ' + r.status);
        text = await r.text();
        try { fs.writeFileSync(TMP_WORDS, text); } catch {}
      }
      DICT = new Set(text.split('\n').filter(Boolean));
      console.log(`사전 로드 완료: ${DICT.size.toLocaleString()}개 명사`);
    })().catch(e => { dictPromise = null; throw e; });
  }
  await dictPromise;
}

// ---- 두음법칙 ----
const Y_VOWELS = new Set([2, 6, 7, 12, 17, 20]); // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
function dueumVariants(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [];
  const ini = Math.floor(code / 588);
  const rest = code % 588;
  const vow = Math.floor(rest / 28);
  const make = (i) => String.fromCharCode(0xac00 + i * 588 + rest);
  if (ini === 5) return [Y_VOWELS.has(vow) ? make(11) : make(2)]; // ㄹ → ㅇ/ㄴ
  if (ini === 2 && Y_VOWELS.has(vow)) return [make(11)];          // ㄴ → ㅇ
  return [];
}

function dictLookup(word, firstExisting) {
  if (DICT.has(word)) return word;
  if (firstExisting) {
    for (const v of dueumVariants(word[0])) {
      const cand = v + word.slice(1);
      if (DICT.has(cand)) return cand;
    }
  }
  return null;
}

// ---- 게임 상태 ----
const state = {
  cells: new Map(),  // "x,y" -> { ch, dirs: Set }
  words: [],         // { word, canonical, x, y, dir, by, ts }
  version: 0,
  loaded: false,
  lastLoad: 0,
};
const key = (x, y) => `${x},${y}`;

// ---- 영속화 (Vercel Blob 또는 로컬 파일) ----
const BLOB_PATH = 'wordvine-board.json';
const LOCAL_FILE = path.join(process.cwd(), 'data.json');
const blobMode = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function serialize() {
  return JSON.stringify({
    version: state.version,
    words: state.words,
    cells: [...state.cells.entries()].map(([k, v]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y, ch: v.ch, dirs: [...v.dirs] };
    }),
  });
}

function applySnapshot(snap) {
  state.cells.clear();
  for (const c of snap.cells || []) state.cells.set(key(c.x, c.y), { ch: c.ch, dirs: new Set(c.dirs) });
  state.words = snap.words || [];
  state.version = snap.version || state.words.length;
}

async function loadSnapshot() {
  if (blobMode()) {
    try {
      const { list } = require('@vercel/blob');
      const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
      if (blobs.length) {
        const r = await fetch(blobs[0].url + '?t=' + Date.now()); // CDN 캐시 우회
        if (r.ok) return await r.json();
      }
    } catch (e) { console.error('blob load 실패:', e.message); }
    return null;
  }
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf-8')); } catch { return null; }
}

async function persist() {
  const data = serialize();
  if (blobMode()) {
    try {
      const { put } = require('@vercel/blob');
      await put(BLOB_PATH, data, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    } catch (e) { console.error('blob persist 실패:', e.message); }
  } else {
    try { fs.writeFileSync(LOCAL_FILE, data); } catch (e) { console.error('file persist 실패:', e.message); }
  }
}

// 최초 로드 + (Blob 모드) 주기적 재동기화. 원격이 더 최신이면 교체.
const RELOAD_MS = 5000;
let loadPromise = null;
async function ensureLoaded(force) {
  await loadDict();
  const need = !state.loaded || (blobMode() && (force || Date.now() - state.lastLoad > RELOAD_MS));
  if (!need) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const snap = await loadSnapshot();
      if (snap && (!state.loaded || (snap.version || 0) > state.version)) applySnapshot(snap);
      state.loaded = true;
      state.lastLoad = Date.now();
      loadPromise = null;
    })();
  }
  await loadPromise;
}

// ---- 접속자 추적 (인스턴스 메모리, 근사치) ----
const presence = new Map(); // clientId -> lastSeen
function touchPresence(id) {
  if (!id) return;
  presence.set(id, Date.now());
  if (presence.size > 1000) {
    const cut = Date.now() - 60000;
    for (const [k, t] of presence) if (t < cut) presence.delete(k);
  }
}
function userCount() {
  const cut = Date.now() - 10000;
  let n = 0;
  for (const t of presence.values()) if (t >= cut) n++;
  return Math.max(1, n);
}

// ---- 배치 판독 (병합/분리 + 두음법칙) ----
function resolvePlacement(typed, x, y, dir) {
  const cells = state.cells;
  const dx = dir === 'h' ? 1 : 0;
  const dy = dir === 'v' ? 1 : 0;

  let prefix = '', sx = x, sy = y;
  while (true) {
    const ex = cells.get(key(sx - dx, sy - dy));
    if (!ex) break;
    prefix = ex.ch + prefix;
    sx -= dx; sy -= dy;
  }
  let suffix = '', ex2, ei = typed.length;
  while ((ex2 = cells.get(key(x + dx * ei, y + dy * ei)))) {
    suffix += ex2.ch;
    ei++;
  }

  const tCells = [];
  let overlap = 0, newCount = 0;
  for (let i = 0; i < typed.length; i++) {
    const ex = cells.get(key(x + dx * i, y + dy * i)) || null;
    tCells.push(ex);
    if (ex) overlap++; else newCount++;
  }
  if (newCount === 0) return { err: '이미 모두 채워진 자리입니다.' };
  if (cells.size > 0 && overlap === 0 && !prefix && !suffix) {
    return { err: '기존 단어와 최소 한 글자는 이어져야 합니다.' };
  }

  const combos = [];
  const push = (uP, uS) => {
    const len = (uP ? prefix.length : 0) + typed.length + (uS ? suffix.length : 0);
    if (!combos.some(c => c.uP === uP && c.uS === uS)) combos.push({ uP, uS, len });
  };
  push(prefix.length > 0, suffix.length > 0);
  push(prefix.length > 0, false);
  push(false, suffix.length > 0);
  push(false, false);
  combos.sort((a, b) => b.len - a.len);

  const fails = [];
  for (const { uP, uS } of combos) {
    let gridTyped = '', conflict = null;
    for (let i = 0; i < typed.length; i++) {
      const ex = tCells[i];
      if (ex) {
        const dueumOk = i === 0 && !uP && dueumVariants(ex.ch).includes(typed[i]);
        if (ex.ch !== typed[i] && !dueumOk) {
          conflict = { kind: 'conflict', msg: `${i + 1}번째 칸의 기존 글자('${ex.ch}')와 다릅니다.` };
          break;
        }
        gridTyped += ex.ch;
      } else gridTyped += typed[i];
    }
    if (conflict) { fails.push(conflict); continue; }

    const word = (uP ? prefix : '') + gridTyped + (uS ? suffix : '');
    if (word.length < 2) { fails.push({ kind: 'short' }); continue; }
    if (word.length > 15) { fails.push({ kind: 'long', msg: '완성 단어가 15글자를 넘습니다.' }); continue; }

    const startX = uP ? sx : x;
    const startY = uP ? sy : y;

    let dirErr = null;
    for (let i = 0; i < word.length; i++) {
      const ex = cells.get(key(startX + dx * i, startY + dy * i));
      if (ex && ex.dirs.has(dir)) {
        const d1 = dir === 'h' ? '가로' : '세로', d2 = dir === 'h' ? '세로' : '가로';
        dirErr = { kind: 'dir', msg: `'${ex.ch}'는 이미 ${d1} 단어의 일부입니다. ${d1}는 ${d2} 단어에서만 이을 수 있어요.` };
        break;
      }
    }
    if (dirErr) { fails.push(dirErr); continue; }

    const firstExisting = !!cells.get(key(startX, startY));
    const canonical = dictLookup(word, firstExisting);
    if (!canonical) { fails.push({ kind: 'dict', word }); continue; }

    return { word, canonical, startX, startY };
  }

  const dictWords = [...new Set(fails.filter(f => f.kind === 'dict').map(f => f.word))];
  if (dictWords.length) {
    return { err: dictWords.map(w => `'${w}'`).join(', ') + '(으)로 읽어도 사전에 없는 단어입니다.' };
  }
  const dirF = fails.find(f => f.kind === 'dir');
  if (dirF) return { err: dirF.msg };
  const conf = fails.find(f => f.kind === 'conflict');
  if (conf) return { err: conf.msg };
  const long = fails.find(f => f.kind === 'long');
  if (long) return { err: long.msg };
  return { err: '두 글자 이상 입력하세요.' };
}

function placeWord(res, dir, by) {
  const { word, canonical, startX, startY } = res;
  const dx = dir === 'h' ? 1 : 0;
  const dy = dir === 'v' ? 1 : 0;
  const placed = [];
  for (let i = 0; i < word.length; i++) {
    const k = key(startX + dx * i, startY + dy * i);
    let cell = state.cells.get(k);
    const isNew = !cell;
    if (!cell) {
      cell = { ch: word[i], dirs: new Set() };
      state.cells.set(k, cell);
    }
    cell.dirs.add(dir);
    placed.push({ x: startX + dx * i, y: startY + dy * i, ch: word[i], dirs: [...cell.dirs], isNew });
  }
  state.words.push({ word, canonical, x: startX, y: startY, dir, by, ts: Date.now() });
  state.version++;
  return placed;
}

function fullCells() {
  return [...state.cells.entries()].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, ch: v.ch, dirs: [...v.dirs] };
  });
}

module.exports = {
  state, ensureLoaded, persist, resolvePlacement, placeWord,
  fullCells, touchPresence, userCount, dictLookup,
};
