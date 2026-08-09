// v1.9.211: 방(room) 시스템 — 로그인 직후엔 로비(방 목록)가 뜨고, 방을 고르거나(꽉 찬 방은
// 막힘) 새로 만들면(회원만 가능) 그 방의 board/presence에 입장함. "n명 접속 중" 모달의
// "방 목록"/"나가기" 버튼, 다른 방으로 옮길 때 이전 방에서 조용히 나가지는지도 확인.
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

const memberProfiles = { M0: { nickname: '테스터', iconIdx: 0 } };
const STORE = {
  memberProfiles, memberTotalScore: { M0: 0 }, memberFonts: {},
  '.info': { connected: true },
  roomMeta: {
    roomA: { title: '초보만 오세요', createdBy: 'M9', createdByName: '누군가', createdAt: 1, playerCount: 2 },
    roomFull: { title: '꽉찬방', createdBy: 'M9', createdByName: '누군가', createdAt: 2, playerCount: 5 },
  },
  roomPresence: { roomA: {}, roomFull: {} },
  roomBoards: { roomA: { cells: {}, words: [], version: 2 }, roomFull: { cells: {}, words: [], version: 2 } },
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
    off() { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === p) listeners.splice(i, 1); },
    once() { return Promise.resolve({ val: () => getAtPath(p) }); },
    set(v) { setAtPath(p, v); notifyPath(p); return Promise.resolve(); },
    update(v) { setAtPath(p, Object.assign(getAtPath(p) || {}, v)); notifyPath(p); return Promise.resolve(); },
    remove() { setAtPath(p, null); notifyPath(p); return Promise.resolve(); },
    push() { return chainRef(p ? p + '/pushkey' + Math.floor(Math.random() * 1e9) : 'pushkey' + Math.floor(Math.random() * 1e9)); },
    get key() { return p.split('/').pop(); },
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
window.firebase.database.ServerValue = { TIMESTAMP: 12345 };
window.FIREBASE_CONFIG = {};
window.localStorage.setItem('wb-memberUid', 'M0'); // 회원으로 바로 시작(로그인 화면 스킵)

const testSnippet = `
setTimeout(async () => {
  const results = [];
  results.push(['부팅 완료, clientId 확정(기대 M0)', clientId === 'M0']);
  results.push(['회원 모드로 시작(isMemberMode)', isMemberMode === true]);

  await new Promise(r => setTimeout(r, 60));

  // --- 로그인 직후엔 방에 안 들어간 채 로비가 먼저 뜸 ---
  results.push(['로그인 직후: 방 목록(로비)이 보임', !lobbyOverlayEl.classList.contains('hidden')]);
  results.push(['로그인 직후: 아직 어느 방에도 안 들어감(currentRoomId null)', currentRoomId === null]);

  // --- 기본방(항상 열려있는 방)이 없으면 자동으로 채워짐 ---
  await new Promise(r => setTimeout(r, 60));
  results.push(['기본방이 없으면 자동 생성됨(roomMeta.default)',
    !!window.__STORE.roomMeta[DEFAULT_ROOM_ID] &&
    window.__STORE.roomMeta[DEFAULT_ROOM_ID].title === '모두의 방' &&
    window.__STORE.roomMeta[DEFAULT_ROOM_ID].createdBy === 'system']);

  // --- 방 목록에 기존 방 2개 + 자동 생성된 기본방까지 3개가 정상 표시됨 ---
  const roomLis = [...lobbyRoomListEl.querySelectorAll('li')];
  results.push(['방 목록에 3개 표시됨(실제 ' + roomLis.length + '개)', roomLis.length === 3]);
  results.push(['기본방이 항상 목록 맨 위에 고정됨', roomLis[0].querySelector('.lobbyRoomTitle').textContent === '모두의 방']);
  const roomALi = roomLis.find(li => li.querySelector('.lobbyRoomTitle').textContent === '초보만 오세요');
  const roomFullLi = roomLis.find(li => li.querySelector('.lobbyRoomTitle').textContent === '꽉찬방');
  results.push(['roomA는 "2/5"로 표시', !!roomALi && roomALi.querySelector('.lobbyRoomCount').textContent === '2/5']);
  results.push(['roomFull은 "5/5"로 표시되고 full 클래스가 붙음', !!roomFullLi && roomFullLi.querySelector('.lobbyRoomCount').textContent === '5/5' && roomFullLi.classList.contains('full')]);

  // --- 꽉 찬 방을 누르면 입장이 막힘(토스트만 뜨고 그대로 로비에 남음) ---
  roomFullLi.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['꽉 찬 방 클릭 시 입장하지 않음(계속 로비)', currentRoomId === null && !lobbyOverlayEl.classList.contains('hidden')]);

  // --- 빈자리 있는 방(roomA)에 입장 ---
  roomALi.click();
  await new Promise(r => setTimeout(r, 80));
  results.push(['roomA 클릭 시 그 방으로 입장(currentRoomId)', currentRoomId === 'roomA']);
  results.push(['입장하면 로비가 닫힘', lobbyOverlayEl.classList.contains('hidden')]);
  results.push(['입장하면 내 프레즌스가 그 방에 올라감', !!window.__STORE.roomPresence.roomA.M0]);

  // --- "n명 접속 중" 모달의 "방 목록" 버튼 — 로비를 다시 열되, 아직 방을 나간 건 아님 ---
  browseRoomsBtnEl.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['"방 목록" 버튼: 로비가 다시 열림', !lobbyOverlayEl.classList.contains('hidden')]);
  results.push(['"방 목록" 버튼: 아직 roomA에 그대로 있음(구경만)', currentRoomId === 'roomA' && !!window.__STORE.roomPresence.roomA.M0]);

  // 로비에서 지금 있는 방(roomA)을 다시 누르면 그냥 복귀만 함
  const roomAAgain = [...lobbyRoomListEl.querySelectorAll('li')].find(li => li.querySelector('.lobbyRoomTitle').textContent === '초보만 오세요');
  roomAAgain.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['같은 방을 또 누르면 그냥 복귀(로비 닫힘, 여전히 roomA)', lobbyOverlayEl.classList.contains('hidden') && currentRoomId === 'roomA']);

  // --- 새 방 만들기(회원이므로 가능) ---
  browseRoomsBtnEl.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['회원이면 "새 방 만들기" 버튼이 활성화됨', lobbyCreateBtnEl.disabled === false]);
  lobbyCreateBtnEl.click();
  lobbyRoomTitleInputEl.value = '내가 만든 방';
  lobbyCreateSubmitBtnEl.click();
  await new Promise(r => setTimeout(r, 80));
  const newRoomId = currentRoomId;
  results.push(['방 만들기 후 그 방으로 바로 입장함', !!newRoomId && newRoomId !== 'roomA']);
  results.push(['roomMeta에 새 방이 올바른 정보로 생성됨',
    !!window.__STORE.roomMeta[newRoomId] &&
    window.__STORE.roomMeta[newRoomId].title === '내가 만든 방' &&
    window.__STORE.roomMeta[newRoomId].createdBy === 'M0' &&
    window.__STORE.roomMeta[newRoomId].playerCount === 0]);
  results.push(['새 방으로 옮기면서 roomA의 내 프레즌스는 지워짐(이전 방에서 조용히 나감)',
    !window.__STORE.roomPresence.roomA.M0]);
  results.push(['새 방에는 내 프레즌스가 올라감', !!window.__STORE.roomPresence[newRoomId].M0]);

  // --- "나가기" — 로비로 돌아가고 프레즌스도 지워짐 ---
  browseRoomsBtnEl.click(); // onlineOverlay를 거치지 않고 바로 leaveRoomBtn을 누르는 게 정상 플로우지만,
  await new Promise(r => setTimeout(r, 20));               // 여기선 버튼 자체 동작만 확인하면 되므로 그냥 클릭
  leaveRoomBtnEl.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['나가기 클릭 시 로비로 돌아감', !lobbyOverlayEl.classList.contains('hidden') && currentRoomId === null]);
  results.push(['나가기 클릭 시 그 방의 내 프레즌스도 지워짐', !window.__STORE.roomPresence[newRoomId].M0]);

  // --- 비회원이면 방을 못 만듦(버튼 비활성화) ---
  isMemberMode = false;
  showLobby();
  results.push(['비회원이면 "새 방 만들기" 버튼이 비활성화됨', lobbyCreateBtnEl.disabled === true]);
  results.push(['비회원 안내 문구가 보임', !lobbyGuestNoticeEl.classList.contains('hidden')]);
  isMemberMode = true; // 원상복구

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
