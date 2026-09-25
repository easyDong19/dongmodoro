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

### week-plan

- [ ] 드로어의 Enter·`추가` 가 task 를 **바로 생성하고 자동 체크**한다. 스펙(§6.3·R12)은 "새 입력은
  `오늘로 가져오기` 때 생성 후 pull" — `ItemDrawer.tsx` 123–131·213행
- [ ] 오늘 배정 항목의 **테두리 강조**가 없다. 상단 정렬만 있다 (ux-spec §3.3, `WeekItemRow.tsx:113`)
- [ ] 완료된 Sprint 의 드로어에서 새 task 입력칸·`추가` 까지 비활성이다. 스펙(§6.4)은 "입력은 보이되
  가져오기만 비활성" (`ItemDrawer.tsx` 196·211행)
- [ ] PRD 범위 문단이 Milestone 연결 위치를 "플래너"라고 적는다. ux-spec §5.1 과 코드는 드로어다

### today-tasks

- [ ] 직접 입력칸에 `aria-label` 이 없다 (R20-1, `TodayList.tsx` 136–142행)

### timer

- [ ] "대상이 지정된 idle" 상태와 해제 `×` 가 존재하지 않는다 — 대상 지정이 곧 세션 시작이고,
  idle 진입 때 `taskId` 를 비운다 (ux-spec §1.1, `timer-engine.ts` 249–256행)
- [ ] 휴식 중에는 `완료 처리` 버튼이 없다. ux-spec §3 ⚠️ 가정은 있다고 본다 (`TimerCard.tsx:58`)
- [ ] (경미) 세션 라벨 표에 paused 행이 없다. 코드는 running 과 같은 문구를 보여준다

### milestones

- [ ] 지난 달 카드의 감쇠가 제목(`<h2>`)에만 걸린다. R20 표는 `--ink-dim` 감쇠를 요구한다 — 범위가
  카드 전체인지 스펙이 모호하다 (`MilestoneCard.tsx`, `MilestoneRow.tsx`)
- [ ] (코드) 서비스 주석 `services/milestones.ts:9` 에 "6분기"가 남아 있다. 실제는 5분기

### calendar-records

- [ ] 그 달에 속하지 않는 앞·뒤 칸에 숫자를 그리지 않는다. R15 는 `--ink-faint` 숫자를 요구한다
  (`MonthGrid.tsx` 52·97–101행)

### weekly-review

- [ ] `보내주기` 를 고르면 제목만 흐려진다. ux-spec §5 는 행 전체 `--ink-faint` (`PendingSection.tsx:93`)
- [ ] `ArchiveX` 아이콘이 선택 전에도 `text-danger` 다. ux-spec 은 `--danger` 를 선택 상태로 한정한다
  (`PendingSection.tsx:21`)
- [ ] 스펙에 없는 UI: 패널 헤더(`WEEK` · `정산` · 날짜 범위), 확정 옆 `닫기`, `끝낸 것들 N건`
- [ ] ux-spec §8 "메뉴 등으로 직접 열린 경우"의 메뉴가 없다

### app-shell

- [ ] 창 닫기가 곧 종료다 — 트레이가 없는 빌드이므로 R25·A20 의 대체 규칙과는 맞다. 트레이 도입 전까지
  R3·R16·R24·A11·A14 는 적용되지 않는다 (미구현 표기는 스펙에 달았다)
- [ ] OS 알림 클릭 핸들러와 Dock `activate` 핸들러가 없다 (R18·R28, `timer-host.ts:36`).
  macOS 기본 동작으로 앞으로 오는지는 실측하지 않았다
- [ ] MONTH 오버레이 표면이 `--bg-deep` 불투명 바탕 + `--glass-highlight` 다. §3.1 은
  `--glass-strong` + `--glass-border` + `--glass-shadow`
- [ ] 앱 메뉴 `데이터 > 모든 데이터 초기화…` 가 스펙에 없다

### 코드 쪽 문구 (스펙이 아니라 코드를 고쳐야 함)

- [ ] `MilestoneRow.tsx:136` 삭제 확인 — `연결된 할당은 기타로 남고…` 의 `할당` 은 카피 Avoid 용어 → `Sprint`
- [ ] `src/main/index.ts:172` 전체 초기화 확인 — `주간 할당`·`마일스톤` 이 Avoid 용어 → `Sprint`·`Milestone`

## 참고

- 결정 원장: [2026-09-25 기능 상태의 뜻](../decision-log/2026-09-25-feature-status-meaning.md)
- 미구현 요소(트레이, 내로우, 오늘 목록 빈 상태 두 갈래, 기타 행 드릴다운, Sprint 배지 등)는
  스펙에 `> ⚠️ 미구현:` 으로 표시했고 각자의 tmp 메모가 있다 — 이 목록에 넣지 않았다
