# 폰트 상점 테스트

`public/index.html`을 실제로 배포하기 전에, jsdom(가짜 브라우저)으로 폰트 상점 관련 동작을
자동으로 검증하는 스크립트 3개. 처음 한 번만 의존성을 설치하면 그 뒤로는 계속 재사용 가능.

## 처음 한 번

```
cd tests
npm install
```

## 실행

```
cd tests
npm test
```

또는 개별 실행:

```
node verify_font_shop_css.js    # @font-face 규칙이 CSS로 제대로 파싱되는지(가장 중요 — 아래 참고)
node verify_font_shop_ui.js     # 상점 모달 UI(해금/잠금/장착/해제)
node verify_font_shop_draw.js   # 보드에 실제로 그 폰트로 그려지는지
```

## `verify_font_shop_css.js`가 왜 제일 중요한가

v1.9.198~201에서 `<style>` 블록 안 주석 문법 실수(HTML 주석, 혹은 CSS 주석 안에 CSS 주석
문법 자체를 다시 언급하는 실수) 때문에 `@font-face` 규칙 하나가 파싱 과정에서 통째로
버려지는 버그를 두 번 겪었다. 코드를 눈으로 봐서는 전혀 티가 안 나고, 폰트 파일도 멀쩡하고,
`new Function()` 문법 체크도 통과한다 — 오직 실제 CSS 파서로 파싱해봐야만 드러난다.
`verify_font_shop_css.js`가 그 역할을 자동으로 대신한다. **새 폰트를 추가할 때마다 반드시
돌릴 것.**

## 새 폰트를 추가할 때 전체 절차

`public/index.html`의 `FONT_CATALOG` 선언 바로 위 주석에 전체 절차가 적혀 있다. 요약하면:

1. 폰트 파일을 `public/fonts/`에 추가 + `public/fonts/LICENSE.txt`에 출처 기록
2. `public/index.html`의 `@font-face` 목록에 한 줄 추가(주석은 반드시 CSS 주석만 사용)
3. `FONT_CATALOG` 배열에 항목 추가
4. `node ../scripts/sync-font-shop-scores.js` 실행 후, 안내되는
   `firebase database:update` 명령 실행 (건너뛰면 아무도 새 폰트를 장착할 수 없음)
5. `npm test`로 전체 통과 확인
