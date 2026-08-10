# dongmodoro

## 도메인 용어는 [CONTEXT.md](CONTEXT.md) 를 따른다

- 문서·코드·UI 카피를 쓰기 전에 [CONTEXT.md](CONTEXT.md) 를 읽는다.
  캐노니컬 용어만 쓰고 각 항목의 `_Avoid_` 표기는 쓰지 않는다.
  (예: 정산 ○ / 리뷰 ✕, 뽀모 ○ / 뽀모도로 ✕, 할 일 ○ / 작업·태스크 ✕)
- 용어를 새로 정하거나 기존 정의를 바꾸는 결정은 **같은 PR 에서 CONTEXT.md 를 갱신**한다.
- `docs/origin/`·`docs/decision-log/` 의 과거 기록은 용어를 소급 수정하지 않는다.

## 기획 문서 작성 규칙

기획·설계 작업의 **계획을 짤 때는 반드시 [docs/CLAUDE.md](docs/CLAUDE.md)를 먼저 읽고 그 규칙을 따른다.**

해당 문서에는 다음이 정의되어 있다:

- 기능별 기획 문서 묶음 구조 (`docs/features/<feature-name>/` + `overview.md` 진입점)
- Phase 0(분석·승인) → Phase 1(계획) → Phase 2(기능별 생성) → Phase 3(인덱스·검증) 진행 순서
- 문서별 책임 경계와 "문서 분리 신호" (선택 문서를 만들 기준)
- overview.md / prd.md / meta.yaml 템플릿
- Phase 3 Harness 체크리스트와 금지사항

특히 **Phase 0에서 기능 목록·폴더명·문서 세트에 대한 사용자 승인을 받기 전에는 어떤 파일도 생성하지 않는다.**

## `docs/origin/` 은 읽기 전용이다 — 단, 절대 기준이 아니라 초안이다

`docs/origin/` 안의 파일(PRD·시안)은 **초안·개념 스케치**다. 이력 보존을 위해
**읽기만 가능하고 수정·생성·삭제·이동은 금지**하지만, 내용이 확정 명세는 아니다.
설계 결정이 origin 의 내용과 어긋나도 된다 — **확정 기준은 `docs/features/` ·
`docs/architecture/` 의 기획·설계 문서**이며, origin 과 충돌하면 그쪽이 이긴다.
셸을 통한 우회 수정도 금지다. 상세 규칙은 [docs/CLAUDE.md](docs/CLAUDE.md#-docsorigin--원천-데이터-읽기-전용) 참조.

이 규칙은 [.claude/settings.json](.claude/settings.json) 의 `permissions.deny` 와 `PreToolUse` 훅으로 도구 레벨에서 강제된다.

## UI 에 이모지 금지 — 아이콘 컴포넌트만

렌더되는 UI(라벨·배지·버튼·카피)에 이모지를 쓰지 않는다. 아이콘은 **lucide-react
컴포넌트**, lucide 에 없는 도메인 심볼(뽀모 도트 등)은 토큰 기반 커스텀 SVG/CSS 로 만든다.
상세 규칙: [docs/design-system/principles.md §6](docs/design-system/principles.md).
초안 문서 속 🍅 등은 문서용 속기일 뿐 구현 지시가 아니다.

## 커밋 메시지와 PR 은 무조건 영어로 작성한다

- 커밋 메시지의 **제목·본문 전부 영어만** 사용한다. 한국어 금지 — 환경에 따라 인코딩이 깨져 히스토리를 읽을 수 없게 된다.
- **PR 제목과 본문 둘 다 영어다.** 스쿼시 머지 시 PR 제목은 main 커밋 제목이 되고 **PR 본문은 main 커밋 본문이 된다** — 둘 다 히스토리에 그대로 남는다.
- Conventional Commits 형식: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`

### 한국어 인용은 백틱 안에서만

도메인 용어와 UI 문구는 [CONTEXT.md](CONTEXT.md) 가 한국어로 정했으므로, 무엇을 바꿨는지 쓰려면 인용이 필요하다. **인용하는 한국어는 백틱으로 감싼다.**

- 본문: 백틱 **밖**의 한글은 금지, 백틱 안(코드 스팬·펜스 블록)은 허용.
  - ○ `` Reusing `예산을 정하면 예산 대비 소진이 보여요` would say something false. ``
  - ✕ `## 무엇을 하는 PR인가`
  - ✕ `## P1 — + 오늘로 now does what it says` → 백틱을 씌워 `` `+ 오늘로` `` 로 쓴다
- **제목은 인용 예외가 없다** — 한 줄짜리 Conventional Commits 제목에 인용이 낄 자리가 없다.

### 강제 장치가 두 겹인 이유

| 경로 | 검사 |
|---|---|
| 로컬 커밋 | `commit-msg` 훅 → commitlint `no-hangul` (한글 0건) |
| 스쿼시 머지 커밋 | **CI** [`pr-language.yml`](.github/workflows/pr-language.yml) → [`scripts/check-pr-language.mjs`](scripts/check-pr-language.mjs) |

훅은 **로컬 커밋만** 본다. 스쿼시 머지 커밋의 본문은 GitHub 이 PR 본문으로 서버에서 조립하므로 훅이 물리적으로 닿지 못한다. PR #2~#15 가 이 틈으로 한국어 본문을 main 히스토리에 남겼고, CI 가 그 틈을 막는다. 검사기를 고칠 때는 `scripts/check-pr-language.test.mjs` 를 함께 고친다.

## 브랜치 전략 (GitLab Flow 변형)

모든 git 작업은 **[CONTRIBUTING.md](CONTRIBUTING.md) 의 규칙을 엄격히 따른다.** 요약:

- main·release/* 직접 commit/push 금지. main 반영은 `feature/*`·`fix/*` → PR → **스쿼시 머지만** (`gh pr merge --squash`).
- PR 제목 = main 커밋 메시지 → Conventional Commits 형식 필수. 머지 후 브랜치 삭제, 재사용 금지.
- release/* 는 버그픽스 백포트(cherry-pick)만. feat 금지. 태그는 release 브랜치에서만 생성.
- **태그 push = 배포 트리거.** 사용자 확인 없이 push 하지 않는다.
- 핫픽스는 upstream first: main 존재 여부 먼저 확인·보고 → main 수정 → release 로 cherry-pick.
- cherry-pick 충돌 시 즉시 멈추고 보고. 임의 해결 금지.

이 규칙은 `PreToolUse` 훅([.claude/hooks/protect-git-flow.sh](.claude/hooks/protect-git-flow.sh))으로 도구 레벨에서 강제된다. 차단(deny)·확인(ask) 판정을 받으면 우회하지 말고 규칙에 맞는 경로로 다시 수행한다.
