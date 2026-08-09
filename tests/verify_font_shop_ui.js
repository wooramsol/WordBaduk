// v1.9.186/v1.9.187: 폰트 상점 모달 — 해금/잠금 표시(탭 없이 단일 카탈로그), 장착/해제 시
// memberFonts에 즉시 write되고 "게임플레이 중"에도(재접속/새로고침 없이) 화면(보드 canvas +
// 상점 배지)에 바로 반영되는지 검증.
//
// 이 값들(150점 등)은 이 파일이 하드코딩한 게 아니라 아래 assert들이 지금 FONT_CATALOG의
// yoonchorokusan(100점)/galmuri9(300점) 문턱값을 전제로 짜여 있다는 뜻 — 그 두 폰트의
// requiredScore를 바꾸거나 순서를 바꾸면 이 테스트도 같이 고쳐야 한다.
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

window.__fillTextLog = [];
function makeRecordingCtx() {
  let currentFont = '';
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'fillText') return (text) => { window.__fillTextLog.push({ text, font: currentFont }); };
      return (...args) => ({});
    },
    set(target, prop, value) { if (prop === 'font') currentFont = value; return true; },
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
window.document.fonts = { load: () => Promise.reject(new Error('no fonts in jsdom')) };
window.fetch = (url) => {
  const u = String(url);
  if (u.includes('version.txt')) return Promise.resolve({ text: () => Promise.resolve(APP_VERSION), ok: true, json: () => Promise.resolve({}) });
  if (u.includes('words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  if (u.includes('seed-words.txt')) return Promise.resolve({ text: () => Promise.resolve('사과\n') });
  return Promise.resolve({ text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
};

const memberProfiles = { M0: { nickname: '나', iconIdx: 0 } };
const memberTotalScore = { M0: 150 }; // yoonchorokusan(100)은 해금, galmuri9(300)는 아직 잠김
const STORE = {
  memberProfiles, memberTotalScore, memberFonts: {},
  // v1.9.211: 방(room) 시스템 — 전역 board 대신 roomBoards/{roomId}. 테스트는 항상
  // enterRoom('testRoom')으로 이 방에 들어감(로비 화면을 거쳐야 board 구독이 시작됨).
  roomBoards: {
    testRoom: {
      cells: { '3,3': { ch: '가', h: true, by: 'M0' } }, // M0가 놓은 글자 — 장착 후 즉시 폰트가 바뀌는지 볼 대상
      words: [], version: 2,
    },
  },
};
// v1.9.186 테스트 노트: 기존 여러 verify_*.js가 쓰던 flat "STORE[path]" 방식은 경로에 '/'가
// 섞인 단일 문자열 ref(예: db.ref('memberFonts/' + uid))의 실제 중첩 저장/구독을 지원하지
// 못해서(각 경로 문자열을 그냥 독립된 채널로 취급), memberFonts/{uid}에 쓴 게 memberFonts
// 전체를 구독 중인 리스너에게 전파되지 않는 문제가 있었음. 그래서 여기서는 실제 Firebase처럼
// '/'로 진짜 중첩 탐색하고, 하위 경로에 쓰면 그 조상 경로를 구독 중인 리스너에게도 전부
// 알림이 가도록(버블링) 제대로 구현함.
function getAtPath(path) {
  if (!path) return STORE;
  let node = STORE;
  for (const p of path.split('/')) {
    if (node == null) return undefined;
    node = node[p];
  }
  return node;
}
function setAtPath(path, value) {
  if (!path) return;
  const parts = path.split('/');
  let node = STORE;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (node[p] == null || typeof node[p] !== 'object') node[p] = {};
    node = node[p];
  }
  node[parts[parts.length - 1]] = value;
}
const listeners = []; // { path, cb }
function notifyPath(changedPath) {
  for (const l of listeners) {
    if (l.path === changedPath || l.path === '' || changedPath.startsWith(l.path + '/') || l.path.startsWith(changedPath + '/')) {
      const p = l.path;
      setTimeout(() => l.cb({ val: () => getAtPath(p), key: (p.split('/').pop() || 'k') }), 1);
    }
  }
}
function chainRef(path) {
  const ref = {
    path,
    on(evt, cb) {
      listeners.push({ path, cb });
      setTimeout(() => cb({ val: () => getAtPath(path), key: (path.split('/').pop() || 'k') }), 5);
      return cb;
    },
    off() { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === path) listeners.splice(i, 1); },
    once(evt) { return Promise.resolve({ val: () => getAtPath(path), exists: () => getAtPath(path) != null }); },
    set(v) { setAtPath(path, v); notifyPath(path); return Promise.resolve(); },
    update(v) { setAtPath(path, Object.assign(getAtPath(path) || {}, v)); notifyPath(path); return Promise.resolve(); },
    remove() { setAtPath(path, null); notifyPath(path); return Promise.resolve(); },
    push() { return { key: 'pushkey' + Math.random() }; },
    onDisconnect() { return { remove(){}, set(){} }; },
    transaction(fn) {
      const res = fn(getAtPath(path));
      if (res === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => getAtPath(path) } });
      setAtPath(path, res);
      notifyPath(path);
      return Promise.resolve({ committed: true, snapshot: { val: () => res } });
    },
    ref(child) { return chainRef(path ? path + '/' + child : child); },
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

  // v1.9.211: 방 시스템 — 로비에서 testRoom으로 입장해야 board 구독(및 그 안의 cells)이 시작됨
  enterRoom('testRoom');
  await new Promise(r => setTimeout(r, 60));

  fontShopBtn.click();
  await new Promise(r => setTimeout(r, 50));

  // v1.9.186 테스트 노트: renderFontShop()은 매번 fontShopListEl.textContent = ''로 자식을
  // 통째로 새로 그리므로, 탭을 전환하거나 장착한 뒤에는 예전에 캡처해둔 li 참조가 죽은(detached)
  // 노드가 됨 — 그래서 매번 fontShopListEl에서 "지금 살아있는" 노드를 다시 조회해야 함
  function itemOf(name) {
    return [...fontShopListEl.querySelectorAll('.fontShopItem')]
      .find(li => li.querySelector('.fontShopName').textContent === name);
  }
  const items = [...fontShopListEl.querySelectorAll('.fontShopItem')];
  results.push(['[상점] FONT_CATALOG 개수만큼 전부 표시됨(실제 ' + items.length + ', 기대 ' + FONT_CATALOG.length + ')', items.length === FONT_CATALOG.length]);

  const yoonchorokusanBtn = itemOf('윤초록우산어린이 만세').querySelector('.fontShopEquipBtn');
  results.push(['[해금] 150점이면 윤초록우산어린이 만세(100점)는 해금되어 "장착" 버튼이 보임(실제: "' + yoonchorokusanBtn.textContent + '")',
    yoonchorokusanBtn.textContent === '장착' && !yoonchorokusanBtn.disabled]);

  const galmuri9Btn = itemOf('갈무리9').querySelector('.fontShopEquipBtn');
  results.push(['[잠금] 150점이면 갈무리9(500점)는 아직 잠겨서 🔒로 비활성화됨(실제: "' + galmuri9Btn.textContent + '", disabled=' + galmuri9Btn.disabled + ')',
    galmuri9Btn.textContent === '🔒' && galmuri9Btn.disabled]);

  // v1.9.190: 해금돼도 "해금됨"으로 뭉개지 않고 실제 점수/문턱값 숫자를 그대로 보여줌(몇 점에서
  // 해금됐는지 계속 알 수 있게).
  // v1.9.204: 문턱값 숫자(.reqThreshold)만 따로 색이 붙음 — 미달(locked)이면 빨강, 도달
  // (unlocked)이면 초록. 기본체는 항상 도달 상태이므로 초록.
  const yoonchorokusanReq = itemOf('윤초록우산어린이 만세').querySelector('.fontShopReq');
  const yoonchorokusanThreshold = yoonchorokusanReq.querySelector('.reqThreshold');
  results.push(['[숫자표시] 해금된 윤초록우산어린이 만세도 "해금됨" 대신 "150/100점"으로 보임(실제: "' + yoonchorokusanReq.textContent + '")',
    yoonchorokusanReq.textContent === '150/100점']);
  results.push(['[색상] 해금된 윤초록우산어린이 만세의 문턱값(100점)은 unlocked(초록) 클래스',
    yoonchorokusanThreshold.classList.contains('unlocked') && !yoonchorokusanThreshold.classList.contains('locked')]);

  const galmuri9Req = itemOf('갈무리9').querySelector('.fontShopReq');
  const galmuri9Threshold = galmuri9Req.querySelector('.reqThreshold');
  results.push(['[숫자표시] 잠긴 갈무리9는 "150/500점"으로 보임(실제: "' + galmuri9Req.textContent + '")',
    galmuri9Req.textContent === '150/500점']);
  results.push(['[색상] 잠긴 갈무리9의 문턱값(500점)은 locked(빨강) 클래스',
    galmuri9Threshold.classList.contains('locked') && !galmuri9Threshold.classList.contains('unlocked')]);

  const defaultItem = itemOf('기본체');
  const defaultReq = defaultItem.querySelector('.fontShopReq');
  const defaultThreshold = defaultReq.querySelector('.reqThreshold');
  results.push(['[기본체] 문구는 "기본 제공"(실제: "' + defaultReq.textContent + '")', defaultReq.textContent === '기본 제공']);
  results.push(['[색상] 기본체는 항상 도달 상태이므로 unlocked(초록) 클래스',
    defaultThreshold.classList.contains('unlocked') && !defaultThreshold.classList.contains('locked')]);

  // --- 장착: 윤초록우산어린이 만세 "장착" 버튼 클릭 -> memberFonts/M0에 즉시 write (v1.9.187: 보관함 탭
  // 없이 상점 하나에서 바로 장착/해제하므로 탭 전환 없이 곧바로 클릭) ---
  window.__fillTextLog.length = 0;
  itemOf('윤초록우산어린이 만세').querySelector('.fontShopEquipBtn').click();
  // 클라이언트가 직접 RTDB에 set()한 뒤, on('value') 구독이 콜백으로 돌아오는 왕복까지 기다림
  await new Promise(r => setTimeout(r, 100));

  results.push(['[write] memberFonts/M0가 yoonchorokusan로 저장됨(실제: "' + window.__STORE.memberFonts.M0 + '")',
    window.__STORE.memberFonts.M0 === 'yoonchorokusan']);

  // --- 즉시 적용 1: 상점 모달의 배지가 "장착 중"으로 바로 바뀜(재조회 없이) ---
  const yoonchorokusanBtnAfter = itemOf('윤초록우산어린이 만세').querySelector('.fontShopEquipBtn');
  results.push(['[즉시 적용-UI] 장착 직후 버튼이 "장착 중"으로 바로 바뀜(실제: "' + yoonchorokusanBtnAfter.textContent + '")',
    yoonchorokusanBtnAfter.textContent === '장착 중']);

  // --- 즉시 적용 2: 보드 캔버스도 재접속/새로고침 없이 바로 새 폰트로 다시 그려짐 ---
  window.__fillTextLog.length = 0;
  draw();
  const gaCall = window.__fillTextLog.find(c => c.text === '가');
  results.push(['[즉시 적용-보드] 장착 직후 draw()가 그 글자를 WB-YoonChorokusan 폰트로 그림(실제: "' + (gaCall && gaCall.font) + '")',
    !!gaCall && gaCall.font.includes('WB-YoonChorokusan')]);

  // --- 해제: 보관함 없이 상점에서 "기본체"를 다시 장착하면 바로 되돌아감 ---
  itemOf('기본체').querySelector('.fontShopEquipBtn').click();
  await new Promise(r => setTimeout(r, 100));
  results.push(['[해제] 기본체를 다시 장착하면 memberFonts/M0가 default로 되돌아감(실제: "' + window.__STORE.memberFonts.M0 + '")',
    window.__STORE.memberFonts.M0 === 'default']);
  window.__fillTextLog.length = 0;
  draw();
  const gaCallAfterReset = window.__fillTextLog.find(c => c.text === '가');
  results.push(['[해제-보드] 해제 직후 draw()가 커스텀 폰트 없이 기본 폰트로 다시 그림(실제: "' + (gaCallAfterReset && gaCallAfterReset.font) + '")',
    !!gaCallAfterReset && !gaCallAfterReset.font.includes('WB-')]);

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
