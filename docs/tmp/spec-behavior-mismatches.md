# 스펙과 코드의 동작 어긋남 목록

## 무엇을

2026-09-25 스펙 UI 카피 동기화 때 기능별로 스펙과 코드를 대조하면서 찾은 **문구가 아닌
동작·시각 차이** 목록이다. 항목마다 "스펙을 코드에 맞출지(코드가 맞다)" 또는 "코드를 스펙에
맞출지(스펙이 맞다)"를 정해야 한다. 정할 때까지 해당 기능은 Published 로 올리지 않는다
([상태의 뜻](../CLAUDE.md#기능-상태의-뜻)).

## 왜

카피는 코드 문자열을 정답으로 보고 맞출 수 있지만, 동작은 어느 쪽이 의도인지 판단이 필요하다.
대조 작업이 스펙 요구사항을 임의로 고치지 않도록 여기에 모았다.

## 목록

> 2026-09-25 정리: 코드가 맞은 항목은 스펙을 고쳐 닫았고(드로어 Enter 즉시 생성, 완료 Sprint 의
> 입력 비활성, 타이머의 대상 해제·휴식 중 버튼·paused 라벨, 정산 패널 머리·`닫기`·`끝낸 것들`,
> 앱 메뉴 R43), 코드 쪽 문구·aria-label·주석은 [#104](https://github.com/easyDong19/dongmodoro/pull/104)
> 가 닫는다. 남은 것은 **화면을 보고 정해야 하는 시각 차이**와 실측이 필요한 항목이다.

### 시각 차이 — 화면을 보고 어느 쪽을 맞출지 정한다

- [ ] **week-plan** 오늘 배정 항목의 **테두리 강조**가 없다. 상단 정렬만 있다
  (ux-spec §3.3, `WeekItemRow.tsx:113`)
- [ ] **milestones** 지난 달 카드의 감쇠가 제목(`<h2>`)에만 걸린다. R20 표는 `--ink-dim` 감쇠를
  요구한다 — 범위가 카드 전체인지 스펙이 모호하다 (`MilestoneCard.tsx`, `MilestoneRow.tsx`)
- [ ] **calendar-records** 그 달에 속하지 않는 앞·뒤 칸에 숫자를 그리지 않는다. R15 는
  `--ink-faint` 숫자를 요구한다 (`MonthGrid.tsx` 52·97–101행)
- [ ] **weekly-review** `보내주기` 를 고르면 제목만 흐려진다. ux-spec §5 는 행 전체 `--ink-faint`
  (`PendingSection.tsx:93`)
- [ ] **weekly-review** `ArchiveX` 아이콘이 선택 전에도 `text-danger` 다. ux-spec 은 `--danger` 를
  선택 상태로 한정한다 (`PendingSection.tsx:21`)
- [ ] **app-shell** MONTH 오버레이 표면이 `--bg-deep` 불투명 바탕 + `--glass-highlight` 다. §3.1 은
  `--glass-strong` + `--glass-border` + `--glass-shadow`

### 실측이 필요한 것

- [ ] **app-shell** OS 알림 클릭 핸들러와 Dock `activate` 핸들러가 없다 (R18·R28, `timer-host.ts:36`).
  macOS 기본 동작으로 창이 앞으로 오는지 확인한 뒤, 오지 않으면 코드를 고친다
- [ ] **app-shell** 창 닫기가 곧 종료다 — 트레이가 없는 빌드이므로 R25·A20 의 대체 규칙과는 맞다.
  트레이 도입 전까지 R3·R16·R24·A11·A14 는 적용되지 않는다 (스펙에 미구현 표기함). 트레이를
  만들 때 함께 닫힌다

## 참고

- 결정 원장: [2026-09-25 기능 상태의 뜻](../decision-log/2026-09-25-feature-status-meaning.md)
- 미구현 요소(트레이, 내로우, 오늘 목록 빈 상태 두 갈래, 기타 행 드릴다운, Sprint 배지 등)는
  스펙에 `> ⚠️ 미구현:` 으로 표시했고 각자의 tmp 메모가 있다 — 이 목록에 넣지 않았다
