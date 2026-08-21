package com.wooramsol.wordbaduk;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

// v1.9.220: 안드로이드 15+(targetSdk 36)부터는 edge-to-edge가 기본 강제 적용돼서,
// AndroidManifest의 windowSoftInputMode="adjustResize"가 예전처럼 소프트 키보드가 뜰 때
// WebView 화면 자체를 줄여주지 않고, 키보드가 그냥 콘텐츠 위에 겹쳐 그려지기만 함. 그 결과
// 웹 코드(public/index.html)의 visualViewport 기반 "타이핑 중인 칸을 키보드 위로 재배치"
// 로직이 실제 키보드 높이를 제대로 못 읽어서 격자 하단 줄이 키보드와 겹치는 버그가 생김
// (iOS는 Capacitor의 contentInset:"always" 설정이 이걸 대신 처리해줘서 안 겪음).
// setDecorFitsSystemWindows(window, true)로 이 창에서만 edge-to-edge를 명시적으로 끄면,
// 예전처럼 시스템이 다시 인셋(키보드 포함)을 계산해 WebView 자체를 줄여주는 방식으로 돌아감.
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
