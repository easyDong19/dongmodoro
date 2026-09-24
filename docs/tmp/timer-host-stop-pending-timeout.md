# timer-host `stop()` 이 만료 타이머를 남긴다 (버그)

## 무엇을

`startTimerHost()` 가 돌려주는 `stop()` 이 엔진의 대기 중 만료 `setTimeout` 까지 취소하게 한다.

## 왜

- `stop()` 은 `powerMonitor` resume 리스너와 `browser-window-focus` 리스너만 뗀다
  (`src/main/services/timer-host.ts`). 엔진이 걸어 둔 만료 타이머는 그대로 남는다.
- 집중 세션이 도는 중에 호스트를 멈추고 DB 를 닫으면, 그 만료가 나중에 발동해 닫힌 DB 에
  기록을 시도할 수 있다. main 의 예외는 Electron 이 에러 박스로 띄우므로 앱이 멈출 수 있다.

## 왜 아직 안 고쳤나

E2E 하네스 작업 중 발견되어 "별도 작업"으로 넘겨졌다. 지금은 우회돼 있다.

- 초기화 경로 — `engine.reset()` 이 만료를 지운다 (`src/main/index.ts` 의 `confirmAndResetAllData`
  위 주석이 이 함정을 설명한다)
- 종료 경로 — 프로세스가 곧 끝나서 실제 피해는 확인되지 않았다

## 열린 질문

- `stop()` 이 `engine.reset()` 을 부를지, 엔진에 만료만 지우는 별도 메서드를 둘지.
  `reset()` 은 idle 복귀 때 baseline 을 읽으므로 DB 가 열려 있어야 한다는 제약이 있다.
