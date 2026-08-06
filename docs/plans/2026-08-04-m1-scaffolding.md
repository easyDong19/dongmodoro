# M1 스캐폴딩 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법으로 진행을 추적한다.

**Goal:** 앱 코드가 0줄인 저장소에 "창이 뜨고, DB 가 열리고, IPC 왕복 1회가 화면에 렌더되는" 워킹 스켈레톤을 세운다. 기능(타이머 등)은 만들지 않는다.

**Architecture:** Electron main = 작은 백엔드(3층: 핸들러→서비스→순수 함수), renderer = FSD-lite, 둘 사이는 zod 검증 IPC 만. 서비스는 리포지토리 포트에만 의존하고 Drizzle 구현체는 `db/repositories/` 에 격리한다(DIP — ADR-015). DB 는 better-sqlite3 + Drizzle, 마이그레이션은 앱 시작 시 적용. ([architecture/overview.md](../architecture/overview.md))

**Tech Stack:** Electron + electron-vite + React + TypeScript, pnpm, better-sqlite3 + drizzle-orm + drizzle-kit, zod, TanStack Query, Tailwind CSS + shadcn/ui, Vitest + Testing Library.

## Global Constraints

아래는 모든 태스크에 암묵적으로 적용된다. 출처는 각 ADR.

- 패키지 매니저는 **pnpm** 만 쓴다 (ADR-004).
- BrowserWindow 는 항상 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. raw `ipcRenderer` 를 renderer 에 노출하지 않는다 (ADR-007).
- IPC 채널마다 **요청·응답 zod 스키마 쌍**을 정의하고, 핸들러는 진입 시 입력을 parse 하며 **발신자 검증**(`senderFrame` 가드)을 통과해야 한다 (ADR-007 구체화 + Electron 공식 보안 가이드). 등록은 반드시 Task 3 의 `handleIpc` 헬퍼로만 한다.
- **Drizzle·better-sqlite3 import 는 `src/main/db/` 하위에서만** 허용된다. 서비스는 리포지토리 포트에만 의존하고, 트랜잭션은 Unit of Work `run()` 으로만 연다. UoW 의 `work` 콜백은 동기 함수다 — better-sqlite3 트랜잭션이 동기라 async 를 넘기면 커밋 후에 본문이 실행된다 (ADR-015).
- `src/shared/` 는 **순수 TS 만** — Node/Electron/DOM API import 금지 (ADR-008).
- 시간: `now()`/`dayKey()`/`weekKey()`/`monthKey()` 는 `src/shared/time/` 모듈만 소유. 그 모듈 밖에서 `new Date()` 직접 호출 금지 (ADR-009 §3). 저장 포맷은 순간=UTC ISO `'...Z'`, 달력 키=`'YYYY-MM-DD'`/`'YYYY-MM'`, 길이=INTEGER+`_sec`/`_min` 접미사, epoch ms 저장 금지 (ADR-009 §1).
- 주 시작 = 월요일, 주 키 = 그 주 월요일 날짜 `'YYYY-MM-DD'`, 요일 배열 index 0 = 월요일 (ADR-010).
- NOT NULL·CHECK·FK 제약은 **첫 마이그레이션에 전부** 넣는다 — SQLite 는 나중에 추가하려면 테이블 재작성이다 (ADR-011 §6).
- 연결마다 PRAGMA: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000` (ADR-011 §7).
  ADR-011 §7 의 근거였던 "better-sqlite3 기본 OFF" 는 **사실이 아니다**(13.0.3 기본값 1 — ADR-019 §9).
  그래도 **명시한다** — 버전에 따라 달라질 수 있는 것에 의존하지 않기 위해서다.
- 렌더되는 UI 에 이모지 금지, 시각 값은 [design-system/tokens.md](../design-system/tokens.md) 의 토큰 이름으로만 (프로젝트 CLAUDE.md).
- 커밋 메시지는 영어, Conventional Commits. 이 계획의 작업 브랜치는 `feature/m1-scaffolding` 하나이며 태스크마다 커밋한다.
- 버전 플로어(실행 시점 최신 설치, 이 아래로는 금지): Node 22 LTS, Electron ≥ 35, electron-vite ≥ 3, React 19, drizzle-orm ≥ 0.36(sqlite `check()` 지원 필수), better-sqlite3 ≥ 11, zod ≥ 3.24, @tanstack/react-query ≥ 5, tailwindcss ≥ 4, vitest ≥ 2.
- **TypeScript 는 예외적으로 6.x 라인에 고정한다** (`strict: true`). 최신인 7.x 는
  typescript-eslint 가 지원하지 않는다 — 근거는 [ADR-016](../architecture/decisions/adr-016-lint-and-git-hooks.md) §6.
- **커밋은 husky 훅을 통과해야 한다** (Task 1.5 이후): 서식은 Prettier 가 자동으로 고치고,
  ESLint 아키텍처 규칙 · Conventional Commits · 한글 금지는 위반 시 커밋이 거부된다.
  훅에 걸리면 우회(`--no-verify`)하지 말고 규칙에 맞게 고친다.
- 시각 값·서식을 손으로 맞추려 애쓰지 않는다 — `pnpm format` 이 정한다 (ADR-017).

**계획 밖 (이 계획에서 하지 않는 것):** 타이머·오늘 목록 등 기능 전부, Query invalidation 키 계층과 타이머 상태 구독 방식(타이머 착수 직전 별도 ADR — [overview.md 미결정 사항](../architecture/overview.md)), electron-builder 패키징(M4, ADR-004), Playwright.

## 파일 구조 (완료 시점 스냅샷)

```
package.json / pnpm-lock.yaml / electron.vite.config.ts / drizzle.config.ts
tsconfig.json / tsconfig.node.json / tsconfig.web.json
src/
├── main/
│   ├── index.ts              # 앱 부트스트랩: DB 열기 → 마이그레이션 → 창 생성
│   ├── window.ts             # BrowserWindow 생성 (보안 플래그)
│   ├── services/
│   │   └── ports.ts          # 리포지토리 포트 + UnitOfWork 인터페이스 (ADR-015)
│   ├── db/                   # Drizzle import 가 허용되는 유일한 하위 트리
│   │   ├── schema.ts         # Drizzle 스키마 (ADR-011~014 + 018·019 실행분)
│   │   ├── open.ts           # 연결 + PRAGMA 세트
│   │   ├── migrate.ts        # 백업 → 버전 검사 → 마이그레이션 적용 (ADR-020)
│   │   └── repositories/
│   │       ├── drizzle.ts    # 포트의 Drizzle 구현체 + UoW
│   │       └── memory.ts     # 인메모리 페이크 (테스트 더블)
│   └── ipc/
│       ├── handle.ts         # handleIpc 헬퍼: 발신자 검증 + 요청/응답 parse
│       └── system.ts         # system.getAppInfo 핸들러 (첫 유스케이스)
├── preload/
│   └── index.ts              # contextBridge 화이트리스트
├── renderer/
│   ├── index.html
│   ├── main.tsx              # React 루트 + QueryClientProvider
│   ├── app/App.tsx           # 플레이스홀더 화면
│   ├── features/ entities/   # 빈 슬라이스 (.gitkeep) — docs/features/ 와 1:1
│   └── shared/
│       ├── api.ts            # window.api 타입 획득
│       └── styles/tokens.css # tokens.md 를 CSS 변수로 옮긴 것
└── shared/                   # 순수 TS 전용 (Node/DOM 금지)
    ├── time/index.ts         # now/dayKey/weekKey/monthKey 초크포인트
    └── ipc/
        ├── channels.ts       # 채널 이름 상수
        └── contracts.ts      # zod 계약 (TS 타입은 z.infer 파생)
drizzle/                      # drizzle-kit 이 생성한 SQL 마이그레이션
tests → 각 모듈 옆 *.test.ts (Vitest)
```

---

### Task 1: electron-vite 프로젝트 뼈대 — 창이 뜬다

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.gitignore`, `src/main/index.ts`, `src/main/window.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/app/App.tsx`

**Interfaces:**
- Produces: `pnpm dev`(개발 실행) / `pnpm build`(프로덕션 빌드) / `pnpm typecheck` 스크립트. `createWindow(): BrowserWindow`.

- [ ] **Step 1: 의존성 설치**

**빌드 스크립트 차단 문제부터 처리한다.** pnpm 10+ 는 의존성의 빌드 스크립트를 기본
차단하고(postinstall 이 공급망 공격의 주요 통로), 네이티브 모듈을 컴파일하는
better-sqlite3 가 정확히 그것을 필요로 한다. 단, **ADR-004 가 적었던 `package.json` 의
`pnpm.onlyBuiltDependencies` 는 pnpm 11 에서 읽히지 않는다** — 설정이 `pnpm-workspace.yaml`
로, 키가 `allowBuilds` 맵으로 바뀌었다 (ADR-004 Consequences 에 현행화 반영됨).

`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  better-sqlite3: true
  electron: true
  esbuild: true
```

`package.json` (`pnpm` 필드는 넣지 않는다 — 무시된다):

```json
{
  "name": "dongmodoro",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  }
}
```

**electron 은 `allowBuilds` 에 넣어도 효과가 없다** — v42 부터 설치 스크립트를 아예 제공하지
않고 첫 실행 때 런타임 바이너리(약 295MB)를 스스로 내려받는다. 그러므로 바이너리를 받기 위한
`postinstall` 은 넣지 않는다. 받는 시점을 설치 시점으로 앞당기고 싶을 때만 `install-electron`
bin 을 건다 — 테스트만 도는 CI 에서 불필요한 295MB 를 받게 되므로 기본값은 "넣지 않음"이다.

그 다음 설치:

```bash
pnpm add -D electron electron-vite vite @vitejs/plugin-react typescript @types/node
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom
```

설치 후 `pnpm exec electron --version` 이 버전을 출력하는지 확인한다 (여기서 바이너리를 받는다).

> pnpm 11 은 게시된 지 `minimumReleaseAge`(기본 1440분 = 24시간) 이 안 지난 버전의 설치를
> 거부한다 — 악성 릴리즈가 회수될 시간을 벌기 위함이다. 갓 나온 버전을 굳이 고정하면
> `minimumReleaseAgeExclude` 예외가 만들어지는데, **그 예외를 만들지 않는다.** 그 안전장치를
> 끄는 것이 곧 검증 안 된 릴리즈를 받는 것이므로, 버전이 창을 통과할 때까지 기다린다.
> (2026-08-05: electron 43.3.0 이 전날 릴리즈라 이 창에 걸려 43.2.0 으로 간다.)

- [ ] **Step 2: 설정 파일 작성**

`electron.vite.config.ts`:

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    // "type": "module" 이면 기본 산출물이 index.mjs 인데, sandbox: true 인 preload 는
    // ESM 을 로드하지 못한다 (ADR-007 이 sandbox 를 요구). CJS + .cjs 로 고정한다.
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
```

`tsconfig.node.json` (main·preload·shared 용, `lib: ES2022` + `types: ['node']`), `tsconfig.web.json` (renderer·shared 용, `lib` 에 DOM + `jsx: react-jsx`) — 둘 다 `"strict": true`, `"paths"` 에 위 alias 와 동일하게. 두 파일을 나누는 이유는 renderer 에서 Node API 를 import 해도 타입 에러가 안 나는 상황을 막기 위함이다 (ADR-008 의 "shared 는 순수 TS" 규칙을 타입 검사로 강제). `tsconfig.json` 은 두 파일을 `references` 로 묶는 솔루션 파일. `.gitignore` 에 `node_modules/`, `out/`, `dist/`, `*.local` 추가.

> TypeScript 7 에서 `baseUrl` 이 **제거**됐다. `paths` 값은 `["./src/shared/*"]` 처럼 `./` 로 시작하는 상대 경로로 쓴다.

- [ ] **Step 3: 최소 코드 작성**

`src/main/window.ts`:

```ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'), // CJS 강제 — 위 config 참조
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
```

`src/main/index.ts`:

```ts
import { app } from 'electron'
import { createWindow } from './window'

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit() // 트레이 도입(M1 후반, app-shell PRD R29) 전까지는 창 닫기 = 종료
})
```

`src/preload/index.ts` 는 이 태스크에서는 빈 파일(주석만 — `export {}` 로 모듈화), `src/renderer/app/App.tsx` 는 `<h1>dongmodoro</h1>` 플레이스홀더, `src/renderer/main.tsx` 는 React 루트 마운트, `index.html` 은 vite 표준 골격 + `<div id="root">`.

> `__dirname` 은 ESM 산출물에서도 쓸 수 있다 — electron-vite 가 CommonJS 심을 주입한다 (빌드 결과로 확인).

- [ ] **Step 4: 검증**

실행: `pnpm typecheck` → 에러 0. `pnpm build` → `out/main/index.js`·`out/preload/index.cjs`·`out/renderer/` 생성, 에러 0. `pnpm dev` → 창이 뜨고 "dongmodoro" 텍스트 표시.

육안 확인 대신 자동 검증을 쓸 수 있다: `--remote-debugging-port` 로 앱을 띄우고 CDP `Runtime.evaluate` 로 `document.querySelector('h1').textContent` 를 읽는다. 렌더는 비동기이므로 값이 나올 때까지 폴링해야 한다.

- [ ] **Step 5: 커밋** — `feat: scaffold electron-vite app with react and strict typescript`

---

### Task 1.5: 규칙 강제 — ESLint 아키텍처 규칙 + husky/commitlint

계획 수립 후 추가된 태스크다. 근거·설계는 [ADR-016](../architecture/decisions/adr-016-lint-and-git-hooks.md).
**Task 2 앞에 두는 이유**: 코드가 134줄이라 소급 수정이 0 이고, `new Date()` 초크포인트
규칙이 그 초크포인트를 만드는 Task 2 보다 먼저 존재해야 규칙과 구현이 같이 태어난다.

**Files:**
- Create: `eslint.config.js`, `commitlint.config.js`, `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`
- Modify: `package.json`(lint 스크립트·lint-staged·prepare), `CONTRIBUTING.md`, `docs/architecture/overview.md`

**Interfaces:**
- Produces: `pnpm lint`. 커밋 시 자동으로 도는 3개 훅.

- [ ] **Step 1: 설치** — `pnpm add -D eslint @eslint/js typescript-eslint husky lint-staged @commitlint/cli @commitlint/config-conventional`

  이때 **TypeScript 를 6.x 로 내린다** (`pnpm add -D typescript@6`) — typescript-eslint 가 TS 7 을 지원하지 않는다.

- [ ] **Step 2: ESLint 규칙 작성** — ADR-008(shared 순수성) · ADR-015 §2(DB 격리) · ADR-009 §3(시간 초크포인트) · CLAUDE.md(이모지 금지).

  > **함정**: flat config 는 같은 규칙 이름을 뒤 블록이 **통째로 덮어쓴다**(옵션 병합 아님).
  > `no-restricted-imports` 를 shared 용·DB 용으로 각각 쓰면 shared 규칙이 조용히 사라진다.
  > 파일 그룹을 겹치지 않게 나누고, 한 그룹에 필요한 옵션을 **한 블록에 모아서** 준다.

- [ ] **Step 3: 규칙이 실제로 걸리는지 검증** — 규칙마다 위반 파일을 만들어 `pnpm lint` 로 확인하고 지운다. **이 단계를 건너뛰면 위 함정을 못 잡는다.**

- [ ] **Step 3.5: Prettier** ([ADR-017](../architecture/decisions/adr-017-prettier.md), ADR-016 §2 대체) — `pnpm add -D prettier eslint-config-prettier`. `eslint-config-prettier` 는 flat config **마지막**에 둔다. `.prettierignore` 에 `*.md` 와 `docs/` 를 넣는다 — Prettier 는 표 셀을 글자 수로 패딩하는데 한글은 두 칸 폭이라 정렬이 오히려 깨지고, `docs/origin/` 은 읽기 전용이다.

- [ ] **Step 4: husky 훅 3종** — `pre-commit`(lint-staged: prettier 로 고친 뒤 eslint 로 검사), `commit-msg`(commitlint + 한글 금지 커스텀 규칙), `pre-push`(main·release 차단).

- [ ] **Step 5: 훅 검증** — 위반 코드·한글 메시지·형식 위반 커밋을 실제로 시도해 각각 차단되는지, 정상 커밋은 통과하는지 확인.

- [ ] **Step 6: 문서 갱신** — CONTRIBUTING.md 강제화 계층 표(⏸ → ✅)와 스니펫, overview.md 확정 스택.

- [ ] **Step 7: 커밋** — `feat: enforce architecture rules with eslint and git hooks`

---

### Task 2: Vitest + 시간 모듈 (첫 TDD 대상)

**Files:**
- Create: `vitest.config.ts`, `src/shared/time/index.ts`, `src/shared/time/index.test.ts`

**Interfaces:**
- Produces: `now(): string`(UTC ISO `'...Z'`) / `dayKey(d?: Date): string`(`'YYYY-MM-DD'` 로컬) / `weekKey(d?: Date): string`(그 주 월요일 `'YYYY-MM-DD'`) / `monthKey(d?: Date): string`(`'YYYY-MM'`). 전부 인자 생략 시 현재 시각. 이 모듈 밖 `new Date()` 금지 (ADR-009 §3).

- [ ] **Step 1: 설치와 설정**

```bash
pnpm add -D vitest @vitest/coverage-v8
```

`vitest.config.ts` 는 `test: { include: ['src/**/*.test.{ts,tsx}'] }`. `package.json` 에 `"test": "vitest run"` 추가.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/shared/time/index.test.ts` (핵심 케이스 — 자정 경계·주 경계·연말 53주):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { now, dayKey, weekKey, monthKey } from './index'

afterEach(() => vi.useRealTimers())

describe('time module (ADR-009/010)', () => {
  it('now() returns UTC ISO with Z suffix', () => {
    vi.useFakeTimers({ now: new Date('2026-08-04T10:30:00+09:00') })
    expect(now()).toBe('2026-08-04T01:30:00.000Z')
  })
  it('dayKey uses local date', () => {
    expect(dayKey(new Date(2026, 7, 4, 0, 5))).toBe('2026-08-04')
    expect(dayKey(new Date(2026, 7, 3, 23, 55))).toBe('2026-08-03')
  })
  it('weekKey is the Monday of that week', () => {
    expect(weekKey(new Date(2026, 7, 4))).toBe('2026-08-03')  // 화 → 그 주 월
    expect(weekKey(new Date(2026, 7, 3))).toBe('2026-08-03')  // 월 → 자기 자신
    expect(weekKey(new Date(2026, 7, 9))).toBe('2026-08-03')  // 일 → 지난 월요일
  })
  it('weekKey crosses year boundary by date arithmetic (53-week year)', () => {
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28')  // 2027-01-01(금) → 2026-12-28(월)
  })
  it('monthKey zero-pads', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01')
  })
  // 서브에이전트 검증(2026-08-05)에서 추가: lint 가 모듈 밖 new Date() 를 막으므로
  // 프로덕션이 실제로 타는 유일한 경로는 "인자 생략"인데, 위 테스트들은 전부
  // 명시적 Date 인자 경로였다 — 무인자 경로가 가짜 시계를 타는지 직접 검증한다.
  it('argless calls read the current (fake) clock', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 4, 10, 30) }) // 로컬 2026-08-04 화
    expect(dayKey()).toBe('2026-08-04')
    expect(weekKey()).toBe('2026-08-03')
    expect(monthKey()).toBe('2026-08')
  })
  it('weekKey crosses month and year boundaries', () => {
    expect(weekKey(new Date(2030, 0, 1))).toBe('2029-12-31') // 2030-01-01(화) → 전년 12/31(월)
    expect(weekKey(new Date(2029, 0, 1))).toBe('2029-01-01') // 1/1 이 월요일인 해 → 자기 자신
    expect(weekKey(new Date(2027, 7, 1))).toBe('2027-07-26') // 월초 일요일 → 전월 월요일
  })
})
```

- [ ] **Step 3: 실행해 실패 확인** — `pnpm test` → FAIL (모듈 없음)

- [ ] **Step 4: 구현**

`src/shared/time/index.ts`:

```ts
// ADR-009 §3: 이 모듈만 new Date() 를 호출한다.
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function now(): string {
  return new Date().toISOString()
}

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function weekKey(d: Date = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = monday.getDay() // 0=일 … 6=토
  monday.setDate(monday.getDate() - ((dow + 6) % 7)) // 월요일로 후진
  return dayKey(monday)
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
```

- [ ] **Step 5: 통과 확인** — `pnpm test` → PASS 5건

- [ ] **Step 6: 커밋** — `feat: add shared time module with day/week/month keys`

---

### Task 3: IPC 계약 + preload 브리지 + 첫 유스케이스 왕복

**Files:**
- Create: `src/shared/ipc/channels.ts`, `src/shared/ipc/contracts.ts`, `src/shared/ipc/contracts.test.ts`, `src/main/ipc/handle.ts`, `src/main/ipc/system.ts`, `src/renderer/shared/api.ts`
- Modify: `src/preload/index.ts`, `src/main/index.ts`

**Interfaces:**
- Produces: renderer 전역 `window.api.system.getAppInfo(): Promise<{ appVersion: string; schemaVersion: number }>`. `handleIpc(channel, contract, fn)` — 발신자 검증·입력 parse·출력 parse 를 강제하는 유일한 핸들러 등록 경로. 이후 모든 도메인 API 는 이 패턴(channels → contracts {req,res} 쌍 → handleIpc → preload 매핑)을 복제한다 (ADR-007).

> **착수 전 고칠 것 3가지** (2026-08-05 실행 중 확인):
>
> 1. **preload 빌드에 `@shared` 별칭이 없다.** `electron.vite.config.ts` 의 preload 블록에
>    `resolve: { alias: { '@shared': ... } }` 를 추가한다. 없으면 타입 검사는 통과하는데
>    빌드에서 모듈을 못 찾는다.
> 2. **preload 의 `rollupOptions` 를 직접 지정하면 electron-vite 의 기본 `external` 이 사라진다.**
>    `external: ['electron']` 을 명시하지 않으면 npm `electron` 패키지의 **바이너리 다운로더**가
>    번들에 딸려 들어가고, 실행 시 `Error: module not found: child_process` 로 preload 가
>    통째로 죽는다. preload 가 비어 있던 Task 1 에서는 드러나지 않는다.
> 3. **renderer 가 preload 의 `typeof api` 를 import 하지 않는다.** 그러면 renderer 타입 검사가
>    electron 을 import 하는 파일로 끌려 들어간다(tsconfig.web 은 Node·Electron 타입을 뺐다).
>    대신 `src/shared/ipc/api.ts` 에서 **계약으로부터 `Api` 타입을 파생**하고 preload 가
>    `const api: Api` 로 그 표면을 구현한다. 파생 타입은 조건이 어긋나면 조용히 `never` 가
>    되므로, 계약 타입으로 대입해 보는 컴파일 시점 단언을 테스트에 남긴다.

> **구현 후 격리 구조 심사에서 확인·수정한 것 2가지** (2026-08-05, 위반 파일 실측):
>
> 1. **프로세스 경계 zone 규칙이 lint 에 없었다.** renderer→main·renderer→electron·
>    shared→main(상대경로) import 가 lint·typecheck 모두 통과했다 — shared 순수성 규칙은
>    모듈 이름 기준이라 상대경로 한 다리를 건너면 전이적으로 뚫린다. `eslint.config.js` 를
>    프로세스 폴더별 5개 그룹(shared/renderer/preload/main/main-db)으로 재편하고
>    `^(\.\./)+(main|…)(/|$)` 정규식 패턴으로 경계를 강제했다 (근거: ADR-008 단방향
>    의존, ADR-016 §1). 위반 9종 물어뜯기로 전부 잡히는 것을 확인.
> 2. **Node 내장 모듈 손 열거(15개)가 불완전했다** — `node:buffer` 가 통과. 열거를
>    `node:module` 의 `builtinModules` 실목록 + `node:*` 글롭으로 교체했다.

- [ ] **Step 1: zod 설치** — `pnpm add zod` (실행 시점 zod 4 가 설치된다. 응답 스키마는
      `z.object` 대신 **`z.strictObject`** 를 쓴다 — `z.object` 는 모르는 키를 조용히 버려서
      계약이 어긋나도 알 수 없다.)

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`src/shared/ipc/contracts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { contracts } from './contracts'

describe('system.getAppInfo contract', () => {
  it('res accepts a valid payload', () => {
    expect(contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0', schemaVersion: 1 }))
      .toEqual({ appVersion: '0.1.0', schemaVersion: 1 })
  })
  it('res rejects missing fields', () => {
    expect(() => contracts.system.getAppInfo.res.parse({ appVersion: '0.1.0' })).toThrow()
  })
  it('req rejects unexpected arguments', () => {
    expect(() => contracts.system.getAppInfo.req.parse(['rogue'])).toThrow()
  })
})
```

- [ ] **Step 3: 실행해 실패 확인** — `pnpm test` → FAIL

- [ ] **Step 4: 구현**

`src/shared/ipc/channels.ts`:

```ts
export const CHANNELS = {
  system: { getAppInfo: 'system:getAppInfo' }
} as const
```

`src/shared/ipc/contracts.ts` — 채널마다 요청(`req`)·응답(`res`) 스키마 쌍이 규칙이다:

```ts
import { z } from 'zod'

export const contracts = {
  system: {
    getAppInfo: {
      req: z.tuple([]),                       // 인자 없음 — 여분 인자는 거부된다
      res: z.object({
        appVersion: z.string(),
        schemaVersion: z.number().int()
      })
    }
  }
} as const

export type AppInfo = z.infer<typeof contracts.system.getAppInfo.res>
```

`src/main/ipc/handle.ts` — 발신자 검증 + 양방향 parse 를 강제하는 유일한 등록 경로:

```ts
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'

// Electron 보안 가이드: 모든 IPC 메시지의 발신자를 검증한다.
// 허용 발신자 = 우리 앱 번들(file://) 또는 dev 서버(ELECTRON_RENDERER_URL)뿐.
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const trusted = url.startsWith('file://') || (devUrl != null && url.startsWith(devUrl))
  if (!trusted) throw new Error(`Untrusted IPC sender: ${url}`)
}

export function handleIpc<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(
  channel: string,
  contract: { req: Req; res: Res },
  fn: (...args: z.infer<Req>) => z.infer<Res> | Promise<z.infer<Res>>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event)
    const input = contract.req.parse(args)
    return contract.res.parse(await fn(...input))
  })
}
```

`src/main/ipc/system.ts`:

```ts
import { app } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'
import { contracts } from '@shared/ipc/contracts'
import { handleIpc } from './handle'

export function registerSystemHandlers(getSchemaVersion: () => number): void {
  handleIpc(CHANNELS.system.getAppInfo, contracts.system.getAppInfo, () => ({
    appVersion: app.getVersion(),
    schemaVersion: getSchemaVersion()
  }))
}
```

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '@shared/ipc/channels'

const api = {
  system: {
    getAppInfo: () => ipcRenderer.invoke(CHANNELS.system.getAppInfo)
  }
}
contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
```

`src/renderer/shared/api.ts`:

```ts
import type { Api } from '../../../preload/index'

declare global {
  interface Window { api: Api }
}
export const api = window.api
```

`src/main/index.ts` 의 `whenReady` 에서 `registerSystemHandlers(() => 0)` 호출 (schemaVersion 은 Task 4 에서 실값 연결).

- [ ] **Step 4.5: `handle.ts` 단위 테스트** — 보안 핵심인데 계약 테스트로는 안 덮인다.
      `vi.mock('electron')` 으로 `ipcMain.handle` 이 받아간 콜백을 붙잡아 직접 호출한다:
      신뢰 발신자 통과 / 외부 URL 거부 / dev 서버 URL 통과 / 요청 위반 거부 / 응답 위반 거부 /
      **에러 메시지에 입력값이 실리지 않음**.

- [ ] **Step 5: 검증** — `pnpm test` PASS. 실제 앱을 띄워 왕복 확인 (CDP `Runtime.evaluate` +
      `awaitPromise: true` 로 자동화 가능). 확인할 것: `typeof window.api === 'object'`,
      `getAppInfo()` 가 계약대로 응답, **`window.ipcRenderer`·`window.require` 가 undefined**
      (raw 노출 없음 — ADR-007 §3).

      > 여분 인자를 renderer 에서 보내는 시도는 main 까지 도달하지 않는다 — preload 의
      > 시그니처가 인자를 받지 않아 거기서 잘린다. 이는 버그가 아니라 더 강한 보장이며,
      > main 의 `req.parse` 는 preload 버그에 대한 2차 방어선으로 남는다.

- [ ] **Step 6: 커밋** — `feat: add zod-validated ipc contract with system.getAppInfo`

---

### Task 4: DB 계층 — 스키마·PRAGMA·백업·마이그레이션

가장 큰 태스크. **여기서 새 설계 결정을 하지 않는다.**

> **⚠️ 스키마·마이그레이션의 원본은 이 문서가 아니다 (2026-08-05 갱신).**
> 이 계획서가 들고 있던 `schema.ts` 코드 블록은 삭제했다. DB 계층 착수 전 격리 심사에서
> 40건 가까운 문제가 나와 [ADR-018](../architecture/decisions/adr-018-first-run-state.md) ·
> [ADR-019](../architecture/decisions/adr-019-constraint-implementation.md) ·
> [ADR-020](../architecture/decisions/adr-020-db-safeguards.md) 이 추가됐고, 그 결과 계획서의
> 사본이 **틀린 스키마**가 됐기 때문이다 (fail-open CHECK, `budget` NOT NULL, `task_pulls`
> 컬럼 3종 누락 등).
>
> **원본 순서**: [ADR-011](../architecture/decisions/adr-011-schema-final.md)(골격)
> → ADR-012·013·014(정정) → ADR-018·019·020(실행분 확정)
> → **[ADR-021](../architecture/decisions/adr-021-constraint-type-enforcement.md) ·
> [ADR-022](../architecture/decisions/adr-022-calendar-key-pairing.md)(구현 후 심사 정정, 최신)**.
> 충돌하면 번호가 큰 쪽이 이긴다. 스키마를 두 곳에 두지 않는 것이 이 변경의 목적이므로,
> **여기에 코드 블록을 다시 넣지 않는다.**
>
> ⚠️ **ADR-021 §5 의 정합성 식은 틀렸다** — ADR-022 §5 가 정정했다. §5 표를 복사하지 말 것.

**Files:**
- Create: `drizzle.config.ts`, `src/main/db/schema.ts`, `src/main/db/open.ts`, `src/main/db/migrate.ts`, `src/main/db/migrate.test.ts`, `drizzle/`(생성물)
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: Task 2 의 시간 모듈(백업 파일명), Task 3 의 `registerSystemHandlers(getSchemaVersion)`.
- Produces: `openDb(dbPath: string): { db: BetterSQLite3Database, sqlite: Database }` / `migrateDb(sqlite, db, backupDir): { schemaVersion: number }` — 적용된 마이그레이션 수를 버전으로 반환. 예외 `DowngradeError`.

- [ ] **Step 1: 설치**

```bash
pnpm add better-sqlite3 drizzle-orm
pnpm add -D drizzle-kit @types/better-sqlite3
```

> **네이티브 재빌드는 하지 않는다 (2026-08-06 실측으로 폐기).** 이 계획서는 원래
> `electron-rebuild` + `postinstall` 로 electron 의 Node ABI 에 맞춰 재빌드하라고 적었다.
> **better-sqlite3 13 은 N-API prebuild(`prebuilds/darwin-arm64.node`, node-addon-api)를
> 싣고 오며 N-API 는 ABI 안정**이므로 재빌드가 불필요하다. 같은 바이너리를 양쪽에서
> 로드해 확인했다:
>
> | 런타임 | `process.versions.modules` | 결과 |
> |---|---|---|
> | Node 22.21.1 | 127 | 로드·질의 성공 |
> | Electron 43.2.0 (Node 24.18.0) | 148 | 로드·질의 성공 |
>
> 재빌드를 넣으면 오히려 한쪽 ABI 로 고정돼 **vitest(Node)와 앱(Electron) 중 하나가
> 깨진다.** 따라서 `@electron/rebuild` 도 `postinstall` 도 추가하지 않는다.
> (참고: 구 `electron-rebuild` 패키지는 2022-11 폐기됐고 `@electron/rebuild` 가 후속이다 —
> 재빌드가 필요해지면 그쪽을 쓴다.)
>
> **같은 실측에서 ADR-019 의 두 전제도 이 설치본(13.0.2)에서 직접 확인했다** —
> `pragma foreign_keys` 기본값 **1**(ADR-019 §9), `json_valid()` 동작(JSON1 확장,
> ADR-019 Consequences). ADR 은 13.0.3 에서 확인했다고 적었으나 13.0.2 도 같다.
>
> `drizzle-kit` 이 폐기된 하위 의존성 `@esbuild-kit/core-utils`·`@esbuild-kit/esm-loader`
> 를 끌고 온다. 직접 고칠 수 없고 `pnpm audit` 취약점은 0건이라 그대로 둔다 — 설치 시
> 경고가 뜨는 것이 정상이다.
>
> better-sqlite3 는 13.0.3 이 나와 있으나 pnpm 의 `minimumReleaseAge`(24h) 창에 아직
> 들어오지 않아 13.0.2 가 설치된다. 의도된 동작이며 시간이 지나면 자동으로 올라간다.

- [ ] **Step 2: 스키마 작성** — `src/main/db/schema.ts`

ADR 을 열고 그대로 옮긴다. 아래는 **읽을 순서와 빠뜨리기 쉬운 지점의 체크리스트**이며,
값·식의 원본이 아니다.

| # | 확인할 것 | 원본 |
|---|---|---|
| 1 | 테이블 7종 골격과 불변 달력 키, `completed_at` 통일 | ADR-011 §1~§5 |
| 2 | 집계 술어가 요구하는 컬럼(`local_week`·`local_date`·`is_system`) | ADR-012 |
| 3 | `weeks` 의 두 스냅샷 분리 — **`budget` 은 nullable 이다** | **ADR-018 §1** |
| 4 | 달력 키·순간 CHECK 을 **NULL-safe 형태**로 (`IS date(...)`). `GLOB '[0-9]…'` 는 날짜 키에 쓰지 않는다 | **ADR-019 §2** |
| 5 | 순간 컬럼 **21개 전부**에 형식 CHECK. `GLOB '*Z'` 는 `'Z'` 한 글자를 통과시킨다 | **ADR-019 §2** |
| 6 | 값 범위 CHECK — `is_system IN (0,1)`, est_pomos 조건부, `json_array_length(capacity)=7`, `duration_sec >= 0`, `ended_at >= started_at` | **ADR-019 §3** |
| 7 | `sessions.local_week` → `weeks(week)` FK. **`week_items.week` 에는 걸지 않는다**(정산 트랜잭션 순서 때문) | **ADR-019 §4** |
| 8 | `task_pulls` 컬럼 3종 추가 — `removed_at`·`created_at`·`updated_at` | **ADR-019 §5** |
| 9 | `settings.updated_at` + `CHECK(json_valid(value))`, 전 `updated_at` 에 `$onUpdate` | **ADR-019 §6** |
| 10 | 부분 UNIQUE 인덱스 — 주당 시스템 기타 항목 1개 | **ADR-019 §7** |
| 11 | 인덱스 정의 다듬기(신설은 미룸) | ADR-019 §8 |
| 12 | 첫 실행 시딩 목록과 `settings.value` 의 NULL 표현 | **ADR-018 §4·§5** |

- 자기참조 FK(`week_items.carry_from_id`)는 drizzle-kit 이 빠뜨릴 수 있다 — Step 3 에서 확인한다.
- 심사에서 **알고도 미룬 것**이 있다. 무엇을 왜 미뤘는지는
  [DB 계층 착수 전 심사](../decision-log/2026-08-05-db-layer-audit.md) 에 있다. 구현 중
  "이건 왜 이렇게 돼 있지"가 나오면 그 문서를 먼저 본다.

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle'
})
```

- [ ] **Step 3: 마이그레이션 생성과 SQL 육안 검증**

실행: `pnpm drizzle-kit generate` → `drizzle/0000_*.sql` 생성.
생성된 SQL 을 열어 확인: CHECK 7종·FK·인덱스 6종이 모두 들어 있는가. `week_items.carry_from_id` 자기참조 FK 가 누락됐으면 생성된 SQL 에 `FOREIGN KEY (carry_from_id) REFERENCES week_items(id)` 를 직접 추가한다 (drizzle-kit 의 자기참조 지원이 불완전할 수 있음 — 수정 후 `drizzle-kit generate` 재실행 금지, journal 은 그대로).

- [ ] **Step 4: 실패하는 마이그레이션 러너 테스트 작성**

`src/main/db/migrate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from './open'
import { migrateDb, DowngradeError } from './migrate'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dongmodoro-')) })

function setup() {
  const { db, sqlite } = openDb(join(dir, 'app.db'))
  return { db, sqlite, version: migrateDb(sqlite, db, dir).schemaVersion }
}

describe('openDb pragma set (ADR-011 §7)', () => {
  it('enables foreign_keys and WAL', () => {
    const { sqlite } = setup()
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
  })
})

describe('migrateDb', () => {
  it('creates all 7 tables and returns version >= 1', () => {
    const { sqlite, version } = setup()
    const names = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%drizzle%' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r: any) => r.name).sort()
    expect(names).toEqual(
      ['milestones','sessions','settings','task_pulls','tasks','week_items','weeks'])
    expect(version).toBeGreaterThanOrEqual(1)
  })
  it('rejects a non-Monday week key (CHECK works)', () => {
    const { sqlite } = setup()
    const ins = () => sqlite.prepare(
      `INSERT INTO weeks (week,budget,capacity,focus_min,short_break_min,long_break_min,created_at,updated_at)
       VALUES ('2026-08-04',24,'[4,4,4,4,4,4,0]',25,5,15,'2026-08-04T00:00:00.000Z','2026-08-04T00:00:00.000Z')`
    ).run()
    expect(ins).toThrow(/CHECK/)
  })
  it('rejects an unknown session kind', () => {
    const { sqlite } = setup()
    const ins = () => sqlite.prepare(
      // sessions 에는 created_at 이 없다 (ADR-011 §3 — updated_at 만 추가).
      `INSERT INTO sessions (id,started_at,ended_at,duration_sec,kind,local_date,local_week,updated_at)
       VALUES ('01','2026-08-04T01:00:00.000Z','2026-08-04T01:25:00.000Z',1500,'nap','2026-08-04','2026-08-03','2026-08-04T01:00:00.000Z')`
    ).run()
    expect(ins).toThrow(/CHECK/)
  })
  it('throws DowngradeError when db version is ahead of the app', () => {
    const { sqlite, db, version } = setup()
    sqlite.pragma(`user_version = ${version + 1}`)
    expect(() => migrateDb(sqlite, db, dir)).toThrow(DowngradeError)
  })
  it('backs up the db file before migrating an existing db', () => {
    // 1차 마이그레이션 후 재실행 → 백업 파일 존재 확인
    const { sqlite, db } = setup()
    migrateDb(sqlite, db, dir)
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    expect(readdirSync(dir).some(f => f.startsWith('app.db.backup-'))).toBe(true)
  })
})
```

- [ ] **Step 5: 실행해 실패 확인** — `pnpm test` → FAIL (open/migrate 없음)

- [ ] **Step 6: 구현**

`src/main/db/open.ts`:

```ts
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export function openDb(dbPath: string): { db: BetterSQLite3Database; sqlite: Database.Database } {
  const sqlite = new Database(dbPath)
  sqlite.pragma('foreign_keys = ON')   // better-sqlite3 기본 OFF (ADR-011 §7)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')
  return { db: drizzle(sqlite), sqlite }
}
```

`src/main/db/migrate.ts`:

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { now } from '@shared/time'

export class DowngradeError extends Error {}

const MIGRATIONS_DIR = join(__dirname, '../../drizzle') // electron-vite 빌드 산출 기준 경로는 구현 시 확인

function bundledMigrationCount(): number {
  return readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).length
}

export function migrateDb(
  sqlite: Database.Database,
  db: BetterSQLite3Database,
  backupDir: string
): { schemaVersion: number } {
  const appVersion = bundledMigrationCount()
  const dbVersion = sqlite.pragma('user_version', { simple: true }) as number
  if (dbVersion > appVersion) {
    throw new DowngradeError(
      `DB schema v${dbVersion} is newer than app schema v${appVersion}`)
  }
  const dbPath = sqlite.name
  if (existsSync(dbPath) && dbVersion > 0) {          // 첫 생성이 아니면 적용 전 백업 (ADR-011 §7)
    copyFileSync(dbPath, join(backupDir,
      `${dbPath.split('/').pop()}.backup-${now().replace(/[:.]/g, '-')}`))
  }
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  sqlite.pragma(`user_version = ${appVersion}`)
  return { schemaVersion: appVersion }
}
```

`src/main/index.ts` 를 연결: `app.getPath('userData')` 아래 `app.db` 로 `openDb` → `migrateDb` → 그 `schemaVersion` 을 `registerSystemHandlers` 에 전달. `DowngradeError` 를 잡으면 `dialog.showErrorBox` 로 안내 후 `app.quit()` (열지 않는다 — ADR-011 §7).

- [ ] **Step 7: 통과 확인** — `pnpm test` → 전부 PASS. `pnpm dev` → 창이 뜨고 콘솔에서 `await window.api.system.getAppInfo()` 의 `schemaVersion` 이 1 이상.

- [ ] **Step 8: 커밋** — `feat: add sqlite schema, pragma set, backup and migration runner`

---

### Task 5: 리포지토리 포트 패턴 고정 (ADR-015)

포트·UoW·Drizzle 구현체를 최소 1세트 만들어 이후 모든 기능이 복제할 패턴을 코드로 고정한다. 대상은 스캐폴딩에 실재하는 가장 단순한 테이블인 `settings`.

> **⚠️ 페이크와 계약 테스트는 만들지 않는다 (2026-08-06 갱신).**
> 이 계획서가 적은 `memory.ts` + `settings.contract.test.ts` 는
> [ADR-023](../architecture/decisions/adr-023-repository-port-rationale.md) 이 **보류**시켰다.
> 착수 전 격리 조사 3건에서 ① 로컬 우선 데스크톱 앱 8종 중 페이크로 데이터 계층을 대체한
> 사례 0건 ② 우리 스키마로 인메모리 실 DB 를 세우는 비용이 **0.54ms** 라 페이크가 아껴줄
> 시간이 없음 ③ `Map` 페이크가 CHECK 44개·FK 6개를 재현하지 못해 계약 스위트를 오히려
> 얕게 만듦이 확인됐다.
>
> 아래 Step 1 의 계약 테스트 코드와 Step 3 의 `memory.ts` 블록은 **이력으로 남긴 것이며
> 실행 대상이 아니다.** 원본은 ADR-015(§1·§2·§3·§5) + ADR-023 이다.
> UoW 는 **동기 그대로**다 — ADR-023 §2.

**Files:**
- Create: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`, `src/main/db/repositories/settings.test.ts`

**Interfaces:**
- Consumes: Task 4 의 `openDb`/`migrateDb`(계약 테스트에서 인메모리 실 DB 준비), `schema.ts` 의 `settings` 테이블.
- Produces: `SettingsRepository { get(key: string): string | null; set(key: string, value: string): void }` / `Repositories { settings: SettingsRepository }` / `UnitOfWork { run<T>(work: (repos: Repositories) => T): T }` / `makeDrizzleUow(db): UnitOfWork` / `makeMemoryUow(): UnitOfWork`. 이후 기능은 포트 메서드를 여기에 추가하는 방식으로 확장한다.

- [ ] **Step 1: 실패하는 계약 테스트 작성**

`src/main/db/repositories/settings.contract.test.ts` — 같은 스위트를 두 구현체가 통과해야 한다:

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { UnitOfWork } from '../../services/ports'
import { makeDrizzleUow } from './drizzle'
import { makeMemoryUow } from './memory'

function drizzleUowOnMemoryDb(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: 'drizzle' })
  return makeDrizzleUow(db)
}

function contractSuite(name: string, make: () => UnitOfWork): void {
  describe(`SettingsRepository contract — ${name}`, () => {
    it('returns null for a missing key', () => {
      const uow = make()
      expect(uow.run((r) => r.settings.get('nope'))).toBeNull()
    })
    it('set then get round-trips, set overwrites', () => {
      const uow = make()
      uow.run((r) => r.settings.set('focus_min', '25'))
      uow.run((r) => r.settings.set('focus_min', '50'))
      expect(uow.run((r) => r.settings.get('focus_min'))).toBe('50')
    })
    it('rolls back every write when work throws', () => {
      const uow = make()
      expect(() =>
        uow.run((r) => {
          r.settings.set('k', 'v')
          throw new Error('boom')
        })
      ).toThrow('boom')
      expect(uow.run((r) => r.settings.get('k'))).toBeNull()
    })
  })
}

contractSuite('drizzle', drizzleUowOnMemoryDb)
contractSuite('memory', makeMemoryUow)
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL (ports/구현체 없음)

- [ ] **Step 3: 구현**

`src/main/services/ports.ts` (DB 라이브러리 import 없음 — 순수 인터페이스):

```ts
export interface SettingsRepository {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface Repositories {
  settings: SettingsRepository
}

// work 는 동기 함수만 허용 — better-sqlite3 트랜잭션이 동기다 (ADR-015 §3)
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => T): T
}
```

`src/main/db/repositories/drizzle.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { settings } from '../schema'
import type { Repositories, UnitOfWork } from '../../services/ports'

type Tx = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0]

function makeRepos(tx: Tx): Repositories {
  return {
    settings: {
      get: (key) =>
        tx.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null,
      set: (key, value) => {
        tx.insert(settings).values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } }).run()
      }
    }
  }
}

export function makeDrizzleUow(db: BetterSQLite3Database): UnitOfWork {
  return {
    run: (work) => db.transaction((tx) => work(makeRepos(tx)))
  }
}
```

`src/main/db/repositories/memory.ts` — 롤백 의미론까지 재현하는 페이크:

```ts
import type { Repositories, UnitOfWork } from '../../services/ports'

export function makeMemoryUow(): UnitOfWork {
  const store = new Map<string, string>()
  return {
    run<T>(work: (repos: Repositories) => T): T {
      const staged = new Map(store)               // 트랜잭션 = 사본 위 작업
      const result = work({
        settings: {
          get: (key) => staged.get(key) ?? null,
          set: (key, value) => void staged.set(key, value)
        }
      })
      store.clear()                                // 예외 없이 끝났을 때만 커밋
      staged.forEach((v, k) => store.set(k, v))
      return result
    }
  }
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` → 계약 스위트 2회(drizzle·memory) 전부 PASS

- [ ] **Step 5: 커밋** — `feat: add repository ports with unit of work and contract tests`

> **Task 3 구조 심사에서 이연된 관찰 지점 3건** (2026-08-05 격리 리뷰, PLAUSIBLE 판정 —
> 당시엔 실해 0 이라 미룸. 이 태스크에서 채널·핸들러가 늘어나면 실해가 생긴다):
>
> 1. **핸들러 등록 완결성 검사** — 채널 추가 시 4곳 중 3곳(channels·contracts·preload)은
>    컴파일러가 누락을 잡지만 main 의 `handleIpc` 등록 누락만 런타임 에러다. 등록 함수가
>    여럿 생기는 이 태스크에서 `CHANNELS` 를 순회하며 전부 등록됐는지 확인하는 스모크
>    테스트 1개를 추가한다.
> 2. **preload 채널 문자열 매칭** — `: Api` 는 함수 시그니처만 검사하고 invoke 에 넘긴
>    채널 문자열이 그 계약의 채널인지는 못 잡는다. 채널이 5개쯤 되면 preload api 객체를
>    계약 순회로 기계 생성하는 방안을 검토한다 (설계 변경이므로 ADR 선행).
> 3. **핸들러 본문 관례** — `handleIpc` 의 `fn` 에 비즈니스 로직이 축적되는 것을 막는
>    기계 장치는 없다 (ADR-008 이 의도한 관례 의존). 규칙 있는 유스케이스의 fn 본문은
>    "서비스 호출 1줄"을 유지하는지 리뷰 관찰 지점으로 삼는다.

---

### Task 6: TanStack Query 배선 — IPC 를 queryFn 으로

**Files:**
- Create: `src/renderer/shared/query.ts`
- Modify: `src/renderer/main.tsx`, `src/renderer/app/App.tsx`

**Interfaces:**
- Consumes: Task 3 의 `api.system.getAppInfo`.
- Produces: `queryClient` 싱글턴. 키 계층 설계는 여기서 하지 않는다(타이머 ADR 로 이연) — 이 태스크의 키는 `['system','appInfo']` 하나뿐.

- [ ] **Step 1: 설치** — `pnpm add @tanstack/react-query`

- [ ] **Step 2: 구현**

> **⚠️ `new QueryClient()` 를 기본값 그대로 쓰지 않는다 (2026-08-06 갱신).**
> 기본값은 **진짜 서버를 전제**한다. 특히 `networkMode` 기본값 `'online'` 이면 브라우저가
> 오프라인이라고 판단하는 순간 **로컬 SQLite 조회가 `fetchStatus: 'paused'` 로 멈춘다**
> (빌드된 앱에서 실측). 기본값 세트의 원본은
> [ADR-024](../architecture/decisions/adr-024-query-client-defaults.md) 다 —
> `networkMode: 'always'`(queries·mutations 양쪽) · `retry: false` ·
> `refetchOnWindowFocus: false` · `staleTime` 은 전역으로 정하지 않음.
> `retry: false` 의 대가로 **화면마다 에러 갈래가 필요하다** (없으면 실패가 영원한
> "로딩 중"으로 위장된다).

`src/renderer/shared/query.ts` 는 `queryClient` 싱글턴을 만든다(기본값은 ADR-024). `main.tsx` 를 `QueryClientProvider` 로 감싸고, `App.tsx` 에서:

```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'

export function App() {
  const { data } = useQuery({
    queryKey: ['system', 'appInfo'],
    queryFn: () => api.system.getAppInfo()
  })
  return (
    <main>
      <h1>dongmodoro</h1>
      <p>{data ? `v${data.appVersion} · schema v${data.schemaVersion}` : '로딩 중'}</p>
    </main>
  )
}
```

- [ ] **Step 3: 검증** — `pnpm dev` → 화면에 `v0.1.0 · schema v1` 형태 텍스트 렌더. `pnpm typecheck` 에러 0.

- [ ] **Step 4: 커밋** — `feat: wire tanstack query over ipc with app info query`

---

### Task 7: Tailwind + shadcn/ui + 디자인 토큰

**Files:**
- Create: `src/renderer/shared/styles/tokens.css`, `src/renderer/shared/styles/global.css`, `components.json`(shadcn), `src/renderer/shared/ui/`(shadcn 산출)
- Modify: `src/renderer/main.tsx`, `src/renderer/app/App.tsx`

**Interfaces:**
- Produces: 모든 시각 값은 `var(--token)` 으로만 소비. shadcn 컴포넌트는 `src/renderer/shared/ui/` 에 생성된다 (ADR-008 의 "UI 킷(shadcn 커스텀)" 위치).

- [ ] **Step 1: 설치** — Tailwind v4 방식:

```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm add -D lucide-react class-variance-authority clsx tailwind-merge
```

`electron.vite.config.ts` 의 renderer plugins 에 `tailwindcss()` 추가.

- [ ] **Step 2: 토큰 이관**

`tokens.css` 에 [design-system/tokens.md §9 기준 CSS 블록](../design-system/tokens.md) 을 **그대로** 옮긴다 — **값 변형·추가 금지**, tokens.md 가 유일 출처. 그 블록에 아래가 포함되며 **하나도 빠뜨리지 않는다**:

- `html { font-size: 62.5% }` + `body { font-size: var(--text-md) }` — 폰트 크기가 rem 이므로 이 두 줄이 없으면 본문이 10px 로 렌더된다 (design-system ADR-007)
- 다크(기본) + **라이트 테마 재정의** — `@media (prefers-color-scheme: light)` 와 `[data-theme='light']` 두 경로. 값 세트를 중복 정의하지 않는다 (design-system ADR-008)
- `@media (prefers-reduced-motion: reduce)` 의 모션 토큰 `0ms` 재정의 (design-system ADR-005)
- `@media (forced-colors: active)` 의 유리·광원 포기 (design-system ADR-006 §2)

`global.css` 는 `@import 'tailwindcss'` + `@theme` 블록에서 Tailwind 색·폰트를 `var(--token)` 참조로 매핑 + `body { background: var(--bg-deep); color: var(--ink); font-family: var(--font-sans); }` + `:focus-visible` 포커스 링 (design-system ADR-004).

- [ ] **Step 3: shadcn 초기화** — `pnpm dlx shadcn@latest init` (경로: `src/renderer/shared/ui`), `button` 하나만 추가해 파이프라인 검증. 스킨은 이 태스크에서 손대지 않는다(뼈대만 — ADR-003).

- [ ] **Step 4: 검증** — `pnpm dev` → 배경 `--bg-deep`, 본문 `--ink` 적용된 플레이스홀더 + shadcn Button 1개 렌더. 이모지 0. `pnpm build` 에러 0.

- [ ] **Step 5: 커밋** — `feat: add tailwind, design tokens css and shadcn skeleton`

---

### Task 8: 마무리 검증 + 개발 문서

**Files:**
- Create: `README.md`
- Modify: (없음 — 검증만)

- [ ] **Step 1: 전체 검증 일괄 실행**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: 세 명령 모두 exit 0. 추가로 `pnpm dev` 로 창·DB·IPC·토큰 적용을 최종 육안 확인.

- [ ] **Step 2: README 작성** — 저장소 루트 `README.md` 에 최소한만: 한 줄 소개, 요구 환경(Node/pnpm), `pnpm install / dev / test / build` 사용법, 문서 진입점([docs/features/README.md](../features/README.md) · [docs/architecture/overview.md](../architecture/overview.md)) 링크. 기능 설명은 문서로 링크만 하고 복제하지 않는다.

- [ ] **Step 3: 커밋** — `docs: add readme with dev commands and doc entrypoints`

- [ ] **Step 4: PR** — 사용자 컨펌 1회 후 `feature/m1-scaffolding` → main PR 생성, 스쿼시 머지. PR 제목: `feat: scaffold electron app with db, ipc and ui foundations`

---

## Self-Review 결과

- **범위 확인**: 워킹 스켈레톤 정의(창·DB·IPC 왕복·포트 패턴·토큰 적용·테스트 기반) 전부에 태스크가 있다. 기능 코드·미결 2건(타이머 상태 구독, Query 키 계층)은 의도적으로 제외 (Global Constraints 에 명시).
- **자리표시자 검사**: 실행 시점에만 알 수 있는 값 2건은 검증 단계로 전환해 두었다 — ① drizzle 생성 SQL 의 자기참조 FK 유무(Task 4 Step 3 에 확인·수동 보정 절차) ② 빌드 산출물 기준 마이그레이션 폴더 경로(Task 4 코드 주석 + Task 8 dev 실행으로 검증).
- **타입 일관성**: `openDb`/`migrateDb`/`registerSystemHandlers(getSchemaVersion)`/`contracts.system.getAppInfo`/`handleIpc`/`UnitOfWork`·`Repositories`·`SettingsRepository` 시그니처가 태스크 3·4·5·6 에서 동일하게 사용됨을 확인.
- **결정 반영 확인 (2026-08-04 보강)**: IPC 요청/응답 스키마 쌍 + 발신자 검증은 Task 3 `handleIpc` 로, 리포지토리 포트 + UoW(ADR-015)는 Task 5 로 반영됐다. Drizzle import 격리 규칙은 Global Constraints 에 있다.
