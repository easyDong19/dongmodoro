# ADR-016: 규칙 강제 — ESLint 아키텍처 규칙 + husky/commitlint

- 상태: accepted (2026-08-05)
- 관계: 어떤 결정도 뒤집지 않는다. [ADR-008](adr-008-code-structure.md) ·
  [ADR-009](adr-009-time-format-convention.md) · [ADR-015](adr-015-repository-ports.md) 이
  이미 정한 규칙의 **강제 수단**을 정한다. ADR-015 §2 가 "코드 리뷰 관찰 지점"이라 적은
  것을 기계 검사로 승격한다. [CONTRIBUTING.md](../../../CONTRIBUTING.md) 강제화 계층 표의
  "로컬 git" 층을 채운다.

## Context

기존 ADR 들이 정한 규칙 중 다수는 **어겨도 즉시 아프지 않고, 나중에 크게 아픈** 종류다.

| 규칙 | 출처 | 어겼을 때 |
|---|---|---|
| `src/shared/` 는 순수 TS (Node·DOM API 금지) | ADR-008 | main·renderer 양쪽에서 공유 불가능해짐 — 발견은 빌드가 깨지는 먼 시점 |
| Drizzle·better-sqlite3 import 는 `src/main/db/` 하위만 | ADR-015 §2 | 서비스가 DB 에 직결되어 포트 패턴이 형해화 |
| `new Date()` 는 `src/shared/time/` 안에서만 | ADR-009 §3 | 시간 초크포인트가 뚫려 날짜 버그의 출처 추적 불가 |
| 렌더되는 UI 에 이모지 금지 | 프로젝트 CLAUDE.md | 아이콘 체계 붕괴 |

이들의 공통점은 **위반이 기계적으로 판별 가능**하다는 것이다. 사람의 리뷰에 맡길 이유가
없고, 리뷰에 맡기면 반드시 새어 나간다.

한편 커밋 규칙(Conventional Commits, 영어 전용)과 브랜치 규칙은 이미
CONTRIBUTING.md 가 정했고, 강제화 계층 표에서 "로컬 git" 층이 `⏸ 스캐폴딩 후 설정`
상태로 비어 있었다. 스캐폴딩(M1 Task 1)이 끝나 그 조건이 충족됐다.

도입 시점을 M1 초반으로 당긴 이유: 코드가 134줄인 지금 규칙을 켜면 소급 수정이 0 이고,
특히 `new Date()` 규칙은 **그 초크포인트를 만드는 Task 2 보다 먼저** 존재해야 규칙과
구현이 같이 태어난다.

## Decision

1. **린터는 ESLint(flat config) + typescript-eslint 로 하고, 주목적은 위 표의 아키텍처
   규칙 강제다.** `no-restricted-imports` · `no-restricted-syntax` 를 경로별로 적용한다.
   위반은 **error** 이며 경고로 낮추지 않는다 — 경고는 읽히지 않는다.
2. **포매터(Prettier)는 지금 도입하지 않는다.** 1인 개발이라 스타일 충돌 비용이 아직 없고,
   포매터를 넣으면 전 파일 리포맷 커밋이 발생해 초기 히스토리가 지저분해진다. 협업자가
   생기거나 스타일 논쟁이 실제로 발생하면 그때 별도 ADR 로 재검토한다.
3. **git 훅은 husky 로 관리하고 3개를 둔다.**
   - `commit-msg` — commitlint (`@commitlint/config-conventional`). 커밋 메시지가 영어인지는
     기계가 판별하기 어려우므로 **한글 포함 여부만** 커스텀 규칙으로 막는다.
   - `pre-commit` — lint-staged 로 **스테이지된 파일만** ESLint. 전체 검사는 느려서
     우회를 유도한다.
   - `pre-push` — `main`·`release/*` 직접 push 차단 (CONTRIBUTING.md 스니펫).
4. **타입 검사·테스트는 훅에 넣지 않는다.** 이 프로젝트의 계획은 태스크마다 커밋하므로
   커밋 빈도가 높고, 매 커밋마다 전체 typecheck·test 를 돌리면 커밋이 작업 흐름을 끊는다.
   그 둘은 push 전·PR 에서 본다.
5. **로컬 훅은 최종 방어선이 아니다.** `--no-verify` 로 우회되므로 실수 방지 장치로만
   취급한다. 진짜 강제는 GitHub branch ruleset 이며 그것은 별도 항목으로 남아 있다
   (CONTRIBUTING.md 강제화 계층 표).
6. **TypeScript 는 6.x 라인에 고정한다.** 스캐폴딩 시 `latest` 를 잡아 7.0.2(네이티브
   포트)가 설치됐는데, **typescript-eslint 가 TS 7 을 지원하지 않는다** — 설치 즉시
   `typescript-eslint does not support TS 7.0` 로 실행이 중단된다
   ([tracking issue](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
   6.0.3 은 안정 릴리즈이고 계획의 버전 플로어(≥ 5.6)를 충족하며, 이 저장소의 코드는
   TS 7 고유 기능을 쓰지 않는다. typescript-eslint 가 TS 7 을 지원하면 재검토한다.

## Consequences

- (+) ADR-008/009/015 의 핵심 규칙이 **리뷰 대상에서 빌드 대상으로** 바뀐다. 특히
  Task 4(DB)·Task 2(시간)에서 규칙과 구현이 동시에 존재하게 된다.
- (+) `pnpm lint` 한 줄이 아키텍처 회귀 검사가 된다. CI 를 붙일 때 그대로 재사용된다.
- (−) 규칙에 걸리는 정당한 예외가 생기면 `eslint-disable` 주석이 필요하다. 그 주석은
  **왜 예외인지 한 줄 사유를 반드시 함께 적는다** — 사유 없는 disable 은 규칙을 무의미하게
  만든다.
- (−) 경로 기반 규칙이라 폴더 구조를 바꾸면 ESLint 설정도 같이 고쳐야 한다. 구조가
  ADR-008 로 고정돼 있어 빈번하진 않을 것으로 본다.
- (−) 이모지 금지는 정규식 검사라 완벽하지 않다 (신규 유니코드 블록 누락 가능). 1차
  방어선으로만 취급하고, 최종 판단은 여전히 사람이 한다.
- (−) TS 6 고정은 **린터 때문에 컴파일러 버전을 붙잡는** 구조라 편치 않은 트레이드오프다.
  다만 TS 7 은 나온 지 얼마 안 된 전면 재작성이라 다른 도구(vitest·drizzle-kit·shadcn)도
  같은 문제를 낼 수 있고, 남은 태스크가 그 도구들을 순차로 도입한다 — 안정 라인에 있는
  편이 이 시점에는 위험이 작다.
- husky 는 `prepare` 스크립트로 설치된다. 이는 **프로젝트 자신의 스크립트**라
  pnpm 의 의존성 빌드 스크립트 차단(ADR-004)과 무관하게 항상 실행된다.
  클론 후 `pnpm install` 만 하면 훅이 활성화되고 별도 명령이 필요 없다.
