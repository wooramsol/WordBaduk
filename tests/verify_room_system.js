// v1.9.214: 방(room) 시스템 — 로그인 직후엔 로비 화면 없이 곧장 "모두의 방"(DEFAULT_ROOM_ID)에
// 입장한다. 방 목록은 "n명 접속 중" 모달(#onlineCard) 안에 곧장 이어지는 섹션이라, 그 모달을
// 열기만 하면(클릭 한 번 더 없이) 바로 보인다. 방 인원수 제한은 없다(모두의 방/일반 방 모두
// 무제한). "나가기"는 지금 있는 방이 모두의 방이 아닐 때만 보이고, 누르면 모두의 방으로
// 돌아간다.
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
    // v1.9.213: 인원수 제한이 없어졌으므로, 예전엔 "꽉 찬 방"으로 클릭이 막혔던 방도 이제
    // 그냥 인원이 많은 방일 뿐 정상적으로 입장 가능해야 함을 검증하는 용도로 남겨둠
    roomMany: { title: '인원많은방', createdBy: 'M9', createdByName: '누군가', createdAt: 2, playerCount: 37 },
  },
  roomPresence: { roomA: {}, roomMany: {} },
  roomBoards: { roomA: { cells: {}, words: [], version: 2 }, roomMany: { cells: {}, words: [], version: 2 } },
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

  await new Promise(r => setTimeout(r, 80));

  // --- 로그인 직후: 로비 화면 없이 곧장 "모두의 방"에 입장함 ---
  results.push(['로그인 직후: 곧장 모두의 방(DEFAULT_ROOM_ID)에 입장됨', currentRoomId === DEFAULT_ROOM_ID]);
  results.push(['기본방이 없으면 자동 생성됨(roomMeta.default)',
    !!window.__STORE.roomMeta[DEFAULT_ROOM_ID] &&
    window.__STORE.roomMeta[DEFAULT_ROOM_ID].title === '모두의 방' &&
    window.__STORE.roomMeta[DEFAULT_ROOM_ID].createdBy === 'system']);
  results.push(['모두의 방에 내 프레즌스가 올라감', !!window.__STORE.roomPresence[DEFAULT_ROOM_ID].M0]);

  // --- "n명 접속 중" 모달을 열면 클릭 한 번 더 없이 방 목록이 곧장 보임 ---
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  results.push(['"n명 접속 중" 모달이 열림', !onlineOverlay.classList.contains('hidden')]);
  results.push(['모두의 방에서는 "나가기" 버튼이 숨겨짐', leaveRoomBtnEl.classList.contains('hidden')]);

  // --- 방 목록에 기본방 + 기존 방 2개, 총 3개가 클릭 없이 바로 표시됨 ---
  const roomLis = [...lobbyRoomListEl.querySelectorAll('li')];
  results.push(['방 목록에 3개 표시됨(실제 ' + roomLis.length + '개)', roomLis.length === 3]);
  results.push(['기본방이 항상 목록 맨 위에 고정됨', roomLis[0].querySelector('.lobbyRoomTitle').textContent === '모두의 방']);
  const roomALi = roomLis.find(li => li.querySelector('.lobbyRoomTitle').textContent === '초보만 오세요');
  const roomManyLi = roomLis.find(li => li.querySelector('.lobbyRoomTitle').textContent === '인원많은방');
  results.push(['roomA는 "2명"으로 표시', !!roomALi && roomALi.querySelector('.lobbyRoomCount').textContent === '2명']);
  results.push(['인원이 많은 방도 인원수만 표시되고 막히지 않음(무제한)', !!roomManyLi && roomManyLi.querySelector('.lobbyRoomCount').textContent === '37명']);

  // --- 배경을 눌러 닫아도 지금 있는 방(모두의 방)에서 나가지지 않음 ---
  onlineBackdrop.click();
  await new Promise(r => setTimeout(r, 20));
  results.push(['배경 클릭으로 모달만 닫힘', onlineOverlay.classList.contains('hidden')]);
  results.push(['배경 클릭 후에도 여전히 모두의 방', currentRoomId === DEFAULT_ROOM_ID]);

  // --- 인원이 많은 방도 정상적으로 입장 가능(인원수 제한 없음) ---
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  const roomManyLi2 = [...lobbyRoomListEl.querySelectorAll('li')].find(li => li.querySelector('.lobbyRoomTitle').textContent === '인원많은방');
  roomManyLi2.click();
  await new Promise(r => setTimeout(r, 80));
  results.push(['인원이 많은 방도 클릭하면 그대로 입장됨', currentRoomId === 'roomMany']);
  results.push(['입장하면 모달이 닫힘', onlineOverlay.classList.contains('hidden')]);
  results.push(['모두의 방에서 나가면서 내 프레즌스는 지워짐', !window.__STORE.roomPresence[DEFAULT_ROOM_ID].M0]);

  // --- roomA로 다시 이동 ---
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  const roomALi2 = [...lobbyRoomListEl.querySelectorAll('li')].find(li => li.querySelector('.lobbyRoomTitle').textContent === '초보만 오세요');
  roomALi2.click();
  await new Promise(r => setTimeout(r, 80));
  results.push(['roomA 클릭 시 그 방으로 입장(currentRoomId)', currentRoomId === 'roomA']);
  results.push(['입장하면 내 프레즌스가 그 방에 올라감', !!window.__STORE.roomPresence.roomA.M0]);

  // --- 모두의 방이 아닌 방에 있을 땐 "나가기" 버튼이 보임 ---
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  results.push(['모두의 방이 아니면 "나가기" 버튼이 보임', !leaveRoomBtnEl.classList.contains('hidden')]);

  // 방 목록에서 지금 있는 방(roomA)을 다시 누르면 그냥 모달만 닫힘(구경만 하다 복귀)
  const roomAAgain = [...lobbyRoomListEl.querySelectorAll('li')].find(li => li.querySelector('.lobbyRoomTitle').textContent === '초보만 오세요');
  roomAAgain.click();
  await new Promise(r => setTimeout(r, 30));
  results.push(['같은 방을 또 누르면 그냥 복귀(모달 닫힘, 여전히 roomA)', onlineOverlay.classList.contains('hidden') && currentRoomId === 'roomA']);

  // --- 새 방 만들기(회원이므로 가능) ---
  userCountTagEl.click();
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

  // --- "나가기" — 이제 로비(방 없는 상태)가 아니라 모두의 방으로 돌아감 ---
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  leaveRoomBtnEl.click();
  await new Promise(r => setTimeout(r, 60));
  results.push(['"나가기" 클릭 시 모두의 방으로 돌아감(로비 아님)', currentRoomId === DEFAULT_ROOM_ID]);
  results.push(['"나가기" 클릭 시 새 방의 내 프레즌스는 지워짐', !window.__STORE.roomPresence[newRoomId].M0]);
  results.push(['"나가기" 클릭 시 모두의 방에 내 프레즌스가 다시 올라감', !!window.__STORE.roomPresence[DEFAULT_ROOM_ID].M0]);

  // --- 비회원이면 방을 못 만듦(버튼 비활성화) + 5초컷 회원가입 CTA가 보임 ---
  isMemberMode = false;
  userCountTagEl.click();
  await new Promise(r => setTimeout(r, 20));
  results.push(['비회원이면 "새 방 만들기" 버튼이 비활성화됨', lobbyCreateBtnEl.disabled === true]);
  results.push(['비회원 안내(5초컷 회원가입 CTA)가 보임', !lobbyGuestNoticeEl.classList.contains('hidden')]);
  results.push(['CTA 링크 문구가 "5초컷 회원가입"', document.getElementById('lobbyGuestSignupLink').textContent === '5초컷 회원가입']);
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
