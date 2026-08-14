# 브랜치 전략 및 릴리스 규칙

이 레포는 GitLab Flow 변형(main + release 브랜치)을 따른다.
아래 규칙을 모든 git 작업에서 엄격히 준수할 것.

## 브랜치 구조

- `main`: 항상 최신 개발 상태. 직접 push 금지. 모든 변경은 PR을 통해서만 머지.
- `release/X.Y`: 배포 버전의 유지보수 라인. main에서 분기. 새 기능 절대 금지, 버그 수정만 허용.
- `feature/설명`: 기능 개발. main에서 분기.
- `fix/설명`: 버그 수정. main에서 분기 (upstream first 원칙).

## 작업 흐름

### 1. 기능 개발

1. `main`에서 `feature/kebab-case-설명` 브랜치 생성
2. 작업 후 PR 생성 (base: main)
3. **스쿼시 머지만 사용** (`gh pr merge --squash`)
4. PR 제목이 main의 커밋 메시지가 되므로, PR 제목은 반드시
   Conventional Commits 형식 (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`)
5. 머지 직후 feature 브랜치 삭제 (로컬 + 원격 모두)
   - 스쿼시 머지된 브랜치는 절대 재사용하지 않는다

### 2. 릴리스

0. **리허설을 먼저 돌린다.** [release.yml](.github/workflows/release.yml) 을 GitHub Actions
   에서 `workflow_dispatch` 로 실행해 `.dmg` 가 만들어지는 것을 확인한다.
   이 단계를 건너뛰면 첫 릴리스를 검증하는 방법이 **"태그를 달아 보는 것"** 뿐이고,
   실패하면 이미 밀어 버린 태그를 지우는 일부터 하게 된다. 리허설은 업로드하지 않고
   아티팩트만 남긴다.
1. main이 배포 가능한 상태일 때 `release/X.Y` 브랜치를 main에서 생성
2. **태그를 자르기 전에 `docs/release-notes/<X.Y.Z>.md` 가 그 release 브랜치에 있어야 한다.**
   이 파일이 곧 릴리스 본문이다 — 형식은
   [.claude/skills/release-notes/SKILL.md](.claude/skills/release-notes/SKILL.md).
   main 에 PR 로 넣고 release 브랜치로 cherry-pick 한다.
3. `vX.Y.Z` 태그를 release 브랜치에서 생성 후 push
   - `git push origin release/X.Y --tags`
4. 태그 push가 GitHub Actions 릴리스 워크플로우를 트리거함
5. 워크플로가 릴리스를 **draft 로** 만든다. 산출물과 노트를 확인한 뒤 사람이 publish 한다 —
   태그를 미는 것과 남에게 보이는 것 사이에 한 칸을 둔다.
   - **노트는 손으로 붙여 넣지 않는다.** `Resolve release notes` 스텝이 그 버전의 파일을
     찾아 `body_path` 로 넘기고, GitHub 이 자동 생성한 커밋 목록이 그 **아래**에 붙는다.
     사람이 하는 일은 확인과 publish 뿐이다.
   - **파일이 없으면 빌드 전에 잡이 죽는다.** 릴리스 객체도 draft 도 만들어지지 않으므로
     바깥으로 나간 것이 없다. 복귀선이 노트에 도달하지 않는 상태로 publish 되는 일을
     구조적으로 막는 자리다
     ([ADR-032](docs/architecture/decisions/adr-032-destructive-migration-safety.md)).
6. 태그를 이미 밀었는데 빌드가 깨졌다면 **태그를 옮기지 않는다.** 받은 사람의 이력이
   깨진다. 고쳐서 다음 패치 버전으로 낸다.
   - **예외는 하나다 — 릴리스가 만들어지지 않은 경우.** 노트 파일 누락으로 잡이 죽으면
     릴리스도 에셋도 생성되지 않았으므로 받은 사람이 없다. 이때는 노트를 넣고 그 태그를
     지운 뒤 다시 자른다.

### 3. 핫픽스 (upstream first 원칙)

배포 버전에서 버그 발견 시:

1. **먼저 버그가 main에도 존재하는지 확인**하고 결과를 보고할 것
2. main에 존재하면:
   1. `main`에서 `fix/설명` 브랜치 생성 → 수정 → PR → 스쿼시 머지
   2. 머지된 커밋을 해당 `release/X.Y`에 cherry-pick
   3. 패치 버전 태그 (`vX.Y.Z`) 생성 후 push
3. main에 존재하지 않으면 (구버전에만 있는 버그):
   - `release/X.Y`에서 직접 수정, main에는 반영하지 않음
4. 여러 release 브랜치에 영향이 있으면 **최신 버전부터 역순으로** cherry-pick

### 4. cherry-pick 충돌 시

1. 충돌 발생 시 즉시 작업을 멈추고 충돌 내용과 원인을 보고할 것
2. 해결 방향을 사용자와 합의 후 진행:
   - 수동 해결 (release 버전의 코드 구조에 맞게 수정 의도를 이식)
   - 또는 백포트 (cherry-pick abort 후 release 브랜치에서 새로 수정,
     커밋 메시지에 원본 커밋 해시 참조 명시)
3. 임의로 충돌을 해결하고 진행하지 않는다

## 커밋 규칙

- Conventional Commits 형식, husky + commitlint가 검사함
- **커밋 메시지는 제목·본문 전부 영어로만 작성** (인코딩 깨짐 방지)
- **PR 제목과 본문도 둘 다 영어다.** 스쿼시 머지에서 PR 제목은 main 커밋 제목이, **PR 본문은 main 커밋 본문이** 된다 — 둘 다 히스토리에 남는다
- release 브랜치의 백포트 커밋에는 `(cherry picked from commit <hash>)` 표기

### 한국어 인용은 백틱 안에서만

[CONTEXT.md](CONTEXT.md) 가 도메인 용어와 UI 문구를 한국어로 정했으므로, 무엇을 바꿨는지
쓰려면 인용이 필요하다. **인용하는 한국어는 백틱으로 감싼다.**

| 대상 | 기준 |
|---|---|
| 커밋 제목·본문 | 한글 0건 (commitlint `no-hangul` 은 예외를 두지 않는다) |
| PR 제목 | 한글 0건 — 한 줄짜리 제목에 인용이 낄 자리가 없다 |
| PR 본문 | 백틱 **밖**의 한글 0건. 코드 스팬·펜스 블록 안은 허용 |

```
○  Reusing `예산을 정하면 예산 대비 소진이 보여요` would say something false.
✕  ## 무엇을 하는 PR인가
✕  ## P1 — + 오늘로 now does what it says      → `+ 오늘로` 로 감싼다
```

## 금지 사항

- main, release/* 브랜치에 직접 commit/push
- release 브랜치에 feat 커밋 추가
- 스쿼시 머지 외의 머지 방식 (merge commit, rebase merge 금지)
- 태그를 main에 직접 생성 (태그는 항상 release 브랜치에서)
- 사용자 확인 없이 태그 push (태그 push = 배포 트리거이므로)
- 노트 파일(`docs/release-notes/<X.Y.Z>.md`) 없이 태그 push
- 릴리스 본문을 손으로 붙여 넣기 (워크플로가 파일에서 넣는다)

---

## 패키징

배포본은 macOS `.dmg` 하나다 (ADR-004 · [ADR-028](docs/architecture/decisions/adr-028-code-signing.md)).

| 명령 | 무엇 | 언제 |
|---|---|---|
| `pnpm build` | `out/` 에 번들만 | 개발·E2E |
| `pnpm dist:dir` | 앱 디렉토리까지 (포장 없음) | 패키징 설정이 맞는지 볼 때. 빠르다 |
| `pnpm dist` | `.dmg` | 릴리스 직전 손 검증 |

산출물은 `release/` 에 생기고 추적하지 않는다.

**개발 모드에서 통과하는 것은 증거가 아니다.** 아래 둘은 asar 아카이브 안으로 들어가는
순간 각자 다른 이유로 깨지며, `pnpm dev` 로는 영영 재현되지 않는다.

- 마이그레이션 `.sql` — Drizzle 마이그레이터가 **실제 디렉토리**를 읽고, `migrate.ts` 가
  그 안의 파일 개수로 스키마 세대를 판정한다. `extraResources` 로 아카이브 밖에 싣고
  앱은 `process.resourcesPath` 로 푼다.
- better-sqlite3 의 `.node` — `dlopen` 은 아카이브 안의 경로를 열지 못한다. `asarUnpack`
  이 밖에 남긴다.

둘 중 하나라도 빠지면 증상이 **똑같다**: 창이 뜨지 않고 시작 실패 대화상자만 뜬다.
구분하려면 대화상자의 메시지를 끝까지 읽어야 한다.

### 앱 아이콘

원본은 `build/icon.png` 다 — **1024×1024, 알파 있음, 아트는 가운데 824×824** 이고 나머지는
투명 여백이다. 꽉 채우면 Dock 에서 이웃 아이콘보다 커 보인다.

`.icns` 는 파생물이라 원본을 바꾼 뒤 다시 만든다.

```bash
./scripts/make-icon.sh
```

## 테스트

러너가 둘이고 **파일이 겹치지 않는다.**

| 러너 | 대상 | 위치 | 명령 |
|---|---|---|---|
| Vitest | 단위·컴포넌트 | `src/**/*.test.{ts,tsx}` · `scripts/**/*.test.mjs` | `pnpm test` |
| Playwright | E2E (실제 앱을 띄운다) | `e2e/**/*.spec.ts` | `pnpm test:e2e` |

[vitest.config.ts](vitest.config.ts) 의 `include` 가 **화이트리스트**(`src/**`·`scripts/**`)라
`e2e/` 는 애초에 Vitest 시야 밖이다. 그래서 어느 쪽에도 `exclude` 를 두지 않는다.

### E2E 실행

```bash
pnpm test:e2e:build
```

처음 실행하거나 소스를 고친 뒤에는 이 명령을 쓴다 — 빌드부터 한다.
이미 빌드해 둔 산출물로 반복 실행할 때는 `pnpm test:e2e` 만 쓰면 된다.
산출물이 없으면 `빌드 산출물이 없습니다: …` 로 멈추고 무엇을 할지 알려준다.

**개발 서버가 아니라 `out/main/index.js` 를 띄운다.** 그 번들이 실제 배포 대상이고,
마이그레이션 폴더 계산이 `out/main/` 기준이라 소스를 직접 실행하면 그 경로가 성립하지 않는다.

**DB 는 매 테스트마다 격리된다.** Electron 이 Chromium 의 `--user-data-dir` 스위치를 존중하므로
픽스처가 넘긴 임시 디렉토리가 `app.getPath('userData')` 가 된다. 그래서 모든 테스트가 순정
첫 실행이고 — 시딩 기본값·첫 실행 동작을 그대로 검증할 수 있다 — **개발용 DB 도 오염되지 않는다.**
브라우저는 내려받지 않는다. Electron 바이너리를 그대로 쓰므로 `playwright install` 이 필요 없다.

### E2E 를 위해 `src/` 를 고치지 않는다

테스트 전용 IPC 채널·전역 훅·`process.env.E2E` 분기를 앱 코드에 만들지 않는다.
**테스트를 위해 프로덕션 코드에 문을 내면 그 문이 배포본에도 남는다.**

관측이 필요하면 화면에 이미 있는 것으로 잡는다 — `aria-label`·역할·텍스트.
`data-testid` 를 새로 심지 않는다. 접근성 이름은 사용자에게도 의미가 있어서
**테스트와 사용자가 같은 것을 보게 된다.**

### 스크린샷은 비교하지 않는다

E2E 는 스크린샷을 `e2e-artifacts/` 에 남기지만 **자동 비교(`toHaveScreenshot`)는 하지 않는다.**
폰트 렌더링이 OS 마다 달라 macOS 로컬 베이스라인과 ubuntu 결과가 일치하지 않고,
상시 실패하는 테스트는 곧 무시된다. 비교는 사람이 한다.

### E2E 는 아직 CI 에서 돌지 않는다 (보류)

**로컬 전용이다.** 커밋 전에 직접 돌려야 한다.

이유는 하네스가 아니라 **앱이 Linux 에서 종료되지 않는 것**이다. 러너에서도 단언은 전부
통과한다 — 앱이 뜨고 카드 3장이 렌더된다. 그 다음 `app.quit()` 에 프로세스가 반응하지 않고
`exit` 이벤트조차 오지 않아 teardown 이 30초를 넘긴다. macOS 에서는 1초 안에 죽는다.

세션 버스 부재(`dbus-run-session` 으로 오류는 사라졌으나 멈춤은 그대로), 실행 중 Electron
바이너리 다운로드(정상 동작이다), CDP 응답 유실(종료와 경쟁시켜도 동일) 세 가지를 실측으로
기각했다. 상세는 [ci.yml](.github/workflows/ci.yml) 의 보류 주석에 있다.

**강제 kill 로 초록을 만들지 않는다.** Linux 는 배포 대상 OS 이고(PRODUCT.md), 거기서 앱이
안 죽는다는 사실을 CI 초록으로 덮는 것이 된다. 종료 경로를 고치면 ci.yml 의 주석 처리된
세 스텝을 되살린다.

## 강제화 계층 (이 규칙이 실제로 막히는 위치)

| 층 | 대상 | 수단 | 상태 |
|---|---|---|---|
| Claude 하네스 | Claude 의 git/gh 명령 | [.claude/hooks/protect-git-flow.sh](.claude/hooks/protect-git-flow.sh) (PreToolUse) | ✅ 적용됨 |
| 로컬 git | 사람이 치는 commit/push | husky + commitlint + ESLint | ✅ 적용됨 ([ADR-016](docs/architecture/decisions/adr-016-lint-and-git-hooks.md)) |
| GitHub Actions | **PR 제목·본문의 언어** | [pr-language.yml](.github/workflows/pr-language.yml) → [scripts/check-pr-language.mjs](scripts/check-pr-language.mjs) | ✅ 적용됨 |
| GitHub Actions | **타입체크·린트·서식·단위 테스트·빌드** | [ci.yml](.github/workflows/ci.yml) | ✅ 적용됨 |
| GitHub Actions | E2E | [ci.yml](.github/workflows/ci.yml) (주석 처리됨) | ⏸ 보류 — 아래 사유 |
| GitHub 서버 | 모든 클라이언트 (최종 방어선) | branch ruleset + squash-only | ⏸ 설정 명령은 아래 |

**CI 층이 따로 필요한 이유** — `commit-msg` 훅은 **로컬 커밋만** 본다. 스쿼시 머지 커밋의
본문은 GitHub 이 PR 본문으로 서버에서 조립하므로 훅이 물리적으로 닿지 못한다. 실제로
PR #2~#15 는 로컬 커밋이 전부 영어였는데도 이 경로로 한국어 본문을 main 히스토리에 남겼다.
검사기를 고칠 때는 `scripts/check-pr-language.test.mjs` 를 함께 고친다 (`pnpm test scripts/`).

- 하네스 훅 판정: main 에서의 커밋·머지·태그·push 는 **차단(deny)**, release 브랜치의 커밋·push 와 태그 push 는 **사용자 확인(ask)** — 백포트/배포는 정당한 플로우일 수 있어 사람이 판단한다.
- 예외: 레포에 커밋이 하나도 없는 부트스트랩 시점에는 최초 커밋을 main 에 허용한다.
- 로컬 훅은 `--no-verify` 로 우회 가능하므로 GitHub 서버 설정이 유일한 진짜 강제다.

### 로컬 훅 구성 (설치 완료 — `pnpm install` 하면 자동 활성화)

husky 는 `prepare` 스크립트로 설치되므로 저장소를 클론해 `pnpm install` 만 하면 훅이 걸린다.
별도 명령이 필요 없다. 훅은 세 개다.

| 훅 | 하는 일 | 걸리면 |
|---|---|---|
| `pre-commit` | 스테이지된 파일을 Prettier 로 포맷한 뒤 `.ts`·`.tsx` 에 ESLint (lint-staged) | 서식은 **자동으로 고쳐지고**, ADR 아키텍처 규칙 위반은 커밋이 차단된다 |
| `commit-msg` | commitlint — Conventional Commits + 한글 금지 | 형식·언어 위반 시 커밋 거부 |
| `pre-push` | `main`·`release/*` 직접 push 차단 | 브랜치를 바꿔 PR 로 진행 |

역할이 나뉘어 있다. **서식은 Prettier 단독**이 정하고 커밋 시 자동으로 고쳐지므로 신경 쓸
필요가 없다 ([ADR-017](docs/architecture/decisions/adr-017-prettier.md)). **ESLint 는 서식을
보지 않고 ADR 이 정한 아키텍처 규칙만** 본다 — `src/shared/` 순수성, DB 라이브러리 격리,
`new Date()` 초크포인트, UI 이모지 금지 ([ADR-016](docs/architecture/decisions/adr-016-lint-and-git-hooks.md)).
그래서 ESLint 에 걸리면 자동으로 고쳐지지 않고 **사람이 판단해서 고쳐야 한다.**

마크다운과 `docs/` 는 포매팅하지 않는다 — Prettier 가 표 셀을 글자 수로 패딩해서 한글 표가
오히려 어긋난다. 문서 서식은 사람이 지킨다.

**훅은 테스트를 돌리지 않는다.** 타입체크·단위 테스트·빌드·E2E 를 자동으로 돌리는 곳은
[ci.yml](.github/workflows/ci.yml) 하나뿐이다. 커밋이 빨라야 하는 자리(pre-commit)에
수십 초짜리 검사를 넣지 않는 대신, PR 이 그 검사를 통과하지 못하면 머지되지 않는다.

수동 실행:

```bash
pnpm lint && pnpm format:check
```

> 로컬 훅은 `--no-verify` 로 우회된다. 실수 방지 장치이지 강제 수단이 아니다 —
> 진짜 강제는 아래 GitHub 서버 설정이다.

### GitHub 서버 설정 (1회, 저장소 관리자)

```bash
# 스쿼시 머지만 허용
gh api -X PATCH repos/easyDong19/dongmodoro \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F squash_merge_commit_title=PR_TITLE -F squash_merge_commit_message=PR_BODY

# main 보호: PR 필수, 직접 push/force push/삭제 차단
gh api -X POST repos/easyDong19/dongmodoro/rulesets --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"] } },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ]
}
JSON

# release/* 보호: force push/삭제 차단 (cherry-pick push 는 허용)
gh api -X POST repos/easyDong19/dongmodoro/rulesets --input - <<'JSON'
{
  "name": "protect-release",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/release/**"], "exclude": [] } },
  "rules": [ { "type": "non_fast_forward" }, { "type": "deletion" } ]
}
JSON
```
