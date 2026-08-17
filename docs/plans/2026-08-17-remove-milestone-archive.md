# Milestone 보관 개념 제거 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Milestone 의 보관(archive) 개념을 데이터·계약·서비스·UI·문서에서 완전히 제거한다.

**Architecture:** 위에서 아래로(렌더러 → 계약·서비스·리포지토리 → DB 스키마) 걷어내 커밋마다 타입체크·테스트가 초록을 유지한다. 결정은 ADR-034 로 먼저 남기고 (ADR-014 §4 supersede), `archived_at` 컬럼은 마지막에 파괴적 마이그레이션(테이블 재구축)으로 드랍한다.

**Tech Stack:** Electron + React + drizzle-orm(SQLite) + drizzle-kit + zod IPC 계약 + vitest.

**Spec:** 사용자 승인된 A안 (이 대화, 2026-08-17). 결정 원문은 Task 1 의 ADR-034 가 스펙 역할을 한다.

## Global Constraints

- 커밋 메시지·PR 제목·본문은 **영어만** (로컬 훅이 백틱 안 한글도 차단).
- UI 카피는 CONTEXT.md 캐노니컬 용어만. UI 에 이모지 금지.
- `docs/origin/` 수정 금지. ADR 은 수정 대신 superseded 표기 + 새 ADR.
- 파괴적 마이그레이션은 ADR-032 절차 (drizzle-kit 초안 수동 검토, `foreign_key_check` 는 migrate.ts 가 이미 수행).
- 각 Task 종료 시점에 `pnpm exec tsc --noEmit -p tsconfig.json` 및 관련 테스트가 통과해야 한다.
- 작업 디렉토리: `.claude/worktrees/remove-milestone-archive`, 브랜치 `feature/remove-milestone-archive`.

---

### Task 1: 문서 — ADR-034 작성, ADR-014 supersede, PRD·CONTEXT.md 갱신

**Files:**
- Create: `docs/architecture/decisions/adr-034-remove-milestone-archive.md`
- Modify: `docs/architecture/decisions/adr-014-soft-delete-scope.md` (상태 줄만)
- Modify: `docs/features/milestones/prd.md`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces: 이후 모든 코드 Task 가 "근거: ADR-034" 주석으로 참조할 결정 문서.

- [ ] **Step 1: ADR-034 작성**

`docs/architecture/decisions/adr-034-remove-milestone-archive.md` 를 생성한다. 필수 섹션 context / decision / consequences 를 갖추고 다음 내용을 담는다:

- **Context**: 보관은 "목록에서 치우되 이력은 남기기"용이었으나 (ADR-014 §4), 실사용에서 쓸 일이 없고, `보관 K건` 토글·배지 표기가 UI 를 지저분하게 하며, "보관해도 분모가 안 변한다"는 동작이 직관과 어긋나 혼란만 남겼다 (2026-08-17 사용자 결정).
- **Decision**: 보관 개념을 제거한다. `milestones.archived_at` 컬럼 드랍, `setArchived` IPC 채널·`archivedItems`·`badge.archivedCount` 제거. 미완료 Milestone 은 그 달 카드에 사실로 남는다. 지난달 카드는 완전 읽기 전용이 된다 (보관이 유일한 쓰기 조작이었다). 이월 후보(R22)는 `completed_at IS NULL` 하나로 단순해진다. 기존에 보관돼 있던 행은 마이그레이션 후 목록에 다시 나타난다 — 배지 분모는 원래 보관 무관이라 `N/M` 숫자는 변하지 않는다.
- **Consequences**: (+) 개념·조작·화면 요소가 하나씩 줄어 머릿속 모델이 단순해진다. (+) 지난달 카드의 "읽기 전용인데 쓰기 하나 예외" 특례가 사라진다. (−) 미완료 항목을 화면에서 치우는 수단이 삭제(물리 삭제)뿐이다. (관계) **ADR-014 §4 를 supersede 한다.** §1~§3(물리 삭제, soft delete 범위)은 그대로 살아 있되, §3 의 "이력 보존은 보관이 담당" 문구는 "이력 보존은 항목이 그 달 카드에 남는 것 자체가 담당"으로 대체된다.

- [ ] **Step 2: ADR-014 상태 줄 갱신**

`adr-014-soft-delete-scope.md` 상단 상태 줄에 추가한다 (본문은 이력으로 그대로 둔다):

```markdown
> 상태: §4 는 [ADR-034](adr-034-remove-milestone-archive.md) 로 superseded (2026-08-17).
> §1~§3 은 유효하다. §3 의 "이력 보존은 보관이 담당" 서술만 ADR-034 가 대체한다.
```

- [ ] **Step 3: milestones PRD 갱신**

`docs/features/milestones/prd.md` 에서:
- **R11 삭제** → 자리에 `- **R11.** (삭제됨 — 보관 개념 제거, ADR-034)` 한 줄을 남겨 번호를 보존한다.
- **R20 표**: 순서 5(지난달) 행의 "**보관·해제만 허용** (R11)" 을 "쓰기 조작 없음 — 완전 읽기 전용" 으로 수정. 순서 2(선행 편집) 행의 "완료 토글·보관 가능" 에서 보관 제거.
- **R21**: "`M` = ... 보관 여부와 무관" 서술을 "`M` = 그 달에 존재하는(물리 삭제되지 않은) 마일스톤 수" 로 단순화. "보관·해제로 배지 조작 불가" 불릿과 "보관 사실 함께 표시 (R23)" 불릿 삭제.
- **R22**: "보관 여부와 무관하게 후보로 보여주고" → 후보 조건은 `completed_at IS NULL` 하나라고 수정.
- **R23**: 배지 문구에서 `· 보관 K건` 변형 삭제.
- **범위 문단(줄 36~37)**: "보관과 보관 해제" 제거. **R8(줄 90)**: "이력 보존은 삭제가 아니라 보관(R11)이 담당한다" → "이력 보존은 항목이 그 달 카드에 남는 것이 담당한다 (ADR-034)". **R14(줄 124)**: 후보 제한에서 "+ 보관되지 않은 것" 제거.
- **인수 기준**: A20(보관 해제 도달 경로)·A21(집계 중립) 행을 `(삭제됨 — ADR-034)` 로 대체. A23 에서 "보관" 언급 정리. 대신 새 인수 기준 한 줄 추가: `| A20 | 지난달 카드에는 어떤 쓰기 조작도 렌더되지 않는다 | R20 |`.
- 서두(줄 15~17, 32)의 보관 결함 서사는 **이력 서술이므로 그대로 둔다**.

- [ ] **Step 4: CONTEXT.md 갱신**

`보관` 항목(줄 58~61)을 Language 섹션에서 제거하고, `## 폐기된 용어` 표에 행 추가:

```markdown
| 보관 (`archived_at`) | Milestone 을 목록 표시에서만 빼던 조작 | 없음 — 미완료는 그 달 카드에 사실로 남는다 (ADR-034) |
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/decisions/adr-034-remove-milestone-archive.md docs/architecture/decisions/adr-014-soft-delete-scope.md docs/features/milestones/prd.md CONTEXT.md docs/plans/2026-08-17-remove-milestone-archive.md
git commit -m "docs(adr): decide to remove the milestone archive concept"
```

---

### Task 2: 렌더러 — 보관 UI 제거

**Files:**
- Modify: `src/renderer/features/milestones/MilestoneRow.tsx`
- Modify: `src/renderer/features/milestones/MilestoneCard.tsx`
- Modify: `src/renderer/features/milestones/useMilestones.ts`
- Test: `src/renderer/features/milestones/MilestoneCard.test.tsx`

이 Task 에서는 계약 필드(`archivedAt`·`archivedItems`·`archivedCount`·`setArchived`)가 아직 존재한다 — 렌더러가 **읽기를 중단**할 뿐이라 커밋이 초록을 유지한다.

**Interfaces:**
- Produces: `RowActions` = `{ rename, setCompleted, remove }` (Task 3 이후에도 동일).

- [ ] **Step 1: 테스트를 새 기대로 수정 (실패 확인용)**

`MilestoneCard.test.tsx` 에서:
- `'지난달에서도 보관은 동작한다 …'` (줄 108 부근), `'보관이 있으면 건수를 함께 적는다'`, `'보관이 없으면 건수 표기가 붙지 않는다'`, `describe('보관 목록 — …')` 블록 전체 삭제.
- `calls` 픽스처에서 `setArchived` 줄 삭제 (useMilestones 모킹 구조 확인 후).
- 새 테스트 추가:

```tsx
it('지난달 카드에는 어떤 쓰기 조작도 렌더되지 않는다 (R20 · A20)', async () => {
  renderCard({
    mode: 'past',
    items: [item()],
    badge: { total: 1, completed: 0, archivedCount: 0 }
  })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
```

(픽스처 헬퍼 이름은 파일의 실제 헬퍼 — `bare`/`renderCard` 등 — 에 맞춘다. `archivedCount` 필드는 Task 3 에서 픽스처째 사라진다.)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm exec vitest run src/renderer/features/milestones/MilestoneCard.test.tsx`
Expected: 새 테스트 FAIL (보관 버튼이 아직 렌더된다).

- [ ] **Step 3: MilestoneRow.tsx 에서 보관 제거**

- import 에서 `Archive, ArchiveRestore` 삭제.
- `RowActions` 에서 `setArchived` 삭제.
- `const archived = item.archivedAt !== null` (줄 44) 삭제.
- 줄 112~122 의 보관 토글 버튼 블록(주석 포함) 삭제.

- [ ] **Step 4: MilestoneCard.tsx 에서 보관 목록·배지 표기 제거**

- `actions` 객체에서 `setArchived` 삭제 (줄 35).
- 배지 렌더(줄 59~65)를 단일 문구로:

```tsx
{data.badge !== null ? (
  <p data-testid="milestone-badge" className="font-mono text-xs tabular-nums text-ink-dim">
    {`${data.badge.completed}/${data.badge.total} 달성`}
  </p>
) : null}
```

- 보관 목록 블록(줄 98~125, `archived-toggle`·`archived-list`)과 `showArchived` state 삭제.

- [ ] **Step 5: useMilestones.ts 에서 setArchived 뮤테이션 제거**

줄 44~ 의 `setArchived` useMutation 과 반환 객체의 `setArchived` 삭제.

- [ ] **Step 6: 테스트·타입체크 통과 확인**

Run: `pnpm exec vitest run src/renderer/features/milestones && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/features/milestones
git commit -m "feat(milestones): drop archive controls from the month card"
```

---

### Task 3: 계약·IPC·서비스·리포지토리 — 보관 경로 제거

**Files:**
- Modify: `src/shared/ipc/contracts.ts`, `src/shared/ipc/channels.ts`, `src/preload/index.ts`, `src/main/ipc/milestones.ts`
- Modify: `src/main/services/milestones.ts`, `src/main/services/ports.ts`
- Modify: `src/main/db/repositories/drizzle.ts`
- Test: `src/shared/ipc/contracts.test.ts`, `src/main/services/milestones.test.ts`, `src/main/db/repositories/milestones.test.ts`, `src/renderer/app/App.test.tsx`, `src/renderer/features/week/ItemDrawer.test.tsx`, `src/main/services/week-plan.test.ts`

**Interfaces:**
- Produces: `milestoneSchema` = `{ id, month, title, completedAt }` / `MilestoneRow` = 동일 / `MilestoneBadge` = `{ total, completed }` / `MonthMilestones` 에서 `archivedItems` 제거 / `MilestonesRepository` 에서 `listArchivedForMonth`·`archive`·`unarchive` 제거.
- Consumes: Task 2 의 렌더러 (이미 이 필드들을 읽지 않는다).

- [ ] **Step 1: 계약 제거**

`contracts.ts`:
- `milestoneSchema` 에서 `archivedAt` 삭제 (줄 149).
- `forMonth.res` 에서 `badge.archivedCount`(줄 385)·`archivedItems`(줄 391~392, 주석 포함) 삭제.
- `setArchived` 계약(줄 407~410) 삭제.

`channels.ts` 줄 53 `setArchived` 삭제. `preload/index.ts` 줄 70 삭제. `main/ipc/milestones.ts` 줄 34~ 핸들러와 `setMilestoneArchived` import 삭제.

- [ ] **Step 2: 서비스·포트 제거**

`services/milestones.ts`:
- `MonthMilestones` 에서 `archivedItems` 필드·주석 삭제, `monthMilestones` 반환에서 `archivedItems` 줄 삭제.
- `setMilestoneArchived` 함수(줄 169~189) 삭제.
- `MilestoneMode` 의 `'past'` 주석을 "감쇠 + 달성 배지. 완전 읽기 전용." 으로 수정.

`services/ports.ts`:
- `MilestoneRow.archivedAt` 삭제 (줄 185~186).
- `MilestoneBadge.archivedCount`·관련 주석 삭제, "보관으로 분모를 깎으면…" 주석을 "total 은 물리 삭제되지 않은 전부다 (ADR-034 — 보관 개념은 제거됐다)" 로 축약.
- `MilestonesRepository` 에서 `listArchivedForMonth`·`archive`·`unarchive` 와 그 주석 삭제. `listForMonth` 주석 "**보관되지 않은**" → "그 달의". `badgeCounts`·`carryCandidates` 주석에서 보관 언급 제거. 인터페이스 상단 "archive/unarchive 두 메서드로 나눈 이유" 주석은 complete/uncomplete 만 남게 수정.

- [ ] **Step 3: 리포지토리 제거**

`repositories/drizzle.ts` milestones 블록에서:
- `listForMonth` 의 `isNull(milestones.archivedAt)` 조건 삭제 → `where(eq(milestones.month, month))`.
- `listArchivedForMonth` 쿼리 삭제.
- `badgeCounts` 의 `archivedCount` 집계 삭제, "거르지 않는 것이 핵심 규율" 주석을 "필터 없이 그 달 전부를 센다 (R21)" 로 교체.
- `archive`/`unarchive` 메서드 삭제.
- select 목록의 `archivedAt: milestones.archivedAt` 전부 삭제 (줄 604, 618, 646, 734 부근 — `rtk grep -n "archivedAt" src/main/db/repositories/drizzle.ts` 로 잔존 확인).
- 사용하지 않게 된 `isNotNull` import 정리.

- [ ] **Step 4: 테스트를 새 기대로 수정**

- `contracts.test.ts`: `archiv` 관련 케이스 삭제·픽스처 정리.
- `services/milestones.test.ts`: `fakeUow` 에서 `listArchivedForMonth`·`archived` 옵션·`archivedCount` 삭제, `describe('monthMilestones — 보관 목록…')` 블록 삭제, badge 기대값 `{ total, completed }` 로 수정.
- `repositories/milestones.test.ts`: `'보관된 것은 목록에서 빠진다'` 삭제, `badgeCounts` describe 를 "물리 삭제만 분모를 바꾼다" 로 재구성. 새 테스트:

```ts
it('완료 여부와 무관하게 그 달 전부가 목록에 나온다 (R10 · ADR-034)', () => {
  uow.run((repos) => {
    const a = addMilestone(repos, AUG, '첫째')
    const b = addMilestone(repos, AUG, '둘째')
    repos.milestones.complete(b, AT)
    expect(repos.milestones.listForMonth(AUG).map((m) => m.id)).toEqual([a, b])
  })
})
```

- `App.test.tsx` 줄 85 `archivedItems: []` 삭제. `ItemDrawer.test.tsx` 줄 325 `archivedAt: null` 삭제. `week-plan.test.ts` 픽스처의 `archivedAt` 삭제 (`rtk grep -rn "archivedAt" src --include="*.test.*"` 로 전수 확인).

- [ ] **Step 5: 전체 테스트·타입체크**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm test`
Expected: PASS (794 - 삭제분 + 추가분).

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(milestones): remove the archive path from contract, service, and repository"
```

---

### Task 4: DB — `archived_at` 드랍 마이그레이션

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `drizzle/0002_*.sql` (+ `drizzle/meta/0002_snapshot.json`, `_journal.json` — drizzle-kit 이 생성)
- Test: `src/main/db/migrate.test.ts`

**Interfaces:**
- Consumes: Task 3 이후 코드는 `archivedAt` 을 어디서도 읽지 않는다.

- [ ] **Step 1: 마이그레이션 테스트 먼저 작성**

`migrate.test.ts` 에 추가 (기존 0001 테스트의 패턴을 따른다 — v1 스키마 시드 후 `migrateDb` 실행):

```ts
it('archived_at 이 드랍되고 보관돼 있던 행은 데이터 손실 없이 남는다 (ADR-034)', () => {
  // 기존 헬퍼로 0001 까지 적용된 DB 를 만들고, archived_at 이 채워진 행을 시드한 뒤
  // migrateDb 를 끝까지 실행한다.
  sqlite.exec(`
    INSERT INTO milestones (id,month,title,completed_at,sort_order,archived_at,created_at,updated_at)
    VALUES ('m-a','2026-07','archived one',NULL,0,'2026-07-31T00:00:00.000Z','2026-07-01T00:00:00.000Z','2026-07-01T00:00:00.000Z')
  `)
  migrateDb(sqlite, migrationsDir)
  const cols = sqlite.prepare(`SELECT name FROM pragma_table_info('milestones')`).all()
  expect(cols.map((c: { name: string }) => c.name)).not.toContain('archived_at')
  const row = sqlite.prepare(`SELECT title FROM milestones WHERE id='m-a'`).get()
  expect(row).toEqual({ title: 'archived one' })
})
```

(시드·마이그레이터 호출은 파일의 기존 헬퍼 — 줄 360 부근 0001 테스트 — 와 같은 방식을 쓴다. 시드는 0002 적용 **전** 스키마에 해야 하므로 기존 테스트의 단계적 적용 헬퍼를 재사용한다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run src/main/db/migrate.test.ts`
Expected: FAIL — 0002 마이그레이션이 아직 없다.

- [ ] **Step 3: 스키마에서 컬럼 제거 + 마이그레이션 생성**

`schema.ts`: `archivedAt` 컬럼(줄 140)·`milestones_archived_at_format` check(줄 149)·테이블 주석의 보관 문단(줄 121~126)을 정리한다. 주석은:

```ts
/**
 * 삭제는 **물리 삭제**다(ADR-014 §3). 미완료 이력은 행이 그 달에 남는 것 자체가
 * 보존한다 — 보관(archived_at)은 ADR-034 로 제거됐다.
 */
```

그 다음:

```bash
pnpm exec drizzle-kit generate --name drop_milestone_archive
```

- [ ] **Step 4: 생성된 SQL 수동 검토 (ADR-032 §3)**

`drizzle/0002_drop_milestone_archive.sql` 을 열어 확인한다:
- CHECK 제약 때문에 테이블 재구축(`__new_milestones` 생성 → INSERT SELECT → DROP → RENAME) 패턴이어야 한다. 단순 `ALTER TABLE … DROP COLUMN` 이 나왔다면 CHECK 재생성 여부를 확인한다.
- INSERT SELECT 의 컬럼 목록이 `id, month, title, completed_at, sort_order, created_at, updated_at` 전부인지 (데이터 손실 없음).
- 0001 처럼 `PRAGMA foreign_keys` 줄이 있으면 삭제한다 (migrate.ts 가 트랜잭션 밖에서 토글한다 — ADR-032 §1).
- 손대면 파일 상단에 0001 형식의 hand-edit 사유 주석을 남긴다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run src/main/db && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/db drizzle
git commit -m "feat(db): drop milestones.archived_at"
```

---

### Task 5: 잔재 청소와 최종 검증

**Files:**
- Modify: 스윕에서 발견되는 잔존 참조 전부 (예상: 주석·e2e·wireframe)

- [ ] **Step 1: 전수 스윕**

```bash
rtk grep -rn "archiv" src e2e docs/features docs/design-system CONTEXT.md --include="*"
rtk grep -rn "보관" src e2e docs/features CONTEXT.md
```

Expected: 코드 0건. 문서는 이력 서술(ADR-014 본문, PRD 서두 서사, decision-log, origin)만 남는다. `docs/design-system/wireframes/` 에 보관 UI 가 그려져 있으면 함께 갱신한다. e2e 에 보관 시나리오가 있으면 삭제한다.

- [ ] **Step 2: 최종 검증**

```bash
pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint && pnpm test
```

Expected: 전부 PASS.

- [ ] **Step 3: Commit (잔재가 있었던 경우만)**

```bash
git add -A
git commit -m "chore(milestones): sweep remaining archive references"
```

- [ ] **Step 4: 사용자 보고**

plain-report 형식으로 결과 보고 후, PR 생성은 사용자 컨펌 1회를 받는다 (memory: gh-pr-autonomy-allowed).
