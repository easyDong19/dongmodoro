# dongmodoro

월(결과물) → 주(얼마만큼) → 오늘(지금 뭐부터) 3층 계획과 뽀모도로 타이머를
**한 화면에서 끊기지 않게** 잇는 로컬 데스크톱 앱.

> **현재 상태: M2 코어 루프 완료.**
> 오늘 목록에 할 일을 직접 입력하고, 재생을 눌러 집중 세션을 시작하고, 완료되면 세션이
> 기록되며 도트가 올라간다 — 계획과 실행이 한 화면에서 이어지는 최소 경로가 동작한다.
> 주간 계획·정산·마일스톤·달력·반응형 셸·트레이는 아직 없다.
> ([M2 계획](docs/plans/2026-08-07-m2-core-loop.md))
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

계획서는 실행이 끝나도 고치지 않고 이력으로 남긴다. 실행 중에 계획이 틀린 것으로
드러난 지점은 계획서 본문에 갱신 블록으로 표시돼 있다 (예: 네이티브 재빌드 불필요,
리포지토리 페이크 보류).

마일스톤 지도: **M1** 스캐폴딩(완료) → **M2** 코어 루프(완료) → **M3** 주간 계획·정산(다음)
→ **M4** 패키징(electron-builder, macOS 서명·공증, 트레이 세부). M2·M4 사이의 세부 분할은
각 단계 착수 시점에 계획 문서로 추가된다.

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
