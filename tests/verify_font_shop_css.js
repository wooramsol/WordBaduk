// v1.9.202: 폰트 상점 CSS 회귀 테스트.
//
// 이 테스트가 존재하는 이유: v1.9.198~201에서 <style> 블록 안 주석 문법 실수(HTML 주석,
// 그리고 CSS 주석 안에 슬래시-별표를 다시 언급하는 실수) 때문에 @font-face 규칙 하나가
// 통째로 파싱에서 버려지는 버그를 두 번이나 겪었다. 둘 다 파일 자체는 멀쩡하고 코드도
// 눈으로 보기엔 멀쩡해 보여서, 실제 브라우저에서 켜보기 전까진 아무도 못 알아챘다.
// 이 테스트는 실제 브라우저의 CSS 파서(jsdom의 cssom)로 <style> 블록을 파싱해서,
// FONT_CATALOG에 있는 폰트마다 @font-face 규칙이 실제로 살아있는지 기계적으로 검증한다.
// 새 폰트를 추가할 때마다(그리고 그 전 상태로도 계속) 이 테스트를 돌리면 이 버그 계열은
// 다시는 사람이 눈으로 못 찾고 지나가는 일이 없어야 한다.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const htmlPath = path.join(repoRoot, 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const results = [];

// --- FONT_CATALOG 파싱(scripts/sync-font-shop-scores.js와 동일한 방식) ---
const catalogMatch = html.match(/const FONT_CATALOG = (\[[\s\S]*?\n\]);/);
results.push(['FONT_CATALOG를 index.html에서 찾음', !!catalogMatch]);
const FONT_CATALOG = catalogMatch ? new Function('return ' + catalogMatch[1])() : [];

// --- <style> 블록을 실제 CSS 파서로 파싱 ---
const dom = new JSDOM(html, { pretendToBeVisual: true });
const styleEl = dom.window.document.querySelector('style');
const sheet = styleEl.sheet;
const fontFaceRules = [...sheet.cssRules].filter(r => r.type === dom.window.CSSRule.FONT_FACE_RULE);
const parsedFamilies = new Set(
  fontFaceRules.map(r => r.style.getPropertyValue('font-family').replace(/^["']|["']$/g, ''))
);

// --- FONT_CATALOG의 family가 있는 항목마다 실제로 파싱된 @font-face가 있는지 확인 ---
const catalogFamilies = FONT_CATALOG.filter(f => f.family).map(f => f.family);
results.push(['FONT_CATALOG에 family가 있는 폰트가 1개 이상 존재', catalogFamilies.length > 0]);
for (const family of catalogFamilies) {
  results.push([`@font-face '${family}' 규칙이 실제로 파싱됨(CSS 주석 실수로 버려지지 않음)`,
    parsedFamilies.has(family)]);
}

// --- 반대 방향: @font-face로 선언은 됐는데 FONT_CATALOG에서 안 쓰는 유령 규칙(오타 등)이 없는지 ---
for (const family of parsedFamilies) {
  results.push([`@font-face '${family}'가 FONT_CATALOG 어딘가에서 실제로 쓰임(유령 규칙 아님)`,
    catalogFamilies.includes(family)]);
}

// --- src url()이 가리키는 폰트 파일이 실제로 public/fonts/에 존재하는지 ---
for (const rule of fontFaceRules) {
  const src = rule.style.getPropertyValue('src') || '';
  const m = src.match(/url\(["']?([^"')]+)["']?\)/);
  if (!m) {
    results.push([`@font-face src에서 url()을 찾음`, false]);
    continue;
  }
  // src의 url()은 /fonts/xxx처럼 사이트 루트 기준 절대경로 — 이 프로젝트의 사이트 루트는
  // firebase.json의 hosting.public(= public/)이므로 그 아래에서 찾아야 함
  const fontFile = m[1].replace(/^\//, '');
  const filePath = path.join(repoRoot, 'public', fontFile);
  results.push([`폰트 파일 존재: public/${fontFile}`, fs.existsSync(filePath)]);
}

results.forEach(([label, pass]) => console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label));
const allPass = results.length > 0 && results.every(r => r[1]);
console.log('\n전체 결과:', allPass ? 'ALL PASS' : 'SOME FAIL');
process.exit(allPass ? 0 : 1);
