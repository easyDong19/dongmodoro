# 아키텍처 개요

> 출처: docs/origin/pomodoro-prd.md §5 (기술 방향) + 2026-08-03 스택·아키텍처 검토 논의.
> 이 문서가 확정 스택·프로세스 구조·미결정 사항의 유일한 출처다.
> 개별 선택의 근거는 [decisions/](decisions/) 의 ADR 참조.

## 확정 스택

| 영역 | 선택 | 근거 ADR |
|---|---|---|
| 플랫폼 | Electron + React + TypeScript | — (PRD §5 그대로) |
| 빌드 | electron-vite | — (PRD §5 그대로) |
| 패키지 매니저 | pnpm | [ADR-004](decisions/adr-004-packaging-deploy.md) |
| 로컬 DB | better-sqlite3 + Drizzle ORM + drizzle-kit | [ADR-001](decisions/adr-001-db-better-sqlite3-drizzle.md) |
| 스타일링 | Tailwind CSS + shadcn/ui (뼈대만, 스킨 전면 교체) | [ADR-003](decisions/adr-003-ui-tailwind-shadcn.md) |
| 상태관리 | TanStack Query 단독 (+ React 로컬 state). **전역 상태 라이브러리 없음** | [ADR-005](decisions/adr-005-timer-architecture.md) |
| 타이머 | main 소유 + 상태 전이 push + renderer wall-clock 산술 | [ADR-005](decisions/adr-005-timer-architecture.md) |
| PK · 갱신 추적 | UUID v7 (TEXT) + mutable 테이블 `updated_at` (sessions 포함 — ADR-011 이 부분 정정) | [ADR-006](decisions/adr-006-schema-sync-insurance.md) |
| 시간 포맷 | 4종 분류 (순간 UTC ISO / 달력 키 로컬 불변 / 길이 INTEGER / 런타임 epoch ms 비저장) + 시간 모듈 초크포인트 | [ADR-009](decisions/adr-009-time-format-convention.md) |
| 주 정의 | 주 시작 월요일, 주 키 = 그 주 월요일 날짜 `'YYYY-MM-DD'`, 계획일 = `plan_lead_days` 모델 | [ADR-010](decisions/adr-010-week-definition.md) |
| 스키마 (계획 단계 확정) | `weeks`·`task_pulls` 신설, 불변 달력 키, `completed_at` 통일, 제약·PRAGMA 세트, 시작 시 백업·버전 검사 | [ADR-011](decisions/adr-011-schema-final.md) (ADR-012~014 이 부분 정정) |
| 집계 술어 | 항목 소진은 `sessions.local_week = week_items.week` 조건으로 계산 → 게이지 = 항목 합 + 미분류가 정의상 성립. pull 주 제한 폐기 | [ADR-012](decisions/adr-012-aggregation-predicate.md) |
| 베이스라인·예산 | 예산·capacity·길이를 `weeks` 행에 확정 저장(첫 세션 시에도 생성). 편집은 상시, 효력은 다음 주 경계부터 | [ADR-013](decisions/adr-013-baseline-budget-effect.md) |
| 삭제·보관 | `week_items`·`tasks` 만 soft delete, sessions 불삭제, milestones 물리 삭제 + `ON DELETE SET NULL`. 보관은 집계 중립 | [ADR-014](decisions/adr-014-deletion-and-archive.md) |
| IPC 계약 | 도메인 명령형 API + zod 런타임 검증 | [ADR-007](decisions/adr-007-ipc-contract.md) |
| 코드 구조 | main 3층 + renderer FSD-lite | [ADR-008](decisions/adr-008-code-structure.md) (DB 접근은 ADR-015 가 정정) |
| DB 접근 구조 | 서비스 → 리포지토리 포트(DIP), Drizzle 구현체는 `db/repositories/` 격리, 트랜잭션은 Unit of Work | [ADR-015](decisions/adr-015-repository-ports.md) |
| 패키징·배포 | electron-builder → GitHub Releases 수동 다운로드 | [ADR-004](decisions/adr-004-packaging-deploy.md) |
| 테스트 | Vitest + Testing Library, Playwright 는 핵심 경로만 | — (PRD §5 그대로) |
| 규칙 강제 | ESLint(flat config) 로 ADR-008·009·015 규칙 기계 검사 + husky/commitlint. 포매터는 도입하지 않음 | [ADR-016](decisions/adr-016-lint-and-git-hooks.md) |
| TypeScript 버전 | 6.x 라인 고정. TS 7(네이티브 포트)은 typescript-eslint 미지원 | [ADR-016](decisions/adr-016-lint-and-git-hooks.md) |

## 프로세스 아키텍처

```
┌─ main process (작은 백엔드 서버) ─────────────────┐
│  better-sqlite3 + Drizzle (네이티브 모듈)         │
│  타이머 소유 (wall-clock, 완료 판정·알림·트레이)    │
│  마이그레이션 적용 (앱 시작 시)                     │
│  핸들러(zod) → 서비스(트랜잭션) → 순수 도메인 함수   │
└───────┬─────────────────────────────┬───────────┘
        │ invoke: 도메인 명령형 API      │ send: 타이머 상태 전이
        │ (tasks.pullToToday 등)       │ (started/paused/adjusted/done)
┌───────┴─────────────────────────────┴───────────┐
│ preload (contextBridge, 화이트리스트)              │
├─────────────────────────────────────────────────┤
│ renderer (FSD-lite)                              │
│  TanStack Query 캐시 ─ DB 파생 상태 + 타이머 상태   │
│  타이머 표시값은 wall-clock 산술로 파생              │
│  일시적 UI 상태는 React 로컬 state                 │
└─────────────────────────────────────────────────┘
```

경계 원칙:

1. **네이티브 모듈은 main 전용.** renderer 는 contextBridge/IPC 로만 DB 에 접근한다.
   `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
   raw `ipcRenderer` 노출 금지.
2. **renderer 는 시간을 소유하지 않는다.** 표시값은 renderer 가 계산하지만,
   완료 판정·sessions INSERT·알림·트레이는 main 만 한다. renderer 의 계산이 0 에
   도달해도 아무 일도 일어나지 않는다 — 사실을 만드는 것은 main 의 `timer:done` 뿐.
3. **renderer 는 SQL 도 스키마도 모른다.** 유스케이스 단위 API 만 호출하며,
   트랜잭션 경계는 그 유스케이스 하나다.
4. **DB 가 source of truth.** renderer 의 Query 캐시는 캐시다. 집계값(소진 등)은
   저장하지 않고 항상 쿼리로 파생한다 (PRD 원칙 8).
5. **마이그레이션은 앱 시작 시 적용.** drizzle-kit 이 생성한 SQL 마이그레이션을
   main 이 DB 연결 직후 순서대로 적용한다.

## 상태 계층 (renderer)

검토 결과 **renderer 고유의 전역 공유 상태는 0개**다. 따라서 전역 상태 관리
라이브러리를 채택하지 않는다 ([ADR-005](decisions/adr-005-timer-architecture.md)).

| 상태 종류 | 예시 | 도구 |
|---|---|---|
| DB 파생 상태 | 오늘 목록, 주간 할당, 소진 집계, 캘린더 점 | TanStack Query — IPC 호출을 queryFn 으로, mutation 후 invalidate |
| 타이머 상태 | phase, startedAt, durationSec, 집중 대상 | TanStack Query — 전이 이벤트가 `setQueryData(['timer'])`, 재마운트 시 queryFn 이 스냅샷 pull |
| 일시적 UI 상태 | 모달 열림, 선택된 날짜, 사후 캡처 바 | React 로컬 state |

집중 대상(◎)도 renderer 전역 상태가 아니다 — 세션 귀속을 main 이 결정하므로 어차피
main 이 알아야 하는 값이고, 지정은 IPC 명령으로 보내 타이머 상태로 돌려받는다.

> optimistic update 는 이 앱에서 필수가 아니다. "서버"가 같은 기기의 SQLite 라
> IPC 왕복이 1~2ms 이므로 `mutate → invalidate` 로 충분히 즉각적이다.
> 실제로 설계 노력이 필요한 것은 **invalidation 키 설계**(세션 완료가 어떤 query key
> 를 무효화하는가)다.

## 디렉토리 구조

```
src/
├── main/          # 핸들러(zod) → 서비스(트랜잭션) → 순수 도메인 함수, DB, 타이머, 트레이
├── preload/       # contextBridge 화이트리스트
├── renderer/      # FSD-lite: features / entities / shared
└── shared/        # IPC 채널·zod 계약 + 양 프로세스 공유 순수 계산
                  #   (타이머 남은 시간, 요일별 부하 분산)
                  #   Node/DOM API import 금지 — 순수 TS 만
```

`renderer/features/` 슬라이스는 `docs/features/` 의 기능 폴더와 1:1 로 대응한다.

## 확장성 (멀티기기 동기화)

확장 지점(seam)은 IPC 경계다. 원격 백엔드가 생겨도 renderer 와 Query 계층은
바뀌지 않고, 데이터 소스 확장은 전부 main 뒤편에서 일어난다.

```
지금:   renderer → IPC → main → SQLite
나중:   renderer → IPC → main → SQLite (로컬 우선) ↕ 동기화 엔진 ↔ 원격 서버
```

지금 사둔 보험은 스키마 두 가지(UUID v7, `updated_at` —
[ADR-006](decisions/adr-006-schema-sync-insurance.md))와 main 내부의 리포지토리
포트([ADR-015](decisions/adr-015-repository-ports.md) — 서비스가 저장소 구현을 모른다)다.
동기화 엔진 선택과 서버 스키마는 **지금 만들지 않는다.** IPC 경계는 renderer 를 위한
유스케이스 파사드로서의 심(seam)이고, main 내부의 심은 리포지토리 포트가 담당한다.

## 미결정 사항

| 항목 | 선택지 | 결정 시점 |
|---|---|---|
| macOS 코드 서명·공증 | 미서명 배포 vs Apple Developer 계정 + notarization | 패키징 단계 (M4) |
| Query invalidation 키 계층 | 세션 완료·정산 확정이 무효화할 key 범위 설계 | 구현 착수 시 (M1) |
