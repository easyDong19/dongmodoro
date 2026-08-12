# dongmodoro

주 → 오늘 계획과 뽀모도로 타이머를 한 화면에 둔 macOS 데스크톱 앱. 로컬 전용이고
로그인도 동기화도 없다. 현재 버전은 `v1.0.0`.

## 왜 만들었나

AI 에게 일을 시키면서 탭을 여러 개 띄워두고 여러 작업을 동시에 굴렸더니 주의력이
갈렸다. 하나에 붙어 있는 시간이 짧아졌다. 여기에 계획 도구(노션·투두)와 타이머가
따로 노는 것이 겹쳤다 — 하루를 시작할 때마다 둘 사이를 왕복했고 그 왕복이 계획
자체를 부담으로 만들었다.

집중을 끌어올리려고 내가 쓸 앱을 직접 만들었다. 그래서 성공 기준도 소진량이나
달성률이 아니라 **계획과 실행이 한 화면에서 이어지는 것** 하나다.

## 기능

- **주간 계획** — 이번 주에 얼마만큼 할지를 뽀모 개수로 잡고 요일에 배치한다.
  숫자가 처음 등장하는 층이다.
- **오늘 목록** — 지금 뭐부터 할지만 답한다. 새로 적지 않고 주간 풀에서 가져오기만
  한다.
- **뽀모도로 타이머** — 오늘 목록에서 골라 바로 돌린다. 기록한 세션은 주간 카드의
  진행으로 되돌아온다.
- **주간 정산** — 주가 끝나면 남은 항목을 화면 하나에서 이월·폐기로 처분한다. 몇 주
  비우고 돌아와도 화면은 하나이고 항목 수만 늘어난다.
- **뽀모 길이·가용량 편집** — 정산 패널의 `조정` 에서 바꾼다. 진행 중인 주의 분모는
  흔들리지 않고 다음 주부터 효력을 갖는다.
- **다크·라이트 전환** — 테마 주인이 OS 가 아니라 앱이다. 첫 페인트부터 고른 테마로
  뜬다.

월 마일스톤과 달력은 `1.1.0`·`1.2.0` 으로 미뤘다. 범위는 [PRODUCT.md](PRODUCT.md) 가
소유한다.

동작을 지탱하는 규칙 세 가지.

- 1뽀모 = focus 세션 1회 완료이며 **길이와 무관하다.** 길이를 바꿔도 과거 기록이
  재해석되지 않는다.
- **소진량을 저장하지 않는다.** 모든 진행 표시는 세션에서 위로 파생된다. 두 화면이
  다른 숫자를 말할 수 없다.
- **막는 화면이 없다.** 예산을 넘겨도 계획 확정은 성공한다. 사실만 보여주고 판단은
  사용자가 한다.

## 설치 (macOS, Apple Silicon)

[Releases](https://github.com/easyDong19/dongmodoro/releases) 에서 `.dmg` 를 받아
`dongmodoro.app` 을 응용 프로그램 폴더로 옮긴다.

**첫 실행은 막힌다.** 앱이 깨진 것이 아니라 macOS 가 내려받은 미공증 앱을 기본으로
차단하는 것이다. 서명은 유료 개발자 계정이 있어야 해서 만드는 사람과 쓰는 사람이 같은
동안에는 받지 않기로 했다
([ADR-028](docs/architecture/decisions/adr-028-code-signing.md)). 격리 속성을 지우면
열리고 **한 번만** 하면 된다.

```bash
xattr -dr com.apple.quarantine /Applications/dongmodoro.app
```

## 개발

Node 22 LTS 이상, 패키지 매니저는 pnpm 만 쓴다
([ADR-004](docs/architecture/decisions/adr-004-packaging-deploy.md)) — npm·yarn 으로
설치하면 네이티브 모듈 빌드 허용 설정이 적용되지 않는다.

```bash
pnpm install
pnpm dev          # 개발 실행 (창이 뜬다)
pnpm test         # Vitest
pnpm typecheck    # main·renderer 두 tsconfig 를 각각 검사
pnpm lint         # ESLint — 아키텍처 경계 규칙 포함
pnpm build        # 프로덕션 빌드 (out/)
```

스택은 Electron + electron-vite + React 19 + TypeScript strict / better-sqlite3 +
drizzle-orm / zod 검증 IPC / TanStack Query / Tailwind CSS v4 + shadcn/ui / Vitest.
고른 이유는 전부 [ADR](docs/architecture/decisions/) 에 있다 — 스택이 코드보다 먼저
결정된 프로젝트다.

커밋하면 husky 훅이 서식·린트·커밋 메시지 형식을 검사한다. `--no-verify` 로 우회하지
않는다. 폴더 경계도 문서가 아니라 ESLint 가 강제한다 — `src/shared/` 가 Node·DOM 을
import 하거나, `src/main/db/` 밖에서 Drizzle 을 부르거나, 시간 모듈 밖에서 `new Date()`
를 쓰면 lint 가 실패한다.

## 문서

이 저장소는 코드보다 결정의 기록이 크다. 처음 온 사람 기준 순서.

1. [PRODUCT.md](PRODUCT.md) — 무엇을, 누구를 위해, 왜
2. [CONTEXT.md](CONTEXT.md) — 용어. 건너뛰면 `정산` 과 `리뷰` 를 섞어 쓰게 된다
3. [docs/features/README.md](docs/features/README.md) — 기능별 확정 기획
4. [docs/architecture/overview.md](docs/architecture/overview.md) — 스택·프로세스 구조
5. [docs/CLAUDE.md](docs/CLAUDE.md) — 문서 폴더별 책임 경계

문서끼리 충돌하면 순서가 정해져 있다. `docs/origin/` 의 초안은 항상 지고
`docs/features/` 의 확정 기획이 이긴다. 시각 판단은
[design-system/principles.md](docs/design-system/principles.md) 가 기능 문서를 이긴다.
`docs/plans/` 는 결정을 만들지 않고 참조만 한다. 결정이 뒤집히면 기존 ADR 을 고치지 않고
superseded 표기 후 새 ADR 을 쌓는다.

코드부터 보는 편이 빠르면 `src/shared/ipc/contracts.ts` (프로세스 사이를 오가는 것의
정의) → `src/main/ipc/handle.ts` (모든 IPC 가 지나는 한 지점) →
`src/main/db/schema.ts` (테이블 7개, CHECK 44개) → `src/main/index.ts` (부팅 순서와
실패 처리) 순으로 짧다.

기여 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md), 에이전트 작업 규칙은
[CLAUDE.md](CLAUDE.md).
