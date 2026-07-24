# iOS 푸시 알림(다른 플레이어 접속 알림) 설정 안내

앱을 백그라운드에 두거나 완전히 꺼둔 상태에서도, 다른 사람이 낱말바둑에 접속하면
"새로운 플레이어가 접속했어요! 함께 낱말바둑 해요 🍎" 푸시 알림이 오게 하려는 기능입니다.

**코드(서버/클라이언트 로직 + Swift Package 연결)는 이미 다 준비돼 있습니다.** 지금
안 뜨는 이유는 아래 단계 중 몇 가지가 Firebase 콘솔/Apple Developer 포털/Xcode에서
직접 클릭해서 진행해야 하는, 코드 편집만으로는 대신할 수 없는 부분이라 그렇습니다
(로그인/서명이 필요해서 사람이 직접 해야 함).

## 이미 완료된 것

- [x] 서버: `functions/index.js`의 `notifyOnJoin` — presence 노드가 새로 생기면
      저장된 모든 기기 토큰으로 푸시 발송
- [x] 클라이언트: `public/index.html`의 `setupPushNotifications()` — 네이티브 앱에서
      권한 요청 → FCM 토큰 발급 → `pushTokens/{clientId}`에 저장
- [x] `mobile-app/ios/App/App/Info.plist`에 `UIBackgroundModes: remote-notification` 추가
- [x] `npx cap sync ios`로 `CapApp-SPM/Package.swift`에 Firebase Messaging Swift
      Package 의존성 연결 완료

## 직접 해야 하는 나머지 단계

### 1. Firebase 콘솔에서 iOS 앱 등록 + 설정 파일 받기
1. https://console.firebase.google.com 에서 이 프로젝트(WordBaduk이 쓰는 Firebase
   프로젝트) 열기
2. 프로젝트 설정(톱니바퀴) → "내 앱" → iOS 앱이 아직 없으면 추가
   - 번들 ID는 `mobile-app/capacitor.config.json`의 `appId`와 반드시 똑같이:
     `com.wooramsol.wordbaduk`
3. `GoogleService-Info.plist` 다운로드
4. 이 파일을 `mobile-app/ios/App/App/`(Info.plist와 같은 폴더)에 넣기
5. **Xcode에서 직접 드래그해서 추가해야 함**(Finder로 폴더에 복사만 하면 빌드에
   안 잡힘) — Xcode 왼쪽 네비게이터의 `App` 폴더 위에 드래그 앤 드롭 →
   "Copy items if needed" 체크, Target이 `App`으로 체크돼 있는지 확인 후 Finish

### 2. Xcode에서 Push Notifications / Background Modes capability 켜기
1. `mobile-app/ios/App/App.xcworkspace` 열기 (있으면 `.xcworkspace`를 열 것,
   `.xcodeproj` 아님)
2. 왼쪽에서 `App` 프로젝트 → TARGETS의 `App` 선택 → 상단 탭 "Signing & Capabilities"
3. "Automatically manage signing" 체크(팀 계정 로그인돼 있어야 함)
4. "+ Capability" 버튼 → **Push Notifications** 추가
5. "+ Capability" 버튼 → **Background Modes** 추가 → "Remote notifications" 체크
   (Info.plist에 이미 넣어뒀지만, 이 capability를 켜야 entitlements 파일이 실제로
   생성되고 서명에 반영됨)
6. Xcode가 자동으로 provisioning profile을 다시 만들면서 Apple Developer 포털의
   App ID에도 Push Notifications가 켜짐(수동으로 포털에서 따로 켤 필요 없음, Xcode가
   대신 해줌)

### 3. APNs 인증 키 만들어서 Firebase에 연결
1. https://developer.apple.com/account → Certificates, Identifiers & Profiles → Keys
2. "+" 눌러서 새 키 생성, "Apple Push Notifications service (APNs)" 체크 후 등록
3. `.p8` 키 파일 다운로드(**딱 한 번만 다운로드 가능**하니 잘 보관), Key ID 메모
4. Firebase 콘솔 → 프로젝트 설정 → "클라우드 메시징" 탭 → "Apple 앱 구성" →
   APNs 인증 키 업로드(`.p8` 파일 + Key ID + Team ID 입력)

### 4. 빌드 + 실제 기기 테스트
- 푸시는 iOS 시뮬레이터에서는 정상적으로 안 옴 — **실제 아이폰**에 설치해서 테스트
- 앱 처음 실행 시 알림 권한 팝업이 뜨는지 확인(안 뜨면 위 단계 중 뭔가 빠진 것)
- Firebase 콘솔 → Realtime Database → `pushTokens/` 아래에 내 기기 토큰이
  저장됐는지 확인(저장 안 되면 클라이언트 등록이 실패한 것)
- 다른 기기(또는 웹)로 접속해서 presence가 생기면, 알림 권한을 준 기기로 푸시가
  오는지 최종 확인

## 참고
- 이 README는 위 4단계를 사람이 직접 콘솔/Xcode에서 진행해야 한다는 걸 기록해두기
  위한 것으로, 코드가 아니라 그냥 체크리스트입니다. 다 끝나면 지워도 됩니다.
