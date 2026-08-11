# dongmodoro

월(결과물) → 주(얼마만큼) → 오늘(지금 뭐부터) 3층 계획과 뽀모도로 타이머를
**한 화면에서 끊기지 않게** 잇는 로컬 데스크톱 앱.

> **현재 상태: M3b 주간 정산 완료.**
> 플래너에서 할당을 잡고, 조각을 오늘로 가져오고, 집중 세션을 기록하면 그 뽀모가 주간
> 카드로 되돌아오며, 주가 끝나는 지점에서 남은 항목을 **화면 하나·클릭 한 번**으로
> 처분해 다음 주로 넘긴다 — 주 → 오늘 → 실행 → 주 → 정산 → 다음 주 가 이어졌다.
> 몇 주를 비우고 돌아와도 정산 화면은 하나이며 항목 수만 늘어난다.
> 정산 패널의 `조정` 에서 뽀모 길이와 요일별 가용량을 바꾼다 — 바뀐 값은 다음 주부터
> 효력을 갖는다. 마일스톤·달력·반응형 셸·트레이는 아직 없고, 첫 실행 온보딩과 요일별
> 부하 그래프, 기타 행 드릴다운도 남아 있다.
> ([M3b 계획](docs/plans/2026-08-10-m3b-weekly-review.md) ·
> [베이스라인 편집 계획](docs/plans/2026-08-11-baseline-editing.md))
>
> 그래서 이 저장소를 읽을 때 코드보다 **결정의 기록**이 여전히 크다. 스택도 스키마도
> 코드보다 먼저 문서로 확정된 프로젝트이며, 코드는 그 결정이 깨지면 실패하도록
> 만들어져 있다.

## 왜 만들었나

계획 도구(노션·투두 앱)와 실행 도구(타이머)가 분리돼 있으면 하루를 시작할 때마다
둘 사이를 왕복하게 되고, 그 왕복 자체가 계획을 부담으로 만든다. 이 앱의 성공 기준은
소진량이나 달성률이 아니라 **계획과 실행이 한 화면에서 이어지는 것** 하나다.

층마다 답하는 질문이 다르고 섞이지 않는다.

| 층 | 답하는 질문 | 숫자 |
|---|---|---|
| 월 마일스톤 | 이번 달이 끝나면 뭐가 달라져 있나 | 없다 — 수치 입력 필드를 두지 않는다 |
| 주간 할당 | 얼마만큼 | 뽀모 개수(est·예산)가 처음 등장하는 층 |
| 오늘 목록 | 지금 뭐부터 | 없다 — 주간 풀에서 pull 로만 채운다 |

설계를 관통하는 원칙은 [PRODUCT.md](PRODUCT.md) 가 소유한다. 요약하면:
계획이 0개여도 앱은 완전히 동작한다 · 예산 초과는 실패가 아니다 ·
사실만 표시하고 판단은 사용자에게 · 집계값은 저장하지 않고 아래→위로만 파생한다 ·
막는 화면(강제 모달·차단 경고)이 없다.

## 기술 스택

Electron + electron-vite + React 19 + TypeScript strict / better-sqlite3 + drizzle-orm /
zod 검증 IPC / TanStack Query / Tailwind CSS v4 + shadcn/ui / Vitest.
선택 근거는 전부 [ADR](docs/architecture/decisions/) 로 남아 있다 — 스택이 코드보다
먼저 결정된 프로젝트다.

## 개발

**요구 환경**: Node 22 LTS 이상, pnpm. 패키지 매니저는 pnpm 만 쓴다
([ADR-004](docs/architecture/decisions/adr-004-packaging-deploy.md)) — npm·yarn 으로 설치하면
네이티브 모듈 빌드 허용 설정(`pnpm-workspace.yaml` 의 `allowBuilds`)이 적용되지 않는다.

```bash
pnpm install
pnpm dev          # 개발 실행 (창이 뜬다)
pnpm test         # Vitest
pnpm typecheck    # main·renderer 두 tsconfig 를 각각 검사
pnpm lint         # ESLint — 아키텍처 경계 규칙 포함
pnpm format       # Prettier
pnpm build        # 프로덕션 빌드 (out/)
```

커밋하면 husky 훅이 Prettier·ESLint·커밋 메시지 형식을 자동으로 검사한다. 훅에 걸리면
`--no-verify` 로 우회하지 말고 규칙에 맞게 고친다 —
[ADR-016](docs/architecture/decisions/adr-016-lint-and-git-hooks.md) 이 그 훅을
"문서로만 존재하던 규칙을 실패하게 만드는 장치"로 정의한다.

> 개발 중 화면에 뜨는 버전은 Electron 의 버전이다. `app.getVersion()` 은 패키징되지 않은
> 상태에서 Electron 버전을 돌려주며, 앱 버전 `0.1.0` 은 M4 패키징 이후에 나온다.

## 저장소 구조

```
dongmodoro/
├── PRODUCT.md          # 제품 컨텍스트 — 사용자·목적·포지셔닝·불변 원칙
├── CONTEXT.md          # 도메인 용어집 — 캐노니컬 용어의 유일한 출처
├── CLAUDE.md           # AI 에이전트 작업 규칙 (용어·브랜치·커밋·이모지 금지)
├── CONTRIBUTING.md     # 브랜치 전략 (GitLab Flow 변형, 스쿼시 머지 전용)
├── src/
│   ├── main/           # Electron main = 작은 백엔드
│   │   ├── db/         # Drizzle·better-sqlite3 import 가 허용되는 유일한 하위 트리
│   │   ├── ipc/        # handleIpc — 발신자 검증·요청/응답 검증의 유일한 등록 경로
│   │   └── services/   # 리포지토리 포트 (DB 라이브러리를 모른다)
│   ├── preload/        # contextBridge 화이트리스트 (CJS 로 빌드된다)
│   ├── renderer/       # React — FSD-lite (app / features / entities / shared)
│   │   └── shared/styles/  # tokens.css = design-system/tokens.md 의 이식본
│   └── shared/         # 순수 TS 전용 — Node·DOM API 금지. 시간 모듈과 IPC 계약
├── drizzle/            # drizzle-kit 이 생성한 SQL 마이그레이션
└── docs/
    ├── CLAUDE.md       # 문서 작성 규칙 — 폴더별 책임 경계의 정의
    ├── origin/         # ⛔ 원천 초안 (읽기 전용, 구속력 없음)
    ├── features/       # 기능별 확정 기획 (8개 기능)
    ├── architecture/   # 기술 스택·프로세스 구조 + ADR 26건
    ├── design-system/  # 디자인 토큰·시각 철칙 + ADR 9건 + 와이어프레임
    ├── decision-log/   # 결정 과정의 기록 (기각된 선택지 포함)
    └── plans/          # 구현 계획서 (마일스톤 단위 작업 지시서)
```

폴더 경계는 문서로만 있는 규칙이 아니라 ESLint 가 강제한다 — `src/shared/` 가 Node·DOM 을
import 하거나, `src/main/db/` 밖에서 Drizzle 을 import 하거나, 시간 모듈 밖에서
`new Date()` 를 부르면 lint 가 실패한다
([ADR-008](docs/architecture/decisions/adr-008-code-structure.md) ·
[ADR-015](docs/architecture/decisions/adr-015-repository-ports.md) ·
[ADR-009](docs/architecture/decisions/adr-009-time-format-convention.md)).

### 각 폴더가 하는 일과 힘의 순서

문서끼리 충돌할 때 누가 이기는지가 정해져 있다. 이것이 이 저장소의 핵심 규칙이다.

| 폴더 | 역할 | 충돌 시 |
|---|---|---|
| `docs/origin/` | 최초 초안 PRD·시안 v7 HTML. **이력 보존용 읽기 전용** | **항상 진다** — 초안일 뿐 명세가 아니다 |
| `docs/features/` | 기능 8개의 확정 요구사항·화면 명세 | origin 을 이긴다 |
| `docs/architecture/` | 스택·프로세스 경계·스키마 등 기술 결정(ADR) | 기능별 technical-spec 은 여기와 충돌할 수 없다 |
| `docs/design-system/` | 토큰([tokens.md](docs/design-system/tokens.md))과 시각 철칙([principles.md](docs/design-system/principles.md)) | 시각 판단은 principles 가 기능 문서를 이긴다 |
| `docs/decision-log/` | 결정에 이른 **과정** — 질문, 기각된 선택지, 사용자 원문 이유 | 구속력 없음 (왜 이렇게 됐는지 추적용) |
| `docs/plans/` | 태스크 분해·순서·검증 방법 | **결정을 만들지 않는다** — ADR·기능 문서를 참조만 한다 |

결정이 뒤집히면 기존 ADR 을 고치지 않고 superseded 표기 후 새 ADR 을 추가한다.
(예: 다크 전용을 확정한 design-system ADR-006 §1 을 같은 날 ADR-008 이 뒤집었다 —
두 문서가 모두 남아 있어 그 과정을 추적할 수 있다.)

### 계획 문서 (docs/plans/)

| 문서 | 내용 |
|---|---|
| [2026-08-04-m1-scaffolding.md](docs/plans/2026-08-04-m1-scaffolding.md) | M1 워킹 스켈레톤 — 태스크 8개, **완료**. "창이 뜨고, DB 가 열리고, IPC 왕복 1회가 화면에 렌더된다"까지. 기능 코드는 만들지 않는다 |
| [2026-08-07-m2-core-loop.md](docs/plans/2026-08-07-m2-core-loop.md) | M2 코어 루프 — 태스크 11개, **완료**. 이벤트 채널·query key 무효화 초크포인트·타이머 엔진·오늘 목록 IPC·타이머 카드와 캡처 바 UI 까지, 오늘 목록→타이머→세션 기록 세로 슬라이스가 동작한다 |
| [2026-08-07-m3a-week-plan.md](docs/plans/2026-08-07-m3a-week-plan.md) | M3a 주간 계획 — 태스크 10개, **완료**. 유효 예산 계약·주간 항목 리포지토리·`week:*` IPC 9종·주간 카드·항목 드로어·플래너까지. M2 의 주간 무효화가 실제로는 어떤 쿼리에도 걸리지 않던 것(긴 키로 짧은 키를 잡을 수 없다)을 Task 5 가 정정해 고리를 닫았다 |
| [2026-08-10-m3b-weekly-review.md](docs/plans/2026-08-10-m3b-weekly-review.md) | M3b 주간 정산 — 태스크 13개, **완료**. 워터마크 단독 판정·요약 집계(계획에 없던 집중은 차액)·3택 조회·`weeks` 스냅샷 확장·확정 트랜잭션·배너·정산 패널까지. 기능 문서와 코드가 어긋난 세 자리(주 라벨 표기·`targetWeekBudget` nullable·패널 배치)를 계획서가 먼저 밝히고 같은 PR 에서 문서를 고쳤다 |
| [2026-08-11-e2e-harness.md](docs/plans/2026-08-11-e2e-harness.md) | E2E 하네스와 CI — **완료**. Playwright 로 실제 앱을 띄우는 스모크 하네스를 세우고, 그때까지 어디서도 자동 실행되지 않던 타입체크·린트·서식·단위 테스트·빌드를 같은 워크플로에 함께 올렸다 |
| [2026-08-11-theme-and-titlebar.md](docs/plans/2026-08-11-theme-and-titlebar.md) | 테마 전환과 커스텀 타이틀바 — 태스크 10개, **완료**. 테마의 소유자를 OS 에서 앱으로 옮기고(`nativeTheme.themeSource`) 프레임리스 창에 2택 토글을 세웠다. 첫 페인트부터 올바른 테마로 뜬다 |
| [2026-08-11-baseline-editing.md](docs/plans/2026-08-11-baseline-editing.md) | 뽀모 길이·가용량 편집 — 태스크 7개, **완료**. 정산 패널의 `조정` 진입점과 편집 폼, 그리고 그 값을 쓰는 경로 하나. 효력 지연은 새 코드가 아니라 **`weeks` 스냅샷을 건드리지 않는 것**으로 성립한다 |

계획서는 실행이 끝나도 고치지 않고 이력으로 남긴다. 실행 중에 계획이 틀린 것으로
드러난 지점은 계획서 본문에 갱신 블록으로 표시돼 있다 (예: 네이티브 재빌드 불필요,
리포지토리 페이크 보류).

마일스톤 지도: **M1** 스캐폴딩(완료) → **M2** 코어 루프(완료) → **M3a** 주간 계획(완료)
→ **M3b** 정산(완료) → **M4** 패키징(electron-builder, macOS 서명·공증, 트레이 세부).
세부 분할은 각 단계 착수 시점에 계획 문서로 추가된다.

M3a 가 미뤘던 3종은 M3b 가 `clock.now` 에 요일 필드를 더하면서 함께 살아났다 (요일 핍
4상태·오늘 배정 상단 정렬·플래너의 `다음 주`). **뽀모 길이 편집 진입점**도 정산 패널의
`조정` 으로 열렸다. 남은 것은 셋이다: **첫 실행 온보딩**은 편집 경로 2개 중 나머지 하나이며
app-shell 이 그 화면을 만들어야 살아나고, **요일별 부하 그래프**는 `weekly_capacity` 가
채워지기 시작해 이제 기준선이 있으므로 week-plan 이 표시 규칙만 정하면 되며, **기타 행
드릴다운**은 그 둘과 독립이라 언제든 붙일 수 있다.

## 문서 읽는 순서

처음 온 사람 기준.

1. [PRODUCT.md](PRODUCT.md) — 무엇을, 누구를 위해, 왜
2. [CONTEXT.md](CONTEXT.md) — 용어. 이걸 건너뛰면 "정산"과 "리뷰"를 섞어 쓰게 된다
3. [docs/features/README.md](docs/features/README.md) — 기능 8개 인덱스. 관심 기능의 overview → prd 순. 문서 세트는 기능마다 다르다 — ux-spec 은 화면 상태·문구가 요구사항 본문보다 길어진 4개 기능에만 있고, technical-spec 은 weekly-review 하나뿐이다 (필요 없는 문서를 만들지 않는 것이 규칙이다)
4. [docs/architecture/overview.md](docs/architecture/overview.md) — 스택·프로세스 구조·미결정 사항
5. [docs/design-system/tokens.md](docs/design-system/tokens.md) — 시각 값의 유일한 출처
6. [docs/design-system/wireframes/v1-wireframe.html](docs/design-system/wireframes/v1-wireframe.html) — 브라우저로 열면 8개 뷰 + 다크/라이트 토글 (구속력 없는 시각 참조)

"왜 이 결정인가"가 궁금해지면 각 문서가 인용하는 ADR → decision-log 순으로 내려간다.

코드부터 보는 편이 빠른 사람은 이 순서가 짧다. 스켈레톤이라 파일이 적고, 각 파일이
어떤 ADR 의 실행분인지 주석에 적혀 있다.

1. `src/shared/ipc/contracts.ts` — 프로세스 사이를 오가는 것의 정의. 여기서 시작하면
   main 과 renderer 양쪽으로 갈라진다
2. `src/main/ipc/handle.ts` — 모든 IPC 가 지나는 한 지점 (발신자 검증 + 양방향 검증)
3. `src/main/db/schema.ts` — 테이블 7개, CHECK 44개. 제약이 왜 이 형태인지는
   [ADR-019](docs/architecture/decisions/adr-019-constraint-implementation.md) 가 설명한다
4. `src/main/index.ts` — 부팅 순서(DB → 핸들러 → 창)와 실패 처리. DB 를 열지 못하면
   창을 띄우지 않는다 — 기능 없는 창은 사용자에게 정상으로 보이기 때문이다.
   다운그레이드·손상·마이그레이션 실패는 각각 다른 문장으로 설명하고, 그 밖의 실패도
   같은 경로로 보내 조용히 사라지지 않게 한다

## 기여 규칙 요약

상세는 [CONTRIBUTING.md](CONTRIBUTING.md) 와 [CLAUDE.md](CLAUDE.md).

- main 직접 push 금지. `feature/*`·`fix/*` → PR → **스쿼시 머지만**
- 커밋 메시지·PR 제목은 **영어**, Conventional Commits (`feat:` `fix:` `docs:` `chore:` …)
- 용어는 [CONTEXT.md](CONTEXT.md) 의 캐노니컬만 (뽀모 ○ / 뽀모도로 ✕)
- 렌더되는 UI 에 이모지 금지 — 아이콘은 lucide-react, 도메인 심볼은 토큰 기반 커스텀 SVG
- 시각 값은 토큰 이름으로만. 토큰에 없는 값이 필요하면 ADR 이 먼저다
- `docs/origin/` 은 어떤 방법으로도 수정하지 않는다 (도구 레벨로 차단돼 있다)
