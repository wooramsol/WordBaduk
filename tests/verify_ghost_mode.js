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
  // v1.9.211: 방(room) 시스템 — 전역 presence/board 대신 roomPresence/{roomId},
  // roomBoards/{roomId}. 이 테스트는 항상 enterRoom('testRoom')으로 이 방에 들어감.
  roomMeta: { testRoom: { title: '테스트방', createdBy: 'M0', createdByName: '람솔', createdAt: 1, playerCount: 0 } },
  roomPresence: { testRoom: {} },
  roomBoards: { testRoom: { cells: {}, words: [], version: 2 } },
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

  // v1.9.211: 방 시스템 — 로비에서 testRoom으로 입장해야 프레즌스/보드 구독이 시작됨
  enterRoom('testRoom');
  await new Promise(r => setTimeout(r, 60));
  results.push(['[꺼진 상태] 정상적으로 presence/M0가 올라감', !!window.__STORE.roomPresence.testRoom.M0]);
  results.push(['[꺼진 상태] "n명 접속 중" 문구에 고스트 표시 없음', !userCountTextEl.textContent.includes('고스트')]);
  results.push(['[꺼진 상태+혼자] botIsAlone() true(평소와 동일, 연습봇 작동)', botIsAlone() === true]);

  // --- 고스트 모드 켜기 ---
  ghostModeCheckboxEl.checked = true;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  results.push(['[켠 직후] presence/M0가 사라짐(다른 사람 눈엔 접속자 수/목록/봇 판정에서 안 잡힘)',
    !window.__STORE.roomPresence.testRoom.M0]);
  results.push(['[켠 직후] localStorage에 저장됨', window.localStorage.getItem('wb-ghostMode') === '1']);
  results.push(['[켠 직후] "n명 접속 중" 문구에 고스트 표시가 붙음(나에게만 보이는 로컬 표시)',
    userCountTextEl.textContent.includes('고스트')]);
  // v1.9.209: 고스트 모드 중 진짜로 혼자면(다른 실제 접속자 없음) 연습봇도 꺼짐 — 아무도
  // 안 보는데 봇 혼자 작동할 이유가 없으므로.
  results.push(['[고스트+진짜 혼자] botIsAlone() false(연습봇 꺼짐)', botIsAlone() === false]);

  // --- 고스트 모드 끄기(다시 정상 접속자로) ---
  ghostModeCheckboxEl.checked = false;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  results.push(['[다시 끈 뒤] presence/M0가 다시 올라감', !!window.__STORE.roomPresence.testRoom.M0]);
  results.push(['[다시 끈 뒤] localStorage도 갱신됨', window.localStorage.getItem('wb-ghostMode') === '0']);
  results.push(['[다시 끈 뒤] "n명 접속 중" 문구에서 고스트 표시가 없어짐',
    !userCountTextEl.textContent.includes('고스트')]);
  results.push(['[다시 끈 뒤+혼자] botIsAlone() true로 복귀(연습봇 다시 작동)', botIsAlone() === true]);

  // v1.9.208: 고스트 모드 중 실제로 1명만 들어와도 "게임시작"(멀티스타트) 확인 팝업이
  // 잘못 뜨던 버그 — self-inclusion 때문에 관리자 화면에서만 userCount가 2로 잡히는 게
  // 원인이었음. onlineIds/botIsAlone() 판정 자체는 안 건드리고 checkMultiStartTrigger()
  // 안에서만 고스트일 때 -1 보정했는지 확인.
  ghostModeCheckboxEl.checked = true;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  await window.firebase.database().ref('roomPresence/testRoom/P1').set({ ts: Date.now() });
  await new Promise(r => setTimeout(r, 60));
  checkMultiStartTrigger();
  results.push(['[고스트+실제 1명] onlineIds엔 여전히 나 자신도 포함(봇 이중구동 방지, 안 건드림)',
    onlineIds.has('M0') && onlineIds.has('P1') && onlineIds.size === 2]);
  results.push(['[고스트+실제 1명] "게임시작" 확인 팝업이 뜨지 않음(진짜 참가자는 1명뿐)',
    gameOverOverlay.classList.contains('hidden')]);

  await window.firebase.database().ref('roomPresence/testRoom/P2').set({ ts: Date.now() });
  await new Promise(r => setTimeout(r, 60));
  checkMultiStartTrigger();
  results.push(['[고스트+실제 2명] 이땐 진짜로 "게임시작" 확인 팝업이 뜸(정상 동작 유지)',
    !gameOverOverlay.classList.contains('hidden') && inMultiStartPrompt === true]);

  // v1.9.210: 위 상태(진짜로 "게임시작" 확인 화면이 떠 있는 상태)에서, 고스트 관리자가
  // 실수로 버튼/Enter를 눌러도(triggerRestart() 직접 호출로 재현) 원래 참가자들이 스스로
  // 눌러야 할 그 확인을 대신 확정지어 보드를 리셋시켜버리면 안 됨 — 조용히 막혀야 함.
  const boardVersionBeforeGhostRestart = window.__STORE.roomBoards.testRoom.version;
  triggerRestart();
  await new Promise(r => setTimeout(r, 30));
  results.push(['[고스트+게임시작 확인중] triggerRestart()가 막혀서 보드가 안 바뀜',
    window.__STORE.roomBoards.testRoom.version === boardVersionBeforeGhostRestart]);
  results.push(['[고스트+게임시작 확인중] 화면도 그대로(내가 대신 확정 못 지음)',
    !gameOverOverlay.classList.contains('hidden') && inMultiStartPrompt === true]);

  // v1.9.208: 고스트 모드 중엔 관리자 자신이 이 판에서 따놓은 칸이 있어도, 관리자 자신의
  // 화면 리더보드에서는 본인 줄이 빠져야 함(다른 사람/봇의 진짜 순위를 그대로 보기 위함).
  await window.firebase.database().ref('roomBoards/testRoom').set({ version: 1, words: [], cells: { '0,0': { ch: '가', captured: true, owner: 'M0' } } });
  await new Promise(r => setTimeout(r, 60));
  updateLeaderboard();
  results.push(['[고스트+본인 소유 칸 있음] 리더보드에 내 줄(M0)이 안 보임',
    !lbListEl.querySelector('li[data-owner="M0"]')]);

  // 고스트를 끄면 다시 원래대로(본인 점수도 리더보드에 정상 표시)
  ghostModeCheckboxEl.checked = false;
  ghostModeCheckboxEl.dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  updateLeaderboard();
  results.push(['[고스트 끈 뒤] 리더보드에 내 줄(M0)이 다시 보임',
    !!lbListEl.querySelector('li[data-owner="M0"]')]);

  // v1.9.210: 고스트가 꺼진 정상 상태에서는 triggerRestart()가 막히지 않고 평소처럼
  // 보드를 리셋해야 함(위에서 고스트 중일 때만 막았던 것과 대비되는 회귀 확인).
  triggerRestart();
  await new Promise(r => setTimeout(r, 30));
  results.push(['[고스트 꺼짐] triggerRestart()는 평소처럼 정상 동작(보드가 새로 리셋됨)',
    window.__STORE.roomBoards.testRoom.version === 0]);

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
