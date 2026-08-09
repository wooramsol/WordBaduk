// v1.9.218: 서버 RTDB의 board 경로가 아예 없는(null) 완전히 빈 상태로 제일 처음 들어오는
// 사람에게는 씨앗 단어(1~3개)가 안 뜨던 버그를 검증. boot()이 board가 없을 때만 트랜잭션으로
// buildSeedBoard()를 한 번 심고, 이미 board가 있으면(누가 먼저 심었거나 진행 중인 판이면)
// 절대 덮어쓰지 않아야 한다(진행 중이던 게임이 리셋되면 안 되므로).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mainScript = scripts[1];
const verMatch = mainScript.match(/const APP_VERSION = '([^']+)'/);
const APP_VERSION = verMatch[1];

function runScenario({ initialBoard }) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://wordbaduk.web.app/', pretendToBeVisual: true });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => (() => ({})), set: () => true });
  window.Audio = class { play() {} };
  function fakeAudioNode() { const node = { connect: () => node, disconnect(){}, start(){}, stop(){} }; node.gain = { value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; node.frequency = { value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; node.type=''; return node; }
  window.AudioContext = window.webkitAudioContext = class { constructor(){ this.state='running'; this.currentTime=0; this.destination=fakeAudioNode(); this.sampleRate=44100; } createOscillator(){return fakeAudioNode();} createGain(){return fakeAudioNode();} createBiquadFilter(){const n=fakeAudioNode();n.frequency={value:0};n.Q={value:0};n.type='';return n;} createBufferSource(){return fakeAudioNode();} createBuffer(ch,len,rate){return {getChannelData:()=>new Float32Array(len)};} resume(){return Promise.resolve();} };
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){} }));
  window.visualViewport = { addEventListener(){}, removeEventListener(){}, width:800, height:600 };
  window.document.fonts = { load: () => Promise.reject(new Error('no fonts in jsdom')) };
  window.fetch = (url) => {
    const u = String(url);
    if (u.includes('version.txt')) return Promise.resolve({ text: () => Promise.resolve(APP_VERSION), ok: true, json: () => Promise.resolve({}) });
    if (u.includes('words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n나무\n') });
    if (u.includes('seed-words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n나무\n') });
    return Promise.resolve({ text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
  };

  const memberProfiles = { M0: { nickname: '첫사람', iconIdx: 0 } };
  const STORE = {
    memberProfiles, memberTotalScore: { M0: 0 }, memberFonts: {},
    '.info': { connected: true },
    presence: {},
    board: initialBoard, // null이면 "완전히 빈 서버 상태"를 흉내냄
  };
  function getAtPath(p) {
    if (!p) return STORE;
    let node = STORE;
    for (const seg of p.split('/')) { if (node == null) return undefined; node = node[seg]; }
    return node;
  }
  function setAtPath(p, value) {
    if (!p) return;
    const parts = p.split('/');
    let node = STORE;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (node[seg] == null || typeof node[seg] !== 'object') node[seg] = {};
      node = node[seg];
    }
    node[parts[parts.length - 1]] = value;
  }
  const listeners = [];
  function notifyPath(changedPath) {
    for (const l of listeners) {
      if (l.path === changedPath || l.path === '' || changedPath.startsWith(l.path + '/') || l.path.startsWith(changedPath + '/')) {
        const p = l.path;
        setTimeout(() => l.cb({ val: () => getAtPath(p), key: (p.split('/').pop() || 'k') }), 1);
      }
    }
  }
  function chainRef(p) {
    const ref = {
      path: p,
      on(evt, cb) { listeners.push({ path: p, cb }); setTimeout(() => cb({ val: () => getAtPath(p), key: (p.split('/').pop() || 'k') }), 5); return cb; },
      once() { return Promise.resolve({ val: () => getAtPath(p) }); },
      set(v) { setAtPath(p, v); notifyPath(p); return Promise.resolve(); },
      update(v) { setAtPath(p, Object.assign(getAtPath(p) || {}, v)); notifyPath(p); return Promise.resolve(); },
      remove() { setAtPath(p, null); notifyPath(p); return Promise.resolve(); },
      push() { return { key: 'pushkey' + Math.random() }; },
      onDisconnect() { return { remove(){}, set(){}, cancel(){ return Promise.resolve(); } }; },
      transaction(fn) {
        const res = fn(getAtPath(p) === undefined ? null : getAtPath(p));
        if (res === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => getAtPath(p) } });
        setAtPath(p, res);
        notifyPath(p);
        return Promise.resolve({ committed: true, snapshot: { val: () => res } });
      },
      ref(child) { return chainRef(p ? p + '/' + child : child); },
    };
    ref.child = ref.ref;
    return ref;
  }
  window.__STORE = STORE;
  window.firebase = { initializeApp() {}, database: () => chainRef('') };
  window.firebase.database.ServerValue = { TIMESTAMP: 0 };
  window.FIREBASE_CONFIG = {};
  window.localStorage.setItem('wb-memberUid', 'M0');

  return { window, STORE };
}

async function main() {
  const allResults = [];

  // --- 시나리오 1: board가 아예 null(완전히 빈 서버) — 씨앗이 심어져야 함 ---
  {
    const { window, STORE } = runScenario({ initialBoard: null });
    const testSnippet = `
      setTimeout(async () => {
        const results = [];
        results.push(['부팅 완료, clientId 확정(기대 M0)', clientId === 'M0']);
        await new Promise(r => setTimeout(r, 80));
        const b = window.__STORE.board;
        results.push(['[빈 서버] board가 더 이상 null이 아님(씨앗이 심어짐)', !!b]);
        const wl = b ? (Array.isArray(b.words) ? b.words : Object.values(b.words || {})) : [];
        results.push(['[빈 서버] 씨앗 단어 개수가 1~3개', wl.length >= 1 && wl.length <= 3]);
        results.push(['[빈 서버] cells에 실제 글자가 채워짐', b && Object.keys(b.cells || {}).length > 0]);
        // buildSeedBoard()는 씨앗 단어를 서로 독립적으로 뽑기 때문에(테스트용 폴백
        // 후보군이 5개뿐이라) 우연히 같은 단어가 두 번 뽑힐 수 있음 — 그러면 words.length는
        // 3이어도 usedWords(Set)는 중복이 합쳐져 2가 되는 게 정상이므로, 개수를 그대로
        // 비교하지 않고 "심어진 단어들이 전부 usedWords 안에 있는지"만 확인함
        results.push(['[빈 서버] 내 화면(usedWords)에도 그 단어들이 바로 반영됨',
          wl.length > 0 && wl.every(w => usedWords.has(w.canonical || w.word))]);
        window.__resultsFromEval = results;
        window.__done = true;
      }, 1000);
    `;
    let caughtError = null;
    try { window.eval(mainScript + '\n' + testSnippet); } catch (e) { caughtError = e; }
    if (caughtError) {
      allResults.push(['[시나리오1] 스크립트 실행 중 에러 없음: ' + (caughtError.stack || caughtError.message), false]);
    } else {
      const waitStart = Date.now();
      await new Promise(resolve => {
        (function waitLoop() {
          if (window.__done) { allResults.push(...(window.__resultsFromEval || [])); return resolve(); }
          if (Date.now() - waitStart > 8000) { allResults.push(['[시나리오1] 타임아웃', false]); return resolve(); }
          setTimeout(waitLoop, 30);
        })();
      });
    }
  }

  // --- 시나리오 2: board가 이미 진행 중인 판(비어있지 않음) — 절대 덮어쓰면 안 됨 ---
  {
    const existingBoard = {
      version: 3,
      words: [{ word: '기존단어', canonical: null, x: 2, y: 2, dir: 'h', by: 'P9', ts: 12345, chat: false }],
      cells: { '2,2': { ch: '기', h: true, by: 'P9' } },
    };
    const { window, STORE } = runScenario({ initialBoard: existingBoard });
    const testSnippet = `
      setTimeout(async () => {
        const results = [];
        await new Promise(r => setTimeout(r, 80));
        const b = window.__STORE.board;
        results.push(['[기존 판 있음] version이 그대로 3(덮어써지지 않음)', b && b.version === 3]);
        results.push(['[기존 판 있음] 기존 단어("기존단어")가 그대로 남아있음', b && Array.isArray(b.words) && b.words.some(w => w.word === '기존단어')]);
        window.__resultsFromEval = results;
        window.__done = true;
      }, 1000);
    `;
    let caughtError = null;
    try { window.eval(mainScript + '\n' + testSnippet); } catch (e) { caughtError = e; }
    if (caughtError) {
      allResults.push(['[시나리오2] 스크립트 실행 중 에러 없음: ' + (caughtError.stack || caughtError.message), false]);
    } else {
      const waitStart = Date.now();
      await new Promise(resolve => {
        (function waitLoop() {
          if (window.__done) { allResults.push(...(window.__resultsFromEval || [])); return resolve(); }
          if (Date.now() - waitStart > 8000) { allResults.push(['[시나리오2] 타임아웃', false]); return resolve(); }
          setTimeout(waitLoop, 30);
        })();
      });
    }
  }

  allResults.forEach(([label, pass]) => console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label));
  const allPass = allResults.length > 0 && allResults.every(r => r[1]);
  console.log('\n전체 결과:', allPass ? 'ALL PASS' : 'SOME FAIL');
  process.exit(allPass ? 0 : 1);
}

main();
