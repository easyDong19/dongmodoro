# Sprint 행의 Milestone 배지

## 무엇을

Milestone 에 연결된 Sprint 행에 `M<n>` 배지를 표시한다. 연결이 없으면 표시하지 않는다.

## 왜

- 연결은 드로어에서 만들 수 있는데(`ItemDrawer`), 주간 카드의 Sprint 행에는 연결 여부가
  보이지 않는다. `WeekItemRow` 에 Milestone 참조가 한 곳도 없다.
- 자리는 [week-plan ux-spec](../features/week-plan/ux-spec.md) §3.1 의 "마일스톤 태그" 행이
  이미 잡아 두었다. [milestones PRD](../features/milestones/prd.md) 비범위 절도 태그 표시를
  week-plan 소유로 넘겼다. 다만 week-plan PRD 에는 이 배지의 R 번호가 없다(R6 은 연결만 다룬다).

## 왜 아직 안 만들었나

월 레이어 작업(PR #57) 때 "표시 규칙은 week-plan 소관인데 요구사항이 없다"며 연결 입력만 만들었다.

## 먼저 풀 문제

[ADR-035](../architecture/decisions/adr-035-milestone-link-any-month.md) 로 Sprint 가 **어느 달의
Milestone 에나** 연결될 수 있게 됐다. `M<n>` 은 그 달 안의 표시 순서(milestones R5)라서, 다른
달의 Milestone 이면 `M2` 만으로는 뜻이 모호하다. 달을 함께 적을지 등 표기부터 정해야 한다.

## 참고

- week-plan ux-spec §3.1 의 같은 표에 있는 `+ 오늘로` 행은 #85 이후 낡았다 — 이 작업 때 함께 정리
