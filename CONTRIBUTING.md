# 브랜치 전략 및 릴리즈 규칙

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

### 2. 릴리즈

1. main이 배포 가능한 상태일 때 `release/X.Y` 브랜치를 main에서 생성
2. `vX.Y.0` 태그를 release 브랜치에서 생성 후 push
   - `git push origin release/X.Y --tags`
3. 태그 push가 GitHub Actions 릴리즈 워크플로우를 트리거함

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
- **커밋 메시지는 제목·본문 전부 영어로만 작성** (인코딩 깨짐 방지). PR 제목도 영어.
- release 브랜치의 백포트 커밋에는 `(cherry picked from commit <hash>)` 표기

## 금지 사항

- main, release/* 브랜치에 직접 commit/push
- release 브랜치에 feat 커밋 추가
- 스쿼시 머지 외의 머지 방식 (merge commit, rebase merge 금지)
- 태그를 main에 직접 생성 (태그는 항상 release 브랜치에서)
- 사용자 확인 없이 태그 push (태그 push = 배포 트리거이므로)

---

## 강제화 계층 (이 규칙이 실제로 막히는 위치)

| 층 | 대상 | 수단 | 상태 |
|---|---|---|---|
| Claude 하네스 | Claude 의 git/gh 명령 | [.claude/hooks/protect-git-flow.sh](.claude/hooks/protect-git-flow.sh) (PreToolUse) | ✅ 적용됨 |
| 로컬 git | 사람이 치는 commit/push | husky + commitlint + ESLint | ✅ 적용됨 ([ADR-016](docs/architecture/decisions/adr-016-lint-and-git-hooks.md)) |
| GitHub 서버 | 모든 클라이언트 (최종 방어선) | branch ruleset + squash-only | ⏸ 설정 명령은 아래 |

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
