# public/index.html 회귀 테스트

`public/index.html`을 실제로 배포하기 전에, jsdom(가짜 브라우저)으로 주요 동작을 자동으로
검증하는 스크립트들. 처음 한 번만 의존성을 설치하면 그 뒤로는 계속 재사용 가능.

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
node verify_ghost_mode.js       # 관리자 전용 고스트 모드(자기 자신 오탐지 방지 포함)
node verify_room_system.js      # 방(room) 목록/입장/생성/나가기(인원수 제한 없음)
```

## v1.9.211 방(room) 시스템 관련 노트

전역 `board`/`presence` 하나였던 구조가 `roomBoards/{roomId}`, `roomPresence/{roomId}`로
바뀌었다. 로그인 직후엔 어느 방에도 안 들어간 상태(로비)이므로, board/presence 관련 동작을
테스트하려면 테스트 스니펫 안에서 반드시 먼저 `enterRoom('테스트방ID')`를 호출해야 한다
(위 네 테스트 파일 모두 이 패턴을 따름). 빈 방이 서버(Cloud Function,
`functions/index.js`의 `onRoomPresenceWrite`)에서 자동으로 삭제되는지는 Firebase 에뮬레이터가
필요해 이 jsdom 테스트로는 검증하지 못함 — 배포 후 수동으로 확인할 것.

## v1.9.212 기본방(상시 열린 방) 관련 노트

비회원도 언제든 들어와 플레이할 수 있도록 `DEFAULT_ROOM_ID('default')` 방은 인원이 0명이
돼도 절대 삭제되지 않는다(대신 보드만 비워짐). `verify_room_system.js`는 로비의 `roomMeta`에
기본방이 없으면 클라이언트가 자동으로 채워 넣는 부분(self-heal)까지 검증하지만, "인원 0명이어도
안 지워진다"는 서버(Cloud Function) 쪽 로직은 위와 같은 이유로 이 jsdom 테스트로는 검증하지
못함 — 배포 후 수동으로 확인할 것.

## v1.9.213 로그인 직후 자동 입장 + 인원수 제한 해제 관련 노트

로그인/비회원 진입 직후 뜨던 로비 화면이 없어지고, 이제 곧장 `DEFAULT_ROOM_ID`("모두의 방")에
자동으로 입장한다. 방 목록은 게임 중 "n명 접속 중" 모달의 "방 목록" 버튼으로 여는, 다른
모달들과 같은 스타일(딤 배경+카드)의 팝업으로 바뀌었다 — 배경을 눌러 닫아도 지금 있는 방에서는
안 나가진다. 방 인원수 제한(5명 캡)도 전부 없앴다(`database.rules.json`의 `roomPresence`
validate 및 클라이언트의 "꽉 찬 방" 로직 모두 제거). "나가기" 버튼은 지금 있는 방이 모두의
방이 아닐 때만 보이고, 누르면 모두의 방으로 돌아간다(예전처럼 "방 없는 로비 상태"로 돌아가지
않음).

## v1.9.214 방 목록을 "n명 접속 중" 모달에 인라인으로 병합

"방 목록" 버튼을 눌러야 따로 열리던 모달을 없애고, "n명 접속 중" 모달(#onlineCard) 안에
곧장 이어지는 섹션으로 합쳤다 — 그 모달을 열기만 하면 클릭 한 번 더 없이 방 목록이 바로
보인다. `showLobby()`/`hideLobby()`/`browseRoomsBtnEl`은 없어지고, 모달을 열고 닫는 건
전부 `closeOnlineOverlay()`(방 선택/생성 후)와 `resetLobbySection()`(모달을 열 때마다 방
만들기 폼/비회원 안내를 초기 상태로 되돌림)으로 처리한다.

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
