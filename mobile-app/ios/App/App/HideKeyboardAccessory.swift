import WebKit

// WKWebView가 텍스트 입력 포커스 시 자동으로 붙이는 키보드 위
// "이전/다음/완료" 툴바(input accessory view)를 전역적으로 제거.
// 별도 Capacitor 플러그인 없이, WKWebView 내부에서 실제 텍스트 입력을
// 처리하는 private WKContentView 클래스의 inputAccessoryView를
// 메서드 스위즐링으로 nil 반환하도록 바꿔치기한다.
extension WKWebView {
    static let hideAccessoryBarOnce: Void = {
        guard let contentViewClass = NSClassFromString("WKContentView") else { return }

        let originalSelector = Selector(("inputAccessoryView"))
        guard let originalMethod = class_getInstanceMethod(contentViewClass, originalSelector) else { return }

        let newSelector = #selector(getter: WKWebView.wv_noInputAccessoryView)
        guard let newMethod = class_getInstanceMethod(WKWebView.self, newSelector) else { return }

        method_exchangeImplementations(originalMethod, newMethod)
    }()

    @objc var wv_noInputAccessoryView: UIView? { return nil }

    func hideKeyboardAccessoryBar() {
        _ = WKWebView.hideAccessoryBarOnce
    }
}
