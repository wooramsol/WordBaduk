#!/usr/bin/env node
// public/index.html의 FONT_CATALOG를 읽어서, database.rules.json의 memberFonts 검증
// 규칙이 조회하는 RTDB 노드(/fontShopScores)용 JSON을 생성한다.
//
// 왜 이게 필요한가(v1.9.202): 예전에는 새 폰트를 추가할 때마다 database.rules.json의
// memberFonts .validate 문자열에 `(newData.val() === '아이디' && ... >= 점수)` 조건을
// 손으로 하나씩 추가해야 했다. 폰트 개수가 늘수록 이 문자열이 점점 길어지고, FONT_CATALOG
// (JS)와 완전히 따로 손으로 동기화해야 해서 실수하기 쉬웠다(오타, 문턱값 불일치, 깜빡하고
// 안 넣는 실수 등). 지금은 database.rules.json이 /fontShopScores 노드를 조회해서 검증하고,
// 그 노드의 실제 값은 FONT_CATALOG에서 이 스크립트로 자동 생성한다 — 새 폰트를 추가해도
// database.rules.json 자체는 다시는 손댈 필요가 없다.
//
// 사용법(FONT_CATALOG에 새 폰트를 추가한 뒤):
//   1) node scripts/sync-font-shop-scores.js
//   2) 화면에 안내되는 firebase database:update 명령을 그대로 실행(파이어베이스
//      로그인이 되어 있어야 함) — 이 명령이 끝나야 새 폰트를 "장착" 시도했을 때
//      서버 검증(database.rules.json)을 통과할 수 있다.
//   3) (database.rules.json 자체를 고친 적이 있다면) firebase deploy --only database

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const m = html.match(/const FONT_CATALOG = (\[[\s\S]*?\n\]);/);
if (!m) {
  console.error('FONT_CATALOG 배열을 public/index.html에서 찾지 못했습니다. 선언 형식이 바뀌었는지 확인하세요.');
  process.exit(1);
}

let FONT_CATALOG;
try {
  FONT_CATALOG = new Function('return ' + m[1])();
} catch (e) {
  console.error('FONT_CATALOG 파싱 실패:', e.message);
  process.exit(1);
}

const scores = {};
for (const f of FONT_CATALOG) {
  if (!f || typeof f !== 'object') continue;
  if (f.id === 'default') continue; // 기본체는 항상 무료라 fontShopScores에 없어도 됨(rules.json이 'default'는 별도로 항상 허용)
  if (typeof f.requiredScore !== 'number') {
    console.error(`경고: ${f.id}의 requiredScore가 숫자가 아닙니다 — 건너뜀`);
    continue;
  }
  scores[f.id] = f.requiredScore;
}

const outPath = path.join(__dirname, 'fontShopScores.generated.json');
fs.writeFileSync(outPath, JSON.stringify(scores, null, 2) + '\n');

console.log('생성됨:', outPath);
console.log(JSON.stringify(scores, null, 2));
console.log('\n아래 명령으로 실제 RTDB에 반영하세요(firebase login 되어 있어야 함):');
console.log(`  firebase database:update /fontShopScores ${path.relative(process.cwd(), outPath)}`);
console.log('\n반영 전까지는 새로 추가한 폰트를 아무도 "장착"할 수 없습니다(서버 검증 실패) —');
console.log('반드시 새 폰트를 출시하기 전에 먼저 실행하세요.');
