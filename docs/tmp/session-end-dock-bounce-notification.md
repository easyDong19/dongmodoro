# 세션 종료 시 Dock 바운스 + 데스크톱 알림

## 무엇을

세션(focus / break)의 타이머가 다 끝났을 때:

1. Slack 처럼 **Dock 아이콘이 통통 튄다** (macOS attention 요청).
2. **데스크톱 알림**(OS 네이티브 알림)이 뜬다.

## 왜

- 앱이 백그라운드에 있으면 세션이 끝난 걸 놓친다. 소리·화면 전환만으로는 부족하고,
  다른 작업 중에도 눈에 띄는 OS 수준의 신호가 필요하다.

## 구현 아이디어 (미확정)

- Dock 바운스: Electron `app.dock.bounce('critical')` — macOS 전용.
  `'informational'` 은 1회, `'critical'` 은 앱을 포커스할 때까지 계속 튄다. 어느 쪽일지 결정 필요.
- 데스크톱 알림: Electron `new Notification({ title, body })` (main 프로세스) 또는
  렌더러의 Web Notification API. 클릭 시 앱 창 포커스.
- 앱이 이미 포커스 상태면 바운스·알림을 생략할지 여부 결정 필요.

## 열린 질문

- 알림 문구(카피)는 [CONTEXT.md](../../CONTEXT.md) 용어로 별도 확정.
- focus 종료와 break 종료를 다르게 처리할지 (예: break 종료만 critical).
