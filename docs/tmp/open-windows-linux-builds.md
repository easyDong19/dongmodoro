# Windows·Linux 배포 열기

## 무엇을

Windows·Linux 를 실제 배포 대상으로 연다.

- electron-builder `win` · `linux` 타깃 추가 (지금은 `mac` 만)
- 실기 검증 — [app-shell PRD](../features/app-shell/prd.md) A17(타이틀바 요소와 창 컨트롤이 겹치지 않는지)
- CI OS 매트릭스 (지금 `ci.yml` 은 ubuntu 에서 테스트만 돈다)
- (조건부) CI 의 macOS 빌드 잡 — 빌드가 자주 깨지면

## 왜 아직 안 만들었나

개발 환경이 macOS 하나라서 "켜 보지 못한 산출물을 릴리스에 올리지 않는다"는 이유로 미뤘다
(패키징·테마·E2E 계획서 공통). 해당 OS 에 접근할 수 있을 때까지 대기한다.

## 함께 훑을 것

- [session-signals-on-windows-linux.md](session-signals-on-windows-linux.md) — 주의 신호의 `flashFrame` 대응물
- [릴리스 노트 2.1.0](../release-notes/2.1.0.md) — 초기화 메뉴가 macOS 메뉴 막대에서만 닿는 문제
- app-shell R1·R4, [ADR-004](../architecture/decisions/adr-004-packaging-deploy.md),
  [decision-log 2026-08-11](../decision-log/2026-08-11-theme-session.md) Q7·미결 표
