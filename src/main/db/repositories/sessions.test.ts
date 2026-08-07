import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localKeys } from '../../../shared/time'
import { eventContracts } from '../../../shared/ipc/contracts'
import type { UnitOfWork } from '../../services/ports'
import { recordSession, captureSession } from '../../services/sessions'
import { makeDrizzleUow } from './drizzle'

const REPO_MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../../../drizzle')

/**
 * 세션 기록 유스케이스 테스트. 서비스는 `src/main/services/sessions.ts` 인데 테스트가
 * 여기 있는 이유: 인메모리 실 SQLite(ADR-023 §3)를 세우려면 DB 라이브러리 import 가
 * 필요하고, 그것은 `src/main/db/` 하위에서만 허용된다 (ADR-015 §2). baseline.test.ts
 * 와 같은 배치다.
 */
function makeUow(): UnitOfWork {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite)
  migrate(db, { migrationsFolder: REPO_MIGRATIONS })
  const uow = makeDrizzleUow(db)
  // effectiveBaseline 의 폴백 원천 (ADR-013 §2) — 값은 JSON 문자열이다 (ADR-018 §5)
  uow.run((r) => {
    r.settings.set('focus_min', '25')
    r.settings.set('short_break_min', '5')
    r.settings.set('long_break_min', '15')
  })
  return uow
}

// 로컬 성분으로 만들므로 어느 타임존에서 돌려도 같은 달력 키가 나온다 (테스트는 Date 예외).
const TUE_2350 = new Date(2026, 0, 6, 23, 50, 0).getTime() // 2026-01-06 (화) 23:50 로컬
const TUE_WEEK = '2026-01-05' // 그 주 월요일

describe('recordSession — ADR-013 §2 + ADR-026 §2', () => {
  it('그 주 weeks 행이 없으면 유효 베이스라인으로 만들고 나서 INSERT 한다', () => {
    const uow = makeUow()
    expect(uow.run((r) => r.weeks.baseline(TUE_WEEK))).toBeNull()

    const payload = recordSession(uow, {
      kind: 'focus',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 25 * 60_000,
      durationSec: 25 * 60,
      taskId: null
    })

    // 주 스냅샷이 유효 베이스라인 값으로 박제됐다
    expect(uow.run((r) => r.weeks.baseline(TUE_WEEK))).toEqual({
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15
    })
    // 세션 1행 — FK(local_week → weeks)가 성립했다는 뜻이기도 하다
    const row = uow.run((r) => r.sessions.get(payload.sessionId))
    expect(row).not.toBeNull()
    expect(row?.kind).toBe('focus')
    expect(row?.durationSec).toBe(25 * 60)
    // 반환 payload 는 session:recorded 계약을 그대로 만족한다
    expect(eventContracts.sessionRecorded.parse(payload)).toEqual(payload)
  })

  it('local_date·local_week 는 started_at 기준 1회 계산 (timer R7)', () => {
    const uow = makeUow()
    // 23:50 시작 → 00:15 종료 — 자정을 걸쳐도 시작일에 귀속된다 (A4)
    const payload = recordSession(uow, {
      kind: 'focus',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 25 * 60_000,
      durationSec: 25 * 60,
      taskId: null
    })

    expect(payload.localDate).toBe('2026-01-06')
    expect(payload.localWeek).toBe(TUE_WEEK)
    // 오늘 기준으로 재계산되지 않았다
    expect(payload.localDate).not.toBe(localKeys().localDate)
    const row = uow.run((r) => r.sessions.get(payload.sessionId))
    expect(row?.localDate).toBe('2026-01-06')
    expect(row?.localWeek).toBe(TUE_WEEK)
  })

  it('휴식 세션도 기록된다 (R9)', () => {
    const uow = makeUow()
    const payload = recordSession(uow, {
      kind: 'short',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 5 * 60_000,
      durationSec: 5 * 60,
      taskId: null
    })
    const row = uow.run((r) => r.sessions.get(payload.sessionId))
    expect(row?.kind).toBe('short')
  })

  it('taskId 가 있으면 그대로 연결해 저장한다 (R6)', () => {
    const uow = makeUow()
    const taskId = uow.run((r) => {
      const weekItemId = r.weekItems.ensureSystemItem(TUE_WEEK)
      r.tasks.create({ id: 'task-1', weekItemId, title: '보고서 쓰기' })
      return 'task-1'
    })
    const payload = recordSession(uow, {
      kind: 'focus',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 25 * 60_000,
      durationSec: 25 * 60,
      taskId
    })
    expect(uow.run((r) => r.sessions.get(payload.sessionId))?.taskId).toBe(taskId)
  })
})

describe('captureSession — R8, ADR-012 §3', () => {
  it('capture: 세션의 local_week 기준 기타 항목에 완료 task 소급 생성 + 세션 연결', () => {
    const uow = makeUow()
    // 자유 집중 — 자정을 걸친 세션이라 "오늘"의 주와 세션의 주가 다를 수 있는 케이스
    const recorded = recordSession(uow, {
      kind: 'focus',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 25 * 60_000,
      durationSec: 25 * 60,
      taskId: null
    })

    const result = captureSession(uow, recorded.sessionId, '  급한 버그 조사  ')
    expect(result).toEqual({ localDate: '2026-01-06', localWeek: TUE_WEEK })

    uow.run((r) => {
      const session = r.sessions.get(recorded.sessionId)
      expect(session?.taskId).not.toBeNull()
      const taskId = session!.taskId!
      // 완료 상태로 소급 생성됐다
      const task = r.tasks.get(taskId)
      expect(task?.completedAt).not.toBeNull()
      expect(r.tasks.titleOf(taskId)).toBe('급한 버그 조사') // trim 저장
      // 부모는 세션의 주("오늘"의 주가 아니라)의 기타 항목이다
      expect(r.weekItems.weekOf(task!.weekItemId)).toBe(TUE_WEEK)
      expect(r.weekItems.ensureSystemItem(TUE_WEEK)).toBe(task!.weekItemId)
    })
  })

  it('없는 세션·빈 제목은 거부한다', () => {
    const uow = makeUow()
    expect(() => captureSession(uow, 'nope', '한 줄')).toThrow(/not found/)
    const recorded = recordSession(uow, {
      kind: 'focus',
      startedAtMs: TUE_2350,
      endedAtMs: TUE_2350 + 60_000,
      durationSec: 60,
      taskId: null
    })
    expect(() => captureSession(uow, recorded.sessionId, '   ')).toThrow(/title/)
  })
})
