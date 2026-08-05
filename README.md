# dongmodoro

월(결과물) → 주(얼마만큼) → 오늘(지금 뭐부터) 3층 계획과 뽀모도로 타이머를
**한 화면에서 끊기지 않게** 잇는 로컬 데스크톱 앱.

> **현재 상태: 앱 코드 0줄.** 기획·설계 문서와 구현 계획까지 완료된 단계이며,
> 다음 작업은 [M1 스캐폴딩](docs/plans/2026-08-04-m1-scaffolding.md)이다.
> 이 저장소의 지금 가치는 코드가 아니라 **결정의 기록**이다.

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

```bash
# M1 완료 후 사용 가능해질 명령 (지금은 package.json 이 없다)
pnpm install
pnpm dev        # 개발 실행
pnpm test       # Vitest
pnpm build      # 프로덕션 빌드
```

## 저장소 구조

```
dongmodoro/
├── PRODUCT.md          # 제품 컨텍스트 — 사용자·목적·포지셔닝·불변 원칙
├── CONTEXT.md          # 도메인 용어집 — 캐노니컬 용어의 유일한 출처
├── CLAUDE.md           # AI 에이전트 작업 규칙 (용어·브랜치·커밋·이모지 금지)
├── CONTRIBUTING.md     # 브랜치 전략 (GitLab Flow 변형, 스쿼시 머지 전용)
└── docs/
    ├── CLAUDE.md       # 문서 작성 규칙 — 폴더별 책임 경계의 정의
    ├── origin/         # ⛔ 원천 초안 (읽기 전용, 구속력 없음)
    ├── features/       # 기능별 확정 기획 (8개 기능 × overview/prd/ux-spec)
    ├── architecture/   # 기술 스택·프로세스 구조 + ADR 15건
    ├── design-system/  # 디자인 토큰·시각 철칙 + ADR 8건 + 와이어프레임
    ├── decision-log/   # 결정 과정의 기록 (기각된 선택지 포함)
    └── plans/          # 구현 계획서 (마일스톤 단위 작업 지시서)
```

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
| [2026-08-04-m1-scaffolding.md](docs/plans/2026-08-04-m1-scaffolding.md) | M1 워킹 스켈레톤 — 태스크 8개. "창이 뜨고, DB 가 열리고, IPC 왕복 1회가 화면에 렌더된다"까지. 기능 코드는 만들지 않는다 |

마일스톤 지도: **M1** 스캐폴딩(다음 작업) → 기능 구현 → **M4** 패키징
(electron-builder, macOS 서명·공증, 트레이 세부). M1·M4 사이의 세부 분할은
각 단계 착수 시점에 계획 문서로 추가된다.

## 문서 읽는 순서

처음 온 사람 기준.

1. [PRODUCT.md](PRODUCT.md) — 무엇을, 누구를 위해, 왜
2. [CONTEXT.md](CONTEXT.md) — 용어. 이걸 건너뛰면 "정산"과 "리뷰"를 섞어 쓰게 된다
3. [docs/features/README.md](docs/features/README.md) — 기능 8개 인덱스. 관심 기능의 overview → prd 순
4. [docs/architecture/overview.md](docs/architecture/overview.md) — 스택·프로세스 구조·미결정 사항
5. [docs/design-system/tokens.md](docs/design-system/tokens.md) — 시각 값의 유일한 출처
6. [docs/design-system/wireframes/v1-wireframe.html](docs/design-system/wireframes/v1-wireframe.html) — 브라우저로 열면 8개 뷰 + 다크/라이트 토글 (구속력 없는 시각 참조)

"왜 이 결정인가"가 궁금해지면 각 문서가 인용하는 ADR → decision-log 순으로 내려간다.

## 기여 규칙 요약

상세는 [CONTRIBUTING.md](CONTRIBUTING.md) 와 [CLAUDE.md](CLAUDE.md).

- main 직접 push 금지. `feature/*`·`fix/*` → PR → **스쿼시 머지만**
- 커밋 메시지·PR 제목은 **영어**, Conventional Commits (`feat:` `fix:` `docs:` `chore:` …)
- 용어는 [CONTEXT.md](CONTEXT.md) 의 캐노니컬만 (뽀모 ○ / 뽀모도로 ✕)
- 렌더되는 UI 에 이모지 금지 — 아이콘은 lucide-react, 도메인 심볼은 토큰 기반 커스텀 SVG
- 시각 값은 토큰 이름으로만. 토큰에 없는 값이 필요하면 ADR 이 먼저다
- `docs/origin/` 은 어떤 방법으로도 수정하지 않는다 (도구 레벨로 차단돼 있다)
