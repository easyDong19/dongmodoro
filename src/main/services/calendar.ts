import { monthGridSlots, monthRange } from '../../shared/time'
import type { DayTaskRow, UnitOfWork } from './ports'

/**
 * 캘린더 열람 (calendar-records). 유스케이스 하나 = `uow.run` 트랜잭션 하나 (ADR-015 §1).
 *
 * **이 파일의 존재 이유는 `hasRecord` 하나다.** 점·조각 목록·빈 상태가 각자 "기록이
 * 있다"를 판정하면 같은 날짜에 대해 캘린더는 "아무 일 없었음", 날짜 패널은 "3개 다 완료"
 * 라고 말한다 (리뷰 케이스 6 이 실제로 잡은 버그). 아래 술어를 **다른 어디에서도 다시
 * 쓰지 않는다.**
 */

/** 점의 등급. 없음은 등급이 아니라 `hasRecord: false` 로 표현된다. */
export type DotLevel = 'basic' | 'strong'

/** 진한 점의 하한 (R11). 절대값이며 시안 v7 에서 온 값이다 — 사용자 데이터 근거는 없다. */
const STRONG_DOT_MIN_FOCUS = 4

/**
 * `기록 있음(D)` (calendar-records **R5**). 이 술어의 구현은 여기 하나뿐이다.
 *
 * 두 항의 성격이 다르다는 것이 요점이다 — 완료 focus 세션은 "그날 집중했다", pull 행은
 * "그날 목록에 있었다"이며, **둘 다 그날의 불변 사실**이다. 완료 여부를 조건에 넣지
 * 않는 이유는 그것이 현재 상태여서 과거 날짜에 대해 변하기 때문이다 (R19).
 */
function hasRecord(focusCount: number, pulled: boolean): boolean {
  return focusCount >= 1 || pulled
}

/**
 * 점의 등급은 **완료 focus 세션 수로만** 계산한다 (**R6**).
 *
 * 조각 수는 들어가지 않는다 — 세션 0 이고 pull 만 있는 날은 "점 있음 · 기본 등급"이다.
 * 길이 차이도 반영하지 않는다: 5분 4회인 날과 25분 4회인 날이 같은 진한 점이며, 그
 * 한계는 PRD 의 가정 블록이 명시적으로 수용했다.
 */
function dotLevel(focusCount: number): DotLevel {
  return focusCount >= STRONG_DOT_MIN_FOCUS ? 'strong' : 'basic'
}

export type CalendarDay = {
  dayKey: string
  hasRecord: boolean
  focusCount: number
  /** `hasRecord` 가 거짓이면 점을 그리지 않으므로 이 값은 쓰이지 않는다. */
  dotLevel: DotLevel
}

export type MonthCalendar = {
  month: string
  /** 1일 앞의 빈 칸 수. **월요일 시작** 기준이다 (R7). */
  leadingBlanks: number
  days: CalendarDay[]
}

/**
 * 월 그리드 한 화면 = 응답 하나. 화면이 조각을 모아 조립하지 않게 한다.
 *
 * **미래 날짜를 특별 취급하지 않는다** (R10 · A18). "오늘보다 뒤면 점 없음" 규칙을 두지
 * 않으므로, 타임존을 크게 옮긴 뒤 오늘보다 뒤인 셀에 점이 찍힐 수 있다. 그것은 버그가
 * 아니다 — 점은 기록 당시의 사실이고 오늘 표시는 현재 시각의 사실이며, 둘 다 참인 값을
 * 그대로 보여준다.
 */
export function monthCalendar(uow: UnitOfWork, month: string): MonthCalendar {
  const { from, to } = monthRange(month)
  const { leadingBlanks, days } = monthGridSlots(month)

  return uow.run((repos) => {
    const focusByDate = new Map(
      repos.calendar.focusCountsByDate(from, to).map((r) => [r.dayKey, r.focusCount])
    )
    const pullDates = new Set(repos.calendar.pullDatesIn(from, to))

    return {
      month,
      leadingBlanks,
      days: days.map((dayKey) => {
        const focusCount = focusByDate.get(dayKey) ?? 0
        return {
          dayKey,
          focusCount,
          hasRecord: hasRecord(focusCount, pullDates.has(dayKey)),
          dotLevel: dotLevel(focusCount)
        }
      })
    }
  })
}

export type DayRecord = {
  dayKey: string
  hasRecord: boolean
  focusCount: number
  tasks: DayTaskRow[]
}

/**
 * 날짜 패널 한 화면 (R17·R18). 조각 목록은 **두 원천의 합집합**이며 중복을 제거한다.
 *
 * 두 원천이 모두 필요한 이유: 사후 캡처로 이름이 붙은 조각은 오늘 목록을 거치지 않아
 * pull 행이 없다 — 원천 1만 쓰면 자유 집중 3회 후 각각 이름을 붙인 날의 패널에 그
 * 세 조각이 나타나지 않는다 (A10). 반대로 원천 2만 쓰면 가져왔지만 집중하지 않은
 * 조각이 사라진다.
 *
 * 완료 여부는 `tasks.completed_at` 의 NULL 여부, 즉 **현재 상태**다 (R19). 8/1 에
 * 가져와 8/5 에 끝낸 조각은 8/1 패널에서도 완료로 보이며, 그 정밀도 손실은 문서가
 * 명시적으로 수용했다 — 대안(로컬 날짜 비교)은 ADR-009 §2 가 금지한 조회 시점 파생이고
 * 타임존을 옮기면 과거 화면의 완료 표시가 뒤집힌다.
 */
export function dayRecord(uow: UnitOfWork, dayKey: string): DayRecord {
  return uow.run((repos) => {
    const focusCount = repos.sessions.countFocusOn(dayKey)
    const byId = new Map<string, DayTaskRow>()

    for (const t of repos.calendar.pulledTasksOn(dayKey)) {
      byId.set(t.taskId, { ...t, pulled: true, hadSession: false })
    }
    for (const t of repos.calendar.sessionTasksOn(dayKey)) {
      const existing = byId.get(t.taskId)
      byId.set(t.taskId, {
        ...t,
        pulled: existing?.pulled ?? false,
        hadSession: true
      })
    }

    const tasks = [...byId.values()]
    return {
      dayKey,
      focusCount,
      // 술어를 다시 쓰지 않는다 — 점과 같은 함수를 부른다 (R5).
      hasRecord: hasRecord(
        focusCount,
        tasks.some((t) => t.pulled)
      ),
      tasks
    }
  })
}

/**
 * `이번 주 N일 공부 중` (R24).
 *
 * **여기만 `기록 있음` 과 다른 조건을 쓴다** — 완료 focus ≥ 1 인 날 단독이며 pull 은
 * 세지 않는다. 이 문구가 말하는 것은 "공부한 날"이고, 조각을 체크만 한 날은 집중한 날이
 * 아니기 때문이다 (A23). **이것이 R5 와 갈리는 유일한 지점이며 의도된 예외다** — 버그로
 * 보고 통일하지 말 것.
 *
 * 연속 일수가 아니다 (PRD 가정 블록). 사이가 비어도 각각 센다.
 */
export function studyDays(uow: UnitOfWork, week: string): { week: string; days: number } {
  return uow.run((repos) => ({ week, days: repos.calendar.studiedDayCount(week) }))
}
