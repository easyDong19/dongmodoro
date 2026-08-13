# pomo-baseline — 뽀모 길이

## 기능 목적

"뽀모 1개가 몇 분인가"를 정의하고, 그 값을 바꿀 때 **화면에서 본 값이 곧 다음 세션의
값이 되게** 한다. 길이는 다음 세션이 얼마나 돌지만 정하며, 과거 기록의 의미는 길이에
매이지 않는다 — 기록은 세션이 남긴 사실(`duration_sec`)로 읽는다.

이 기능은 진행 표시의 분모를 갖지 않는다. 1.x 에서 함께 소유했던 주간 예산·요일별
가용량·주 스냅샷은 [ADR-030](../../architecture/decisions/adr-030-time-as-progress-currency.md)
으로 폐기됐다 (무엇이 죽었는지는 PRD 의 폐기 표에 있다).

## 현재 상태

- In Review — 길이 편집 폼과 저장 즉시 효력이 구현됐다. 편집 경로 2개 중 **정산
  진입점만 열려 있고**, 첫 실행 온보딩(PRD R11 의 (a))은 app-shell 이 그 화면을 만들어야
  살아난다.

## 문서 안내

- [PRD](./prd.md): 제품 요구사항과 인수 기준 — 뽀모의 정의, 길이의 하한·기본값, 저장
  즉시 효력과 다음 세션 적용, 1.x 요구사항의 폐기 표

## 관련 횡단 문서

- [ADR-029](../../architecture/decisions/adr-029-baseline-immediate-effect.md): 길이 편집의 즉시 효력 — 주 스냅샷과 효력 지연을 폐기하고, 적용 시점을 다음 세션 시작으로 확정
- [ADR-030](../../architecture/decisions/adr-030-time-as-progress-currency.md): 진행 표시의 통화를 측정 시간으로 교체 — 예산·가용량·`weeks` 테이블이 이 기능에서 빠진 근거
- [ADR-009](../../architecture/decisions/adr-009-time-format-convention.md): 길이 값의 단위 규약 (설정 길이는 분 `_min`, 측정 경과는 초 `duration_sec`)
- [ADR-011](../../architecture/decisions/adr-011-schema-final.md) §6: 길이 하한의 두 번째 거부 지점 (SQLite CHECK)
- [ADR-018](../../architecture/decisions/adr-018-first-run-state.md) §4: `settings` 시딩 목록 — 길이 3종의 기본값이 여기서 온다
- [ADR-019](../../architecture/decisions/adr-019-constraint-implementation.md) §3·§6: 길이 3종 `>= 1` CHECK, `settings.value` JSON 유효성
- [결정 원장 2026-08-12](../../decision-log/2026-08-12-time-currency-session.md) §A: 효력 지연 폐지에 이른 과정
