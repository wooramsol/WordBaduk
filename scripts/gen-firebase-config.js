// Firebase 웹앱 설정(firebase-config.js) 생성
// - 웹앱이 없으면 만들고, sdkconfig를 받아 public/firebase-config.js로 저장
// CI(GitHub Actions)에서 GOOGLE_APPLICATION_CREDENTIALS와 함께 실행됨
const { execSync } = require('child_process');
const fs = require('fs');

const PROJECT = process.env.FIREBASE_PROJECT || 'wordbaduk';

function fbOnce(cmd) {
  return execSync(`firebase ${cmd} --project ${PROJECT} --json`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// firebase CLI가 내부적으로 Google API를 호출하는데(apps:sdkconfig 등), 코드 문제가 전혀
// 없어도 그쪽 일시적인 오류(네트워크 hiccup, 순간적인 rate limit 등)로 "Failed to get WEB
// app configuration" 같은 애매한 에러를 던지며 CI가 실패하는 경우가 있음(2026-07-23 실제
// 발생 확인). 재시도로 대부분의 일시적 실패는 넘어갈 수 있으므로, 몇 번 더 시도해보고
// 그래도 안 되면 그때 진짜 에러로 취급함
function fb(cmd, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return fbOnce(cmd);
    } catch (e) {
      lastErr = e;
      console.log(`firebase ${cmd} 실패(시도 ${i}/${attempts}):`, e.message.slice(0, 300));
      if (i < attempts) {
        const waitMs = 3000 * i;
        console.log(`${waitMs}ms 후 재시도…`);
        execSync(`sleep ${waitMs / 1000}`);
      }
    }
  }
  throw lastErr;
}

function parse(out) {
  // firebase --json 출력에서 JSON 부분만 추출
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start));
}

// 1) 웹앱 찾기 (없으면 생성)
let appId = null;
try {
  const j = parse(fb('apps:list WEB'));
  const apps = j.result || [];
  if (apps.length) appId = apps[0].appId;
} catch (e) {
  console.log('apps:list 실패(무시):', e.message.slice(0, 200));
}
if (!appId) {
  console.log('웹앱이 없어 새로 생성합니다…');
  const j = parse(fb('apps:create WEB WordBaduk'));
  appId = j.result?.appId || j.result?.app?.appId;
}
if (!appId) throw new Error('웹앱 ID를 얻지 못했습니다.');
console.log('웹앱:', appId);

// 2) SDK 설정 받기
const j = parse(fb(`apps:sdkconfig WEB ${appId}`));
const cfg = j.result?.sdkConfig || j.result;
if (!cfg || !cfg.apiKey) {
  throw new Error('sdkconfig 파싱 실패: ' + JSON.stringify(j).slice(0, 300));
}
if (!cfg.databaseURL) {
  throw new Error(
    'databaseURL이 없습니다. Firebase 콘솔 → Realtime Database → "데이터베이스 만들기"를 먼저 실행하세요.'
  );
}

// 3) 파일 생성
fs.writeFileSync(
  'public/firebase-config.js',
  'window.FIREBASE_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n'
);
console.log('public/firebase-config.js 생성 완료:', cfg.projectId, cfg.databaseURL);
