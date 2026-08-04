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
- 연결마다 PRAGMA: `foreign_keys = ON`(better-sqlite3 기본 OFF), `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000` (ADR-011 §7).
- 렌더되는 UI 에 이모지 금지, 시각 값은 [design-system/tokens.md](../design-system/tokens.md) 의 토큰 이름으로만 (프로젝트 CLAUDE.md).
- 커밋 메시지는 영어, Conventional Commits. 이 계획의 작업 브랜치는 `feature/m1-scaffolding` 하나이며 태스크마다 커밋한다.
- 버전 플로어(실행 시점 최신 설치, 이 아래로는 금지): Node 22 LTS, Electron ≥ 35, electron-vite ≥ 3, React 19, TypeScript ≥ 5.6 (`strict: true`), drizzle-orm ≥ 0.36(sqlite `check()` 지원 필수), better-sqlite3 ≥ 11, zod ≥ 3.24, @tanstack/react-query ≥ 5, tailwindcss ≥ 4, vitest ≥ 2.

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
│   │   ├── schema.ts         # Drizzle 스키마 (ADR-011~014 전체)
│   │   ├── open.ts           # 연결 + PRAGMA 세트
│   │   ├── migrate.ts        # 백업 → 버전 검사 → 마이그레이션 적용
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

```bash
pnpm init
pnpm add -D electron electron-vite vite @vitejs/plugin-react typescript @types/node
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom
```

`package.json` 에 수동으로 추가:

```json
{
  "name": "dongmodoro",
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
  preload: {},
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

`tsconfig.node.json` (main·preload·shared 용), `tsconfig.web.json` (renderer·shared 용) — 둘 다 `"strict": true`, `"paths"` 에 위 alias 와 동일하게. `tsconfig.json` 은 두 파일을 `references` 로 묶는 솔루션 파일. `.gitignore` 에 `node_modules/`, `out/`, `dist/`, `*.local` 추가.

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
      preload: join(__dirname, '../preload/index.js'),
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

`src/preload/index.ts` 는 이 태스크에서는 빈 파일(주석만), `src/renderer/app/App.tsx` 는 `<h1>dongmodoro</h1>` 플레이스홀더, `src/renderer/main.tsx` 는 React 루트 마운트, `index.html` 은 vite 표준 골격 + `<div id="root">`.

- [ ] **Step 4: 검증**

실행: `pnpm typecheck` → 에러 0. `pnpm dev` → 창이 뜨고 "dongmodoro" 텍스트 표시. `pnpm build` → `out/` 생성, 에러 0.

- [ ] **Step 5: 커밋** — `feat: scaffold electron-vite app with react and strict typescript`

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

- [ ] **Step 1: zod 설치** — `pnpm add zod`

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

- [ ] **Step 5: 검증** — `pnpm test` PASS. `pnpm dev` 실행 후 DevTools 콘솔에서 `await window.api.system.getAppInfo()` → `{ appVersion, schemaVersion }` 반환 확인.

- [ ] **Step 6: 커밋** — `feat: add zod-validated ipc contract with system.getAppInfo`

---

### Task 4: DB 계층 — 스키마·PRAGMA·백업·마이그레이션

가장 큰 태스크. 스키마는 ADR-011 을 ADR-012~014 정정분까지 반영해 옮긴 것이며, **여기서 새 설계 결정을 하지 않는다.**

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

electron 의 Node ABI 와 맞추기 위해 `pnpm add -D electron-rebuild` 후 `package.json` 스크립트에 `"postinstall": "electron-rebuild -f -w better-sqlite3"` 추가.

- [ ] **Step 2: 스키마 작성** — `src/main/db/schema.ts`

컬럼 주석의 근거: ①=ADR-011 ②=ADR-012 ③=ADR-013 ④=ADR-014 ⑤=ADR-009 ⑥=ADR-010.

```ts
import { sqliteTable, text, integer, primaryKey, check, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// 재사용 CHECK 패턴 (⑤): 순간 = '...Z' 접미사, 달력 키 = GLOB
const DATE_GLOB = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"
const MONTH_GLOB = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]'"

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull() // JSON
})
// 사용 키: weekly_capacity [월..일](⑥), focus_min/short_break_min/long_break_min(25/5/15),
//          last_settled_week(월요일 날짜, ⑥), plan_lead_days(기본 1, ⑥)

export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),                       // uuid v7 (ADR-006)
  month: text('month').notNull(),                    // 'YYYY-MM'
  title: text('title').notNull(),
  completedAt: text('completed_at'),                 // ① §5: done boolean 폐지
  sortOrder: integer('sort_order').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at')                    // ④: 물리 삭제 + 보관. deleted_at 없음
}, (t) => [
  check('milestones_month_format', sql`${t.month} GLOB ${sql.raw(MONTH_GLOB)}`)
])

export const weeks = sqliteTable('weeks', {
  week: text('week').primaryKey(),                   // 그 주 월요일 날짜 (⑥)
  budget: integer('budget').notNull(),               // ③ §1: NULL 파생 폐지, 확정 저장
  capacity: text('capacity').notNull(),              // JSON [월..일] 스냅샷
  focusMin: integer('focus_min').notNull(),
  shortBreakMin: integer('short_break_min').notNull(),
  longBreakMin: integer('long_break_min').notNull(),
  plannedAt: text('planned_at'),
  settledAt: text('settled_at'),
  createdAt: text('created_at').notNull(),           // mutable 테이블 공통 (ADR-006)
  updatedAt: text('updated_at').notNull()
}, (t) => [
  check('weeks_week_is_monday', sql`strftime('%w', ${t.week}) = '1'`)
])

export const weekItems = sqliteTable('week_items', {
  id: text('id').primaryKey(),
  week: text('week').notNull(),
  title: text('title').notNull(),
  estPomos: integer('est_pomos').notNull(),
  milestoneId: text('milestone_id')
    .references(() => milestones.id, { onDelete: 'set null' }), // ④ §3
  days: text('days').notNull(),                      // JSON [월..일] 의도, [] = 미배치
  originWeek: text('origin_week').notNull(),         // ① §4: 이월 배지 날짜 산술용
  carryFromId: text('carry_from_id'),                // 직전 원본 추적 전용 (자기참조 FK 는 마이그레이션 SQL 로)
  completedAt: text('completed_at'),                 // ① §5: status enum 폐지
  droppedAt: text('dropped_at'),                     //   둘 다 NULL = active
  isSystem: integer('is_system').notNull().default(0), // ① §4: 주차별 "기타" 행
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at')                      // ④ §1: soft delete
}, (t) => [
  check('week_items_week_is_monday', sql`strftime('%w', ${t.week}) = '1'`),
  check('week_items_origin_week_is_monday', sql`strftime('%w', ${t.originWeek}) = '1'`),
  index('idx_week_items_week').on(t.week)
])

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  weekItemId: text('week_item_id').notNull()
    .references(() => weekItems.id),                 // NOT NULL — 부모 없는 task 는 "기타" 행에
  title: text('title').notNull(),
  estPomos: integer('est_pomos'),                    // 직접 추가 task 는 추정 없음 → NULL 허용
  completedAt: text('completed_at'),                 // ① §5
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at')                      // ④ §1
}, (t) => [
  index('idx_tasks_week_item').on(t.weekItemId)
])

export const taskPulls = sqliteTable('task_pulls', {
  taskId: text('task_id').notNull().references(() => tasks.id),
  pullDate: text('pull_date').notNull()              // ① §2: 행 승격 — 재-pull 이력 보존
}, (t) => [
  primaryKey({ columns: [t.taskId, t.pullDate] }),
  check('task_pulls_date_format', sql`${t.pullDate} GLOB ${sql.raw(DATE_GLOB)}`),
  index('idx_task_pulls_date').on(t.pullDate)
])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),           // 순간 (⑤)
  endedAt: text('ended_at').notNull(),
  durationSec: integer('duration_sec').notNull(),
  kind: text('kind').notNull(),
  taskId: text('task_id').references(() => tasks.id), // NULL = 미분류 집중
  note: text('note'),
  localDate: text('local_date').notNull(),           // ① §3: insert 시 1회 계산, 불변
  localWeek: text('local_week').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()            // ① §3: 사후 캡처가 UPDATE 하므로
}, (t) => [
  check('sessions_kind', sql`${t.kind} IN ('focus','short','long')`),
  check('sessions_started_utc', sql`${t.startedAt} GLOB '*Z'`),
  check('sessions_local_date_format', sql`${t.localDate} GLOB ${sql.raw(DATE_GLOB)}`),
  check('sessions_local_week_is_monday', sql`strftime('%w', ${t.localWeek}) = '1'`),
  index('idx_sessions_local_week').on(t.localWeek),
  index('idx_sessions_local_date').on(t.localDate),
  index('idx_sessions_task').on(t.taskId)
])
```

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
      `INSERT INTO sessions (id,started_at,ended_at,duration_sec,kind,local_date,local_week,created_at,updated_at)
       VALUES ('01','2026-08-04T01:00:00.000Z','2026-08-04T01:25:00.000Z',1500,'nap','2026-08-04','2026-08-03','2026-08-04T01:00:00.000Z','2026-08-04T01:00:00.000Z')`
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

포트·UoW·Drizzle 구현체·페이크·계약 테스트를 최소 1세트 만들어 이후 모든 기능이 복제할 패턴을 코드로 고정한다. 대상은 스캐폴딩에 실재하는 가장 단순한 테이블인 `settings`.

**Files:**
- Create: `src/main/services/ports.ts`, `src/main/db/repositories/drizzle.ts`, `src/main/db/repositories/memory.ts`, `src/main/db/repositories/settings.contract.test.ts`

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

`src/renderer/shared/query.ts` 는 `export const queryClient = new QueryClient()`. `main.tsx` 를 `QueryClientProvider` 로 감싸고, `App.tsx` 에서:

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

`tokens.css` 에 [design-system/tokens.md](../design-system/tokens.md) 의 전 토큰을 `:root { --bg-deep: #0c1a16; … }` 로 기계적으로 옮긴다 — **값 변형·추가 금지**, tokens.md 가 유일 출처. `global.css` 는 `@import 'tailwindcss'` + `@theme` 블록에서 Tailwind 색·폰트를 `var(--token)` 참조로 매핑 + `body { background: var(--bg-deep); color: var(--ink); font-family: var(--font-sans); }`.

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
