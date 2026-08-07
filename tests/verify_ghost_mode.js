// v1.9.207: 고스트 모드 — 관리자(닉네임 '람솔')가 "n명 접속 중" 모달의 스위치를 켜면
// 내 presence(presence/{clientId})가 아예 안 올라가야 하고(= 다른 사람 화면의 접속자
// 수/목록/등장 카드/봇의 "혼자 있음" 판정에서 나만 빠짐), 꺼면 다시 정상적으로 올라가야
// 한다. 관리자가 아니면 스위치 자체가 안 보여야 한다.
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
  if (u.includes('words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  if (u.includes('seed-words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  return Promise.resolve({ text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
};

// 관리자 계정으로 부팅 — 닉네임이 '람솔'이면 isOwnerAdmin()이 true가 됨
const memberProfiles = { M0: { nickname: '람솔', iconIdx: 0 } };
const STORE = {
  memberProfiles, memberTotalScore: { M0: 0 }, memberFonts: {},
  '.info': { connected: true }, // 실제 RTDB처럼 중첩 경로(.info/connected)로 둬야 getAtPath가 찾음
  presence: {},
  board: { cells: {}, words: [], version: 2 },
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
      const res = fn(getAtPath(p));
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

const testSnippet = `
setTimeout(async () => {
  const results = [];
  results.push(['부팅 완료, clientId 확정(기대 M0)', clientId === 'M0']);
  results.push(['isOwnerAdmin() true(닉네임이 람솔)', isOwnerAdmin() === true]);
  results.push(['관리자면 고스트 모드 스위치가 보임(hidden 아님)', !ghostModeRowEl.classList.contains('hidden')]);
  results.push(['기본값은 꺼짐(체크박스 unchecked)', ghostModeCheckboxEl.checked === false]);

  await new Promise(r => setTimeout(r, 60));
  results.push(['[꺼진 상태] 정상적으로 presence/M0가 올라감', !!window.__STORE.presence.M0]);
  results.push(['[꺼진 상태] "n명 접속 중" 문구에 고스트 표시 없음', !userCountTextEl.textContent.includes('고스트')]);

  // --- 고스트 모드 켜기 ---
  ghostModeCheckboxEl.checked = true;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  results.push(['[켠 직후] presence/M0가 사라짐(다른 사람 눈엔 접속자 수/목록/봇 판정에서 안 잡힘)',
    !window.__STORE.presence.M0]);
  results.push(['[켠 직후] localStorage에 저장됨', window.localStorage.getItem('wb-ghostMode') === '1']);
  results.push(['[켠 직후] "n명 접속 중" 문구에 고스트 표시가 붙음(나에게만 보이는 로컬 표시)',
    userCountTextEl.textContent.includes('고스트')]);

  // --- 고스트 모드 끄기(다시 정상 접속자로) ---
  ghostModeCheckboxEl.checked = false;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  results.push(['[다시 끈 뒤] presence/M0가 다시 올라감', !!window.__STORE.presence.M0]);
  results.push(['[다시 끈 뒤] localStorage도 갱신됨', window.localStorage.getItem('wb-ghostMode') === '0']);
  results.push(['[다시 끈 뒤] "n명 접속 중" 문구에서 고스트 표시가 없어짐',
    !userCountTextEl.textContent.includes('고스트')]);

  window.__resultsFromEval = results;
  window.__done = true;
}, 1000);
`;

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
    const results = window.__resultsFromEval || [];
    results.forEach(([label, pass]) => console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label));
    const allPass = results.length > 0 && results.every(r => r[1]);
    console.log('\n전체 결과:', allPass ? 'ALL PASS' : 'SOME FAIL');
    process.exit(allPass ? 0 : 1);
  }
  if (Date.now() - waitStart > 8000) { console.log('FAIL: 타임아웃'); process.exit(1); }
  setTimeout(waitLoop, 30);
})();
