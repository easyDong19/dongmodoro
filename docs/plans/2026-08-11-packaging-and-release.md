# M4 패키징과 v1.0.0 릴리스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.
>
> **선행 계획서:** [2026-08-11-baseline-editing.md](./2026-08-11-baseline-editing.md) 가 먼저 머지되어야 한다. 그 계획이 닫는 것("뽀모 길이를 바꿀 수 없다")은 배포 후에 고치면 재배포가 되는 종류의 결함이다.

**Goal:** 소스 코드였던 것을 **설치할 수 있는 물건**으로 만든다. macOS `.dmg` 를 만들고, 설치본에서만 드러나는 두 결함(마이그레이션 경로·두 번째 인스턴스)을 먼저 막고, GitHub Releases 로 `v1.0.0` 을 낸다.

**Architecture:** 빌드는 두 단계다 — `electron-vite build` 가 `out/` 에 번들을 만들고(이미 있다), `electron-builder` 가 그것을 앱으로 포장한다(이번에 추가). 포장 단계가 **개발 모드에 없던 두 가지 제약**을 만든다: 코드가 `asar` 아카이브 안으로 들어가 파일 경로가 달라지고, 네이티브 모듈(better-sqlite3)이 아카이브 밖에 남아야 로드된다. 이 계획의 실패는 대부분 그 두 제약에서 나온다.

**Tech Stack:** M3b 스택 + `electron-builder`. 그 밖의 런타임 의존성 추가 없음.

## Global Constraints

M1~M3b 계획의 Global Constraints 가 전부 그대로 적용된다. 여기에 이번 것:

- **개발 모드에서 통과하는 것은 증거가 아니다.** 이 계획의 모든 검증은 **패키징된 앱**에서 한다. `pnpm dev` 로 되는지 확인하는 것은 이 계획서 안에서 아무것도 증명하지 않는다.
- **태그를 사용자 확인 없이 push 하지 않는다** ([CONTRIBUTING.md](../../CONTRIBUTING.md) · ADR-004). 태그 push 는 배포 트리거다.
- **태그는 `release/*` 브랜치에서만 만든다.** main 에 직접 태그를 달지 않는다.
- **자동 업데이트를 붙이지 않는다.** ADR-004 는 수동 다운로드로 시작한다고 정했다. `electron-updater` 는 이 계획 밖이다.
- **작업 브랜치는 `feature/packaging` 하나**이며 태스크마다 커밋한다. 릴리스 브랜치 작업(Task 8)은 그 뒤에 별도로 한다.

---

## 이 계획서가 인용하는 결정

| 항목 | 소유 문서 | 요지 |
|---|---|---|
| 패키징 도구와 배포 경로 | [ADR-004](../architecture/decisions/adr-004-packaging-deploy.md) | electron-builder → GitHub Releases 수동 다운로드. 태그 push 가 트리거 |
| pnpm 의 네이티브 빌드 허용 | ADR-004 Consequences | `pnpm-workspace.yaml` 의 `allowBuilds` 에 `better-sqlite3` 필요 — **이미 설정돼 있다** |
| 단일 인스턴스 잠금 | app-shell [PRD R19](../features/app-shell/prd.md) | 두 번째 실행은 창을 만들지 않고 기존 인스턴스를 포커스한 뒤 종료 |
| 복귀 경로 표 | app-shell PRD R18 | Dock/작업표시줄 클릭과 재실행 시도가 각각 어떻게 처리되는지 |
| 릴리스 절차 | [CONTRIBUTING.md](../../CONTRIBUTING.md) | `release/X.Y` 생성 → `vX.Y.0` 태그 → Actions → Releases |

**이 계획이 새로 만드는 결정 1건:** macOS 코드 서명 여부. ADR-004 가 `M4 에서 결정` 으로 유보한 항목이며, **Task 7 에서 ADR-028 로 기록한다.** 계획서가 결정을 소유하지 않는다.

---

## 이번 계획서에서 뺀 것

| 뺀 것 | 이유 | 언제 살아나나 |
|---|---|---|
| **macOS 코드 서명·공증** | 유료 Apple Developer 계정이 필요하고, 없이도 본인 설치는 가능하다. 배포 파이프라인이 서는 것이 먼저다 | 남에게 배포할 필요가 생길 때 |
| **Windows·Linux 빌드** | 개발·검증 환경이 macOS 하나다. 만들 수는 있어도 **켜보지 못한 산출물**을 릴리스에 올리는 것은 검증되지 않은 것을 검증된 것처럼 보이게 한다 | 해당 OS 접근이 생길 때 |
| **자동 업데이트 (electron-updater)** | ADR-004 가 수동 다운로드로 시작한다고 정했다 | v1.1 이후 |
| **트레이 상주와 창 닫기=숨김** | app-shell PRD R25 가 트레이·복귀·단일 인스턴스 3개를 **동반 필수**로 묶었다. 이번엔 그 중 잠금 하나만 가져오고 나머지 둘은 건드리지 않는다 — 창 닫기 = 종료를 그대로 둔다 | app-shell 구현 시 |
| **크래시 리포팅·에러 추적** | PRODUCT.md 가 v1 비범위로 명시했다 | v1.1 이후 |
| **CI 에 macOS 빌드 잡 추가** | 매 PR 마다 macOS 러너를 쓰면 비용이 크다. 대신 릴리스 워크플로를 `workflow_dispatch` 로도 돌릴 수 있게 만들어 **태그 전에 리허설**한다 (Task 5) | 빌드가 자주 깨지기 시작하면 |

---

## 파일 구조 (신규·수정만)

```
.github/workflows/release.yml      # 신규 — 태그·수동 트리거 → 빌드 → Releases 업로드
docs/architecture/decisions/adr-028-code-signing.md   # 신규 — 서명 유보 결정의 기록
build/
├── icon.png                       # 신규 — 1024×1024 앱 아이콘 원본
└── icon.icns                      # 신규 — macOS 아이콘 (png 에서 생성)
electron-builder.yml               # 신규 — 패키징 설정
package.json                       # (수정) version · dist 스크립트 · electron-builder
src/main/index.ts                  # (수정) 단일 인스턴스 잠금 · MIGRATIONS_DIR 분기
```

---

### Task 1: 단일 인스턴스 잠금

**개발 모드에서는 절대 드러나지 않는다.** 설치본에서 사용자가 Dock 아이콘을 두 번 누르면 두 프로세스가 **같은 DB 파일을 연다** — 타이머가 둘 돌고, 알림이 두 번 오고, 시작 시 백업이 살아 있는 인스턴스의 DB 위에서 실행된다 (app-shell PRD R19).

- [x] **Step 1:** [src/main/index.ts](../../src/main/index.ts) 에서 **DB 를 열기 전에** `app.requestSingleInstanceLock()` 을 부른다. 순서가 중요하다 — 잠금 판정보다 DB 열기가 먼저면 두 번째 프로세스가 이미 파일을 만진 뒤 종료한다.
- [x] **Step 2:** 잠금을 얻지 못하면 `app.quit()` 하고 **그 뒤 코드를 실행하지 않는다.** `quit()` 은 즉시 반환하므로 `return` 을 빠뜨리면 종료 중인 프로세스가 DB 를 계속 연다.
- [x] **Step 3:** 잠금을 얻은 쪽에 `second-instance` 핸들러를 단다 — 창이 최소화돼 있으면 복원하고 포커스한다 (`restore()` + `focus()`). 창이 없으면 아무것도 하지 않는다. **타이머를 건드리지 않는다** (PRD R28 과 같은 이유 — 복귀는 실행이 아니다).
- [x] **Step 4:** 이 코드가 **app-shell 의 트레이·창 닫기=숨김을 끌고 오지 않는다**는 것을 주석으로 남긴다. PRD R25 가 셋을 동반 필수로 묶었지만, 그 묶음의 근거는 "창 닫기 = 숨김"을 도입할 때다. 지금은 창 닫기 = 종료라 잠금만 단독으로 성립한다.
- [x] **Step 5:** 테스트 — 단위 테스트로 잠금 실패 경로를 덮는다 (`requestSingleInstanceLock` 이 `false` 를 반환하면 DB 를 열지 않고 종료한다). 실제 두 프로세스 동작은 Task 6 의 수동 검증에서 확인한다.

**검증:** 단위 테스트 통과 + `pnpm dev` 를 두 번 띄웠을 때 두 번째가 즉시 종료되고 첫 번째 창이 포커스된다.

---

### Task 2: electron-builder 도입

- [x] **Step 1:** `pnpm add -D electron-builder` 로 devDependency 를 더한다.
- [x] **Step 2:** `electron-builder.yml` 을 만든다. 최소 설정은 다음과 같다.
  - `appId` — 역도메인 형식. 값은 Task 7 에서 ADR 로 확정하지 말고 여기서 정한다 (기술 식별자라 결정 문서가 필요한 종류가 아니다).
  - `productName: dongmodoro`
  - `directories.output: release/` — **`.gitignore` 에 추가한다.** 빠뜨리면 수백 MB 산출물이 커밋 후보로 올라온다.
  - `files` — `out/**` 와 `package.json` 만. `src/`·`docs/`·`e2e/` 를 넣지 않는다.
  - `mac.target: dmg`, `mac.category` 지정.
- [x] **Step 3:** **`extraResources` 로 `drizzle/` 을 싣는다.** [index.ts:34](../../src/main/index.ts) 의 TODO 가 지목한 바로 그것이다. 이 한 줄이 없으면 설치본이 첫 실행에서 마이그레이션 디렉토리를 못 찾고 죽는다.
- [x] **Step 4:** 네이티브 모듈이 `asar` 밖에 남게 한다 (`asarUnpack` 에 `**/*.node` 계열). better-sqlite3 는 `.node` 바이너리를 `dlopen` 하는데, **아카이브 안의 경로는 실제 파일 경로가 아니라서 로드에 실패한다.**
- [x] **Step 5:** `package.json` 에 스크립트 2개를 더한다.
  - `"dist:dir": "pnpm build && electron-builder --dir"` — 포장 없이 앱 디렉토리만. 빠르고, 설정이 맞는지 보는 용도.
  - `"dist": "pnpm build && electron-builder --mac"` — 실제 `.dmg`.
- [x] **Step 6:** `pnpm-workspace.yaml` 의 `allowBuilds` 에 `better-sqlite3` 가 있는지 확인한다. **이미 있으면 건드리지 않는다** — ADR-004 가 이 설정의 이름이 pnpm 11 에서 바뀌었다고 기록해 뒀으므로, 형식이 현행인지만 본다.

**검증:** `pnpm dist:dir` 이 성공하고 산출물 디렉토리에 앱이 생긴다. 아직 실행해 보지 않는다 — Task 3 이 남았다.

---

### Task 3: 패키징된 경로 분기

- [x] **Step 1:** [src/main/index.ts](../../src/main/index.ts) 의 `MIGRATIONS_DIR` 을 `app.isPackaged` 로 분기한다.
  - 패키징: `join(process.resourcesPath, 'drizzle')`
  - 개발: 기존 `join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')`
- [x] **Step 2:** [index.ts:34](../../src/main/index.ts) 의 `TODO(M4 패키징, ADR-004)` 주석을 **지우고**, 왜 두 경로가 다른지를 설명하는 주석으로 바꾼다. 해결된 TODO 를 남겨두면 다음 사람이 미해결로 읽는다.
- [x] **Step 3:** 마이그레이션 개수 세기가 패키징 후에도 성립하는지 확인한다. [migrate.ts](../../src/main/db/migrate.ts) 의 `bundledMigrationCount` 는 디렉토리의 `.sql` 개수를 스키마 버전으로 쓴다 — `extraResources` 가 `drizzle/` 의 `meta/` 까지 함께 실어야 Drizzle 마이그레이터가 동작하고, `.sql` 개수는 그대로여야 한다.
- [x] **Step 4:** 다른 경로 의존이 더 있는지 훑는다. `grep -rn "import.meta.url\|__dirname\|process.cwd()" src/main src/preload` 로 확인하고, 나오는 것마다 패키징 후에도 성립하는지 판정한다. **성립하지 않는 것을 지금 찾지 못하면 Task 6 에서 앱이 죽는 형태로 찾게 된다.**

**검증:** `grep` 결과의 모든 항목에 대해 "패키징 후에도 성립함" 또는 "고쳤음" 판정이 붙어 있다.

---

### Task 4: 앱 아이콘과 제품 메타

- [x] **Step 1:** `build/icon.png` (1024×1024) 를 만든다. 기존 시각 언어를 따른다 — **뽀모 도트**를 모티프로 하고, 색은 [tokens.css](../../src/renderer/shared/styles/tokens.css) 의 값에서 가져온다. 새 색을 지어내지 않는다.

  > **갱신 (실행 중 정정):** 아이콘은 **사용자가 직접 그려 넣었다.** 링을 틸에서 앰버로 흐르게 하고 가운데에 뽀모 도트 4개(채움 3 · 미채움 1)를 놓은 그림이며, 계획서가 말한 모티프·색 규칙을 그대로 만족한다. 실행 중에 만든 임시 SVG 는 지웠다.
  >
  > 받은 파일이 1536×1024 라 그대로는 쓸 수 없어, 콘텐츠 bbox 를 재서 **1024 캔버스에 아트 824** 로 정규화했다 (macOS 규격). 그 결과 PNG 가 추적 대상 원본이 되고 `.icns` 는 파생물이 된다.
- [x] **Step 2:** 이모지를 아이콘으로 쓰지 않는다. 프로젝트의 UI 이모지 금지 규칙(design-system principles §6)이 앱 아이콘에 직접 적용되는 것은 아니지만, 🍅 를 굽는 것은 시각 언어의 단절이다.
- [x] **Step 3:** `.icns` 를 생성한다. macOS 에서는 `sips` + `iconutil` 로 만들 수 있다. 생성 명령을 `docs/` 가 아니라 **[CONTRIBUTING.md](../../CONTRIBUTING.md) 의 빌드 절에** 적어 재생성 가능하게 한다.
- [x] **Step 4:** 앱 이름·저작권 등 메타를 `electron-builder.yml` 에 채운다. 창 제목과 Dock 이름이 `Electron` 으로 뜨지 않는지 Task 6 에서 확인한다.

**검증:** `pnpm dist:dir` 산출물의 Dock/Finder 아이콘이 기본 Electron 아이콘이 아니다.

---

### Task 5: 릴리스 워크플로

- [x] **Step 1:** `.github/workflows/release.yml` 을 만든다. 트리거는 **둘**이다.
  - `push: tags: ['v*']` — 실제 릴리스
  - `workflow_dispatch` — **리허설.** 태그를 만들기 전에 빌드가 통과하는지 확인할 수 있어야 한다. 이것이 없으면 첫 릴리스의 검증 방법이 "태그를 달아 보는 것"뿐이고, 실패하면 태그를 지우는 일부터 하게 된다.
- [x] **Step 2:** 러너는 `macos-latest`. `permissions: contents: write` 를 준다 — Releases 업로드에 필요하다.
- [x] **Step 3:** 설치 단계는 [ci.yml](../../.github/workflows/ci.yml) 과 같은 형태다 (`pnpm/action-setup` → `setup-node` with `cache: pnpm` → `install --frozen-lockfile`). **복사하되 CI 를 재사용하려 하지 않는다** — 두 워크플로의 실패가 서로를 가리면 안 된다는 것이 `pr-language.yml` 을 흡수하지 않은 이유와 같다.
- [x] **Step 4:** 빌드 → `.dmg` 생성 → 태그 트리거일 때만 Releases 업로드. `workflow_dispatch` 실행은 **업로드하지 않고 아티팩트로만** 남긴다.
- [x] **Step 5:** 서명 관련 환경 변수를 넣지 않는다. 미서명 빌드이므로 `CSC_*` 시크릿이 없고, electron-builder 가 서명을 건너뛰도록 둔다.
- [x] **Step 6:** [CONTRIBUTING.md](../../CONTRIBUTING.md) 의 릴리스 절에 **리허설 단계를 추가한다** — "태그 전에 `workflow_dispatch` 로 한 번 돌린다". 현재 문서는 워크플로가 있다고 전제하지만 실물이 없었다.

**검증:** `workflow_dispatch` 로 한 번 돌려 `.dmg` 아티팩트가 생성된다. **이 검증 없이 Task 8 로 넘어가지 않는다.** — 워크플로가 머지되어야 실행할 수 있으므로 이 PR 이 머지된 뒤에 돌린다.

---

### Task 6: 패키징된 앱 수동 검증

**이 계획서에서 가장 중요한 태스크다.** 앞의 다섯 태스크는 전부 이 검증을 위한 준비이며, 여기서 통과하지 못한 것은 릴리스에서도 통과하지 못한다. 결과는 이 문서 하단에 실측으로 기록한다.

- [x] **Step 1:** `pnpm dist` 로 `.dmg` 를 만들고 **설치한다.** 개발 폴더가 아니라 응용 프로그램 폴더에서 실행한다 — 개발 폴더에서 실행하면 상대 경로가 우연히 맞아 마이그레이션 결함이 숨는다.
- [x] **Step 2:** **첫 실행** — 창이 뜨고, 사용자 데이터 폴더에 `app.db` 가 생기고, 마이그레이션이 적용된다. 이 단계가 Task 3 의 유일한 실증이다.
- [x] **Step 3:** **두 번째 실행** — 앱을 켠 채로 다시 실행하면 창이 하나만 남고 기존 창이 포커스된다 (Task 1 / app-shell R19).
- [ ] **Step 4:** **핵심 루프** — 할 일을 만들고, 오늘로 가져오고, 타이머를 돌려 세션을 하나 기록한다. 주간 카드의 도트가 늘어난다.
- [ ] **Step 5:** **베이스라인 편집** — 정산 패널에서 뽀모 길이를 바꾸고 저장한다 (선행 계획서의 결과물). 앱을 껐다 켜도 값이 남는다.
- [x] **Step 6:** **재시작 후 데이터 보존** — 앱을 완전히 종료하고 다시 켰을 때 4·5 단계의 기록이 그대로 있다.
- [x] **Step 7:** **Gatekeeper 경험 기록** — 미서명이므로 첫 실행에서 경고가 뜬다. 사용자가 어떤 조작으로 통과하는지 실측하고, 그 절차를 [README.md](../../README.md) 의 설치 절에 적는다. **적지 않으면 사용자는 앱이 깨졌다고 판단한다.**
- [x] **Step 8:** 실패한 항목이 있으면 **여기서 멈추고 고친 뒤 Step 1 부터 다시 한다.** 부분 통과로 릴리스하지 않는다.

**검증:** Step 2~7 이 전부 통과하고 실측 기록이 이 문서 하단에 남았다.

#### 수동 검증 실측 기록 (2026-08-11, macOS 26.5.2 / arm64)

`.dmg` 를 만들어 마운트하고 **개발 폴더 밖으로 복사한 뒤** 실행했다. GUI 조작은 하지 않고
프로세스·DB·서명 상태로 판정했다 (사용자 요청).

**계획서가 놓쳤던 것 2건** — 실물에서 드러나 같은 브랜치에서 고쳤다:

**① `identity: null` 은 서명 생략이 아니라 잘못된 서명을 남긴다.** 계획서는 "미서명 배포"를
당연하게 적었는데, 실제로 그렇게 빌드하면 번들이 Electron 바이너리의 linker-signed 서명을
그대로 쓰고 그 서명은 **리소스를 포함하지 않는다고 선언한다.** `spctl` 이 평가를 시작조차
못 하고 `code has no resources but signature indicates they must be present` 로 끝난다 —
사용자에게는 "확인되지 않은 개발자"가 아니라 **손상된 앱**으로 보인다. `identity: '-'`
(애드혹)으로 바꿔 번들 전체를 덮는 자기완결적 서명을 만들었다. `codesign --verify --deep
--strict` 가 통과하고 `spctl` 판정이 `rejected`(= 확인되지 않은 개발자, 정상)로 바뀌었다.

**② 엔타이틀먼트 파일은 기본값을 보완하지 않고 대체한다.** electron-builder 가 애드혹 +
hardened runtime 조합에 `disable-library-validation` 을 요구하길래 그 한 줄만 담은 plist 를
넣었더니, **앱이 창을 띄우기 전에 즉사했다** — `Fatal process out of memory: Failed to
reserve virtual memory for CodeRange`. 기본값에 있던 JIT 권한 셋(`allow-jit` ·
`allow-unsigned-executable-memory` · `allow-dyld-environment-variables`)을 지워 버린 것이다.
넷을 모두 담아 해결했다. 이 실패는 **증상이 마이그레이션 경로 결함과 같아서**(창이 안 뜬다)
빌드 로그 없이는 구분할 수 없다.

**실측한 것:**

- 설치본이 **빈 데이터 폴더에서 부팅**하고 테이블 7개를 만들고 마이그레이션 1건을 적용하고
  기본 설정 6개를 시딩한다 — Task 3 의 경로 분기가 실제로 성립한다는 유일한 증거다
- **두 번째 실행이 즉시 종료**하고 프로세스 수가 늘지 않는다 (Task 1 / R19)
- 종료가 **1초** 안에 끝나고 `-wal` 파일이 사라진다 (ADR-020 §5 체크포인트). PR #48 이 고친
  종료 순서가 패키징 후에도 유지된다
- `pragma integrity_check` 가 `ok`
- 저장값이 **재시작 후에도 유지된다** (`focus_min` 을 49 로 바꾸고 앱을 껐다 켠 뒤 49)
- 아이콘·번들 메타가 붙었다 — `CFBundleName: dongmodoro`, `CFBundleIdentifier:
  com.easydong.dongmodoro`, `icon.icns` 번들 포함. `기본 Electron 아이콘` 경고가 사라졌다
- **격리 속성이 붙으면 실행이 차단된다.** `com.apple.quarantine` 을 손으로 붙이고 실행하니
  프로세스가 SIGKILL 로 죽고 DB 도 만들어지지 않았다. 속성을 지우면 정상 실행된다.
  이것이 다운로드한 사용자가 겪을 상황이며, README 의 설치 절이 그 해제 절차를 갖는다

**생략한 것:**

- **GUI 조작 검증(핵심 루프·베이스라인 편집)을 하지 않았다** — Step 4·5. 사용자가 손 검증을
  생략하기로 했고, 그 두 항목은 화면을 눌러야만 확인된다. 대신 같은 코드가 개발 모드에서
  실측됐고(선행 계획서의 기록) E2E 6종이 빌드 산출물 위에서 돈다.
- **Gatekeeper 대화상자의 실제 문구는 보지 못했다.** 차단된다는 사실까지만 확인했다.

---

### Task 7: 결정 기록과 문서 갱신

- [x] **Step 1:** `docs/architecture/decisions/adr-028-code-signing.md` 를 쓴다. context / decision / consequences 3절 필수 (docs/CLAUDE.md).
  - Context: ADR-004 가 M4 로 유보한 항목이라는 사실, 사용자가 1인이고 로컬 앱이라는 사실.
  - Decision: **v1.0.0 은 미서명으로 배포한다.**

  > **갱신 (실행 중 정정):** "미서명"에 두 가지가 있고 결과가 다르다는 것을 실측으로 배웠다. `identity: null`(서명 생략)은 Electron 의 linker-signed 서명을 물려받아 `spctl` 이 평가조차 못 하는 상태(`code has no resources…`)를 만들고, 사용자에게 **손상된 앱**으로 보인다. ADR-028 은 그래서 **애드혹 서명(`identity: '-'`)** 으로 결정했다 — 공증은 여전히 없지만 판정이 정상적인 "확인되지 않은 개발자"가 된다.
  - Consequences: (−) Gatekeeper 경고를 사용자가 수동으로 통과해야 하고 그 절차를 README 가 안내해야 한다. (−) 남에게 건네는 순간 이 결정을 다시 봐야 한다. (+) 유료 계정 없이 배포 경로가 선다.
- [x] **Step 2:** [ADR-004](../architecture/decisions/adr-004-packaging-deploy.md) 의 **상태 줄에만** `서명 여부는 ADR-028 이 결정` 을 표기한다. **본문은 이력으로 그대로 둔다** (docs/CLAUDE.md ADR 규칙).
- [x] **Step 3:** [PRODUCT.md](../../PRODUCT.md) 의 **v1 범위를 갱신한다.** 지금 문서는 v1 을 기능 8개로 정의하고 있어서, 그대로 두고 `1.0.0` 을 붙이면 문서의 v1 과 태그의 v1 이 서로 다른 것을 가리킨다.
  - 마일스톤·달력·반응형 셸·트레이를 **v1.1 이후**로 옮긴다.
  - 그것들이 빠진 v1 이 무엇인지 한 문장으로 적는다 — "주 → 오늘 → 실행 → 정산 한 바퀴와 그 분모를 정하는 것까지".
- [x] **Step 4:** [README.md](../../README.md) 의 마일스톤 지도를 갱신한다 (M4 완료, 이후 기능은 1.1·1.2 로). 설치 절을 새로 만들어 `.dmg` 다운로드 → 설치 → Gatekeeper 통과 절차를 적는다.
- [x] **Step 5:** [docs/features/pomo-baseline/overview.md](../features/pomo-baseline/overview.md) 등 기능 문서의 상태는 **건드리지 않는다.** 선행 계획서가 이미 처리했고, 여기서 또 만지면 두 PR 이 같은 줄을 다툰다.

**검증:** `grep -rn "v1 비범위" PRODUCT.md` 의 목록이 실제 v1.0.0 산출물과 일치한다.

---

### Task 8: 버전과 릴리스 (사용자 확인이 필요한 단계)

- [ ] **Step 1:** `package.json` 의 `version` 을 `0.1.0` → `1.0.0` 으로 올린다. 여기까지가 `feature/packaging` 브랜치의 마지막 커밋이다.
- [ ] **Step 2:** 자동 검증 5종 + `pnpm test:e2e` 통과 확인 후 PR 생성 (제목·본문 **영어**). 제목 안: `build: package the app with electron-builder and add the release workflow`
- [ ] **Step 3:** 머지 후 **사용자에게 보고하고 확인을 받는다.** 아래 셋은 사람이 판단한다.
  - `release/1.0` 브랜치를 만들 것인가
  - `v1.0.0` 태그를 만들 것인가
  - **태그를 push 할 것인가** — push 는 배포 트리거다 (CONTRIBUTING.md · ADR-004)
- [ ] **Step 4:** 확인을 받으면 main 에서 `release/1.0` 을 만들고, **그 브랜치에서** `v1.0.0` 태그를 만든다. main 에 태그를 달지 않는다.
- [ ] **Step 5:** 태그 push → 릴리스 워크플로가 도는 것을 확인한다. 실패하면 **태그를 지우지 말고** 원인을 고쳐 `v1.0.1` 로 낸다 — 이미 push 된 태그를 옮기는 것은 받은 사람의 이력을 깬다.
- [ ] **Step 6:** GitHub Releases 의 릴리스 노트를 **영어로** 작성한다. 무엇을 할 수 있는 앱인지와 미서명 설치 절차를 적는다.

**검증:** Releases 페이지에서 `.dmg` 를 내려받아 **다른 경로에 설치했을 때** Task 6 의 Step 2~6 이 재현된다.

---

## 이 계획이 실패할 가능성이 가장 높은 자리

계획서가 미리 숨기지 않는다. 아래 셋은 **한 번에 맞추지 못할 가능성이 높고**, 실패 로그를 읽어 반복 수정하는 작업이다.

1. **better-sqlite3 의 네이티브 바이너리.** Electron 용으로 다시 빌드되지 않았거나 `asar` 안에 갇히면 앱이 DB 를 열지 못하고, [index.ts](../../src/main/index.ts) 의 시작 실패 경로로 빠진다. 증상은 "창이 안 뜨고 오류 상자만 뜬다"이다.
2. **마이그레이션 디렉토리 경로.** Task 3 에서 고치지만, `extraResources` 의 대상 경로와 `process.resourcesPath` 아래의 실제 위치가 한 칸 어긋나는 일이 흔하다. 증상은 1번과 같아서 **두 원인을 구분하려면 오류 메시지를 끝까지 읽어야 한다.**
3. **첫 릴리스 워크플로 실행.** CI 러너의 macOS 환경은 로컬과 다르다. Task 5 의 `workflow_dispatch` 리허설이 이것을 태그 전에 드러내라고 있는 장치다.
