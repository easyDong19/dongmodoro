# 코어 루프 E2E 백필

## 무엇을

E2E 로 코어 루프를 채운다 — 타이머 시작과 세션 기록, 드로어에서 오늘로 가져오기, 정산 확정.
선택으로 패키징된(asar) 산출물을 띄우는 E2E 도 넣는다.

## 왜

- 지금 `e2e/` 에는 smoke · theme · quit · reset · signals · card-overflow 만 있다. 앱의 핵심
  흐름은 유닛 테스트로만 지켜진다.
- 산출물은 `out/` 만 띄운다. 패키징본은 install-release 스킬로 사람이 확인한다.

## 왜 아직 안 만들었나

E2E 하네스 작업(PR #42) 때 "하네스 도입과 테스트 백필은 다른 작업"이라며 하네스가 안정된 뒤로
미뤘다. 하네스는 CI 에서 안정적으로 돌고 있으므로 막는 조건은 풀렸다.

## 참고

- [decision-log 2026-08-11](../decision-log/2026-08-11-theme-session.md) 미결 "코어 루프 E2E 백필"
- `e2e/fixtures/app.ts`
