// v1.9.186: "폰트 상점" — 격자에 놓인 글자(c.by=놓은 사람)를 canvas에 그릴 때, 그 사람이
// memberFonts에 장착해둔 웹폰트(ctx.font)로 실제로 바뀌는지 검증. UI 폰트는 절대 안 바뀌어야
// 하므로 이 테스트는 오직 draw()가 fillText 직전 세팅하는 ctx.font 값만 확인함.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mainScript = scripts[1];
const verMatch = mainScript.match(/const APP_VERSION = '([^']+)'/);
const APP_VERSION = verMatch[1];

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://wordbaduk.web.app/', pretendToBeVisual: true });
const { window } = dom;

// --- 폰트/fillText 호출을 기록하는 canvas mock (다른 테스트들의 "전부 no-op" 프록시 대신,
// font 세팅과 fillText 호출만 정확히 기록하도록 직접 구현) ---
window.__fillTextLog = [];
const fillTextLog = window.__fillTextLog;
function makeRecordingCtx() {
  let currentFont = '';
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'fillText') {
        return (text) => { fillTextLog.push({ text, font: currentFont }); };
      }
      return (...args) => ({});
    },
    set(target, prop, value) {
      if (prop === 'font') currentFont = value;
      return true;
    },
  });
}
window.HTMLCanvasElement.prototype.getContext = () => makeRecordingCtx();

window.Audio = class { play() {} };
function fakeAudioNode() { const node = { connect: () => node, disconnect(){}, start(){}, stop(){} }; node.gain = { value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; node.frequency = { value:0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; node.type=''; return node; }
window.AudioContext = window.webkitAudioContext = class { constructor(){ this.state='running'; this.currentTime=0; this.destination=fakeAudioNode(); this.sampleRate=44100; } createOscillator(){return fakeAudioNode();} createGain(){return fakeAudioNode();} createBiquadFilter(){const n=fakeAudioNode();n.frequency={value:0};n.Q={value:0};n.type='';return n;} createBufferSource(){return fakeAudioNode();} createBuffer(ch,len,rate){return {getChannelData:()=>new Float32Array(len)};} resume(){return Promise.resolve();} };
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){} }));
window.visualViewport = { addEventListener(){}, removeEventListener(){}, width:800, height:600 };
// document.fonts.load()도 목업(FontFace API 미지원 환경 취급) — draw()가 폰트 로딩 콜백을
// 기다리지 않고도 정상 동작해야 함(로딩 실패해도 그냥 기본 폰트로 폴백)
window.document.fonts = { load: () => Promise.reject(new Error('no fonts in jsdom')) };
window.fetch = (url) => {
  const u = String(url);
  if (u.includes('version.txt')) return Promise.resolve({ text: () => Promise.resolve(APP_VERSION), ok: true, json: () => Promise.resolve({}) });
  if (u.includes('words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  if (u.includes('seed-words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  return Promise.resolve({ text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
};

const memberProfiles = {
  M0: { nickname: '나', iconIdx: 0 },
  M1: { nickname: '친구', iconIdx: 1 },
};
const memberTotalScore = { M0: 150, M1: 0 };
// M0는 윤초록우산어린이 만세(yoonchorokusan, 100점 문턱)를 이미 장착함. M1은 아무것도 장착 안 함(기본 폰트).
const memberFonts = { M0: 'yoonchorokusan' };
const STORE = {
  memberProfiles, memberTotalScore, memberFonts,
  board: {
    cells: {
      '3,3': { ch: '가', h: true, by: 'M0' }, // M0가 놓음 -> 윤초록우산어린이 만세로 그려져야 함
      '4,3': { ch: '나', h: true, by: 'M1' }, // M1이 놓음 -> 기본 폰트로 그려져야 함
    },
    words: [], version: 2,
  },
};
function chainRef(path) {
  const ref = {
    path,
    _cb: null,
    get _val() { return STORE[path]; },
    set _val(v) { STORE[path] = v; },
    on(evt, cb) { ref._cb = cb; setTimeout(() => cb({ val: () => ref._val, key: 'k' }), 5); return cb; },
    once(evt) { return Promise.resolve({ val: () => ref._val }); },
    set(v) { ref._val = v; if (ref._cb) setTimeout(() => ref._cb({ val: () => ref._val, key: 'k' }), 1); return Promise.resolve(); },
    update(v) { ref._val = Object.assign(ref._val || {}, v); if (ref._cb) setTimeout(() => ref._cb({ val: () => ref._val, key: 'k' }), 1); return Promise.resolve(); },
    remove() { ref._val = null; return Promise.resolve(); },
    push() { return { key: 'pushkey' + Math.random() }; },
    onDisconnect() { return { remove(){}, set(){} }; },
    transaction(fn) {
      const res = fn(ref._val);
      if (res === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => ref._val } });
      ref._val = res;
      if (ref._cb) setTimeout(() => ref._cb({ val: () => ref._val, key: 'k' }), 1);
      return Promise.resolve({ committed: true, snapshot: { val: () => res } });
    },
    ref(child) { return chainRef(path ? path + '/' + child : child); },
  };
  ref.child = ref.ref;
  return ref;
}
window.firebase = { initializeApp() {}, database: () => chainRef('') };
window.firebase.database.ServerValue = { TIMESTAMP: 0 };
window.FIREBASE_CONFIG = {};
window.localStorage.setItem('wb-memberUid', 'M0');

const testSnippet = `
setTimeout(() => {
  const results = [];
  results.push(['부팅 완료, clientId 확정(기대 M0)', clientId === 'M0']);

  // --- [카탈로그] FONT_CATALOG 구조 확인 ---
  results.push(['[카탈로그] 기본체를 포함한 전체 폰트 개수가 1개보다 많음', FONT_CATALOG.length > 1]);
  results.push(['[카탈로그] yoonchorokusan family가 WB-YoonChorokusan', FONT_BY_ID.get('yoonchorokusan').family === 'WB-YoonChorokusan']);

  __fillTextLog.length = 0;
  draw();

  // --- [draw] M0가 놓은 글자('가')는 WB-YoonChorokusan 폰트로 그려짐 ---
  const gaCall = __fillTextLog.find(c => c.text === '가');
  results.push(['[draw] M0가 놓은 글자는 WB-YoonChorokusan 폰트로 그려짐(실제 font: "' + (gaCall && gaCall.font) + '")',
    !!gaCall && gaCall.font.includes('WB-YoonChorokusan')]);

  // --- [draw] M1이 놓은 글자('나')는 커스텀 폰트가 안 섞이고 기본 폰트만 씀 ---
  const naCall = __fillTextLog.find(c => c.text === '나');
  results.push(['[draw] M1이 놓은 글자는 커스텀 폰트가 안 섞임(실제 font: "' + (naCall && naCall.font) + '")',
    !!naCall && !naCall.font.includes('WB-') && naCall.font.includes('Apple SD Gothic Neo')]);

  window.__resultsFromEval = results;
  window.__done = true;
}, 1000);
`;

// --- 정적 소스 검사: UI 텍스트(.hofName/.name/.recentName 등)의 CSS 규칙 블록 안에는
// WB- 폰트 패밀리가 절대 등장하면 안 됨(격자 글자에만 한정돼야 하므로) ---
const staticResults = [];
const uiSelectors = ['.hofName', '.name', '.recentName', '#brand', '#hofTitle', '.lbList'];
let uiCssLeak = false;
for (const sel of uiSelectors) {
  const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*\\}', 'g');
  const m = html.match(re);
  if (m && m.some(block => block.includes('WB-'))) uiCssLeak = true;
}
staticResults.push(['[UI 무영향] UI 텍스트 CSS 규칙 안에 WB- 커스텀 폰트가 섞여있지 않음', !uiCssLeak]);

let caughtError = null;
try {
  window.eval(mainScript + '\n' + testSnippet);
} catch (e) {
  caughtError = e;
}
if (caughtError) {
  console.log('FAIL:', caughtError.stack || caughtError.message);
  process.exit(1);
}

const waitStart = Date.now();
(function waitLoop() {
  if (window.__done) {
    const results = [...staticResults, ...(window.__resultsFromEval || [])];
    results.forEach(([label, pass]) => console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label));
    const allPass = results.length > 0 && results.every(r => r[1]);
    console.log('\n전체 결과:', allPass ? 'ALL PASS' : 'SOME FAIL');
    process.exit(allPass ? 0 : 1);
  }
  if (Date.now() - waitStart > 8000) { console.log('FAIL: 타임아웃'); process.exit(1); }
  setTimeout(waitLoop, 30);
})();
