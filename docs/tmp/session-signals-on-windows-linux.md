# Windows·Linux 의 세션 종료 주의 신호

## 무엇을

세션이 끝났을 때 앱이 포커스가 아니면 주의를 끄는 신호를 보내는 동작
([ux-spec §6.2](../features/timer/ux-spec.md))을 Windows·Linux 에서도 구현한다.

## 왜

- 2.2.0 에서 들어간 것은 **macOS 뿐이다.** `app.dock` 이 macOS 에만 있어서
  (Electron 타입도 `Dock | undefined`), 다른 플랫폼에서는 신호가 시작되지 않고
  OS 알림만 남는다.
- 대응물은 `BrowserWindow.flashFrame(true)` — 작업표시줄 아이콘을 깜빡인다.
  `flashFrame(false)` 로 끄는 구조가 `cancelBounce` 와 같으므로 지금 코드의
  포커스 취소 배선을 그대로 공유할 수 있다.

## 왜 2.2.0 에 넣지 않았나

**[electron-builder.yml](../../electron-builder.yml) 에 `mac` 타깃만 있다.** `win` · `linux`
블록이 없어서 그 플랫폼 산출물이 만들어지지 않고, 지금 넣으면 아무도 실행할 수 없는
분기가 영구히 남는다 — 검증도 회귀 감지도 불가능한 코드다. 나중에 그 플랫폼을 열 때
어차피 처음부터 확인해야 하므로, 그 작업 안에서 함께 다루는 것이 맞다고 판단했다.

## 함께 봐야 하는 것 (플랫폼을 열 때)

- 이 신호만의 문제가 아니다. [릴리스 노트 2.1.0](../release-notes/2.1.0.md) 이
  `초기화는 macOS 메뉴 막대에서만 닿습니다` 라고 적어 둔 것처럼, 앱 메뉴가 그쪽에서
  화면에 나타나지 않는 문제가 이미 있다. 플랫폼을 여는 작업은 이 목록을 한 번에 훑어야 한다.
- 구현 자리는 [session-signals.ts](../../src/main/services/session-signals.ts) 가 아니라
  **[timer-host.ts](../../src/main/services/timer-host.ts) 의 포트 배선**이다. 규칙 쪽은
  그것이 Dock 인지 작업표시줄인지 모르게 짜여 있으므로 플랫폼 분기만 추가하면 된다.

## 열린 질문

- `flashFrame` 은 취소 id 가 없다(불리언 토글). 포트 시그니처(`bounce` 가 id 를 돌려주고
  `cancelBounce` 가 그 id 를 받는 형태)를 그대로 쓸지, 플랫폼별로 갈라진 포트를 둘지.
- Linux 데스크톱 환경마다 깜빡임 지원이 다르다. 지원하지 않는 환경에서 조용히 아무 일도
  일어나지 않는 것을 받아들일지.
