import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  now,
  addDays,
  addWeeks,
  calendarKeys,
  dayKey,
  dayLabel,
  weekKey,
  monthKey,
  addMonths,
  monthOfWeek,
  monthLabel,
  monthRange,
  monthGridSlots,
  localKeys,
  weekRangeLabel,
  weekStartLabel,
  weekOfDay,
  weeksBetween,
  weeksSince
} from './index'

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
    expect(weekKey(new Date(2026, 7, 4))).toBe('2026-08-03') // 화 → 그 주 월
    expect(weekKey(new Date(2026, 7, 3))).toBe('2026-08-03') // 월 → 자기 자신
    expect(weekKey(new Date(2026, 7, 9))).toBe('2026-08-03') // 일 → 지난 월요일
  })
  it('weekKey crosses year boundary by date arithmetic (53-week year)', () => {
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28') // 2027-01-01(금) → 2026-12-28(월)
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

describe('localKeys — 달력 키 짝 (ADR-022 §1)', () => {
  it('derives both keys from one instant', () => {
    expect(localKeys(new Date(2026, 7, 4, 10, 30).getTime())).toEqual({
      localDate: '2026-08-04', // 화
      localWeek: '2026-08-03' // 그 주 월
    })
  })

  it('agrees with dayKey/weekKey on every weekday of a week', () => {
    for (let d = 3; d <= 9; d++) {
      const at = new Date(2026, 7, d, 12)
      expect(localKeys(at.getTime())).toEqual({ localDate: dayKey(at), localWeek: weekKey(at) })
      expect(localKeys(at.getTime()).localWeek).toBe('2026-08-03')
    }
  })

  /**
   * 이 테스트가 이 함수의 존재 이유다. 자정을 사이에 둔 두 번의 시계 읽기는 서로 다른
   * 주를 낸다 — 아래 first/second 가 그 재현이고, localKeys 는 그 갈라짐이 불가능하다.
   */
  it('cannot split across midnight the way two separate clock reads do', () => {
    const sundayLate = new Date(2026, 7, 9, 23, 59, 59, 999) // 일 23:59:59.999
    const mondayEarly = new Date(2026, 7, 10, 0, 0, 0, 0) // 월 00:00:00.000

    // 따로 읽으면 갈라진다 (버그의 형태)
    expect(dayKey(sundayLate)).toBe('2026-08-09')
    expect(weekKey(mondayEarly)).toBe('2026-08-10')

    // 함께 만들면 어느 쪽 순간이든 짝이 맞는다
    expect(localKeys(sundayLate.getTime())).toEqual({
      localDate: '2026-08-09',
      localWeek: '2026-08-03'
    })
    expect(localKeys(mondayEarly.getTime())).toEqual({
      localDate: '2026-08-10',
      localWeek: '2026-08-10'
    })
  })

  it('argless reads the current (fake) clock', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 9, 23, 59, 59, 999) })
    expect(localKeys()).toEqual({ localDate: '2026-08-09', localWeek: '2026-08-03' })
  })

  it('crosses the year boundary (53-week year)', () => {
    expect(localKeys(new Date(2027, 0, 1, 9).getTime())).toEqual({
      localDate: '2027-01-01',
      localWeek: '2026-12-28'
    })
  })
})

describe('weeksSince (week-plan R11)', () => {
  it('같은 주면 1 주째다 — 0 이 아니다', () => {
    expect(weeksSince('2026-08-03', '2026-08-03')).toBe(1)
  })

  it('2주 전에 생긴 항목은 3주째다', () => {
    expect(weeksSince('2026-07-20', '2026-08-03')).toBe(3)
  })

  it('월 경계를 넘어도 주 수로 센다', () => {
    expect(weeksSince('2026-07-27', '2026-08-03')).toBe(2)
  })
})

describe('weekRangeLabel (ux-spec §2)', () => {
  it('월요일 키를 그 주 월~일 범위로 그린다', () => {
    expect(weekRangeLabel('2026-08-03')).toBe('8/3 – 8/9')
  })

  it('월 경계를 넘는 주도 양쪽 월을 적는다', () => {
    expect(weekRangeLabel('2026-08-31')).toBe('8/31 – 9/6')
  })
})

describe('addWeeks — 날짜 산술 (ADR-010 §2)', () => {
  it('앞뒤로 7일씩 움직인다', () => {
    expect(addWeeks('2026-08-03', 1)).toBe('2026-08-10')
    expect(addWeeks('2026-08-03', -1)).toBe('2026-07-27')
    expect(addWeeks('2026-08-03', 0)).toBe('2026-08-03')
  })

  it('연말 경계를 넘는다 — 주 번호를 세지 않으므로 53주 연도가 문제되지 않는다', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
    expect(addWeeks('2027-01-04', -1)).toBe('2026-12-28')
  })

  it('여러 주를 한 번에 움직여도 월요일이 유지된다', () => {
    expect(addWeeks('2026-08-03', 5)).toBe('2026-09-07')
  })
})

describe('addDays · weekOfDay — 계획 대상 주 계산의 재료 (technical-spec §0)', () => {
  it('날짜 키를 하루씩 움직인다', () => {
    expect(addDays('2026-08-09', 1)).toBe('2026-08-10')
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('DST 전환일을 지나도 하루가 정확히 하루다', () => {
    // 대한민국은 DST 가 없지만 이 함수는 UTC 로만 세므로 어느 지역에서 돌려도 같다.
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('날짜가 속한 주의 월요일을 준다 — 월요일은 자기 자신이다', () => {
    expect(weekOfDay('2026-08-03')).toBe('2026-08-03') // 월
    expect(weekOfDay('2026-08-06')).toBe('2026-08-03') // 목
    expect(weekOfDay('2026-08-09')).toBe('2026-08-03') // 일
    expect(weekOfDay('2026-08-10')).toBe('2026-08-10') // 다음 월
  })

  it('일요일에 하루를 더하면 다음 주가 된다 — 정시 정산이 서는 자리다', () => {
    expect(weekOfDay(addDays('2026-09-06', 1))).toBe('2026-09-07')
  })
})

describe('weeksBetween — 양끝 포함', () => {
  it('같은 주면 그 주 하나', () => {
    expect(weeksBetween('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })

  it('3주 범위면 3개를 오름차순으로 준다', () => {
    expect(weeksBetween('2026-08-03', '2026-08-17')).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17'
    ])
  })

  it('from > to 면 빈 배열이다 — 정산 범위 없음이 정상 상태다', () => {
    expect(weeksBetween('2026-08-10', '2026-08-03')).toEqual([])
  })
})

describe('weekStartLabel (weekly-review 계획서 정정 ①)', () => {
  it('좁은 자리용으로 월/일만 준다', () => {
    expect(weekStartLabel('2026-08-03')).toBe('8/3')
  })

  it('앞자리 0 을 붙이지 않는다', () => {
    expect(weekStartLabel('2026-01-05')).toBe('1/5')
  })
})

describe('dayLabel — 타이틀바 날짜 (app-shell ux-spec §1.2)', () => {
  it('연·월·일을 한국어로 붙여 준다', () => {
    expect(dayLabel('2026-08-11')).toBe('2026년 8월 11일')
  })

  it('월·일에 앞자리 0 을 붙이지 않는다', () => {
    expect(dayLabel('2026-01-05')).toBe('2026년 1월 5일')
  })

  it('월말·연말에서도 날짜가 밀리지 않는다', () => {
    expect(dayLabel('2026-01-31')).toBe('2026년 1월 31일')
    expect(dayLabel('2026-12-31')).toBe('2026년 12월 31일')
  })

  it('윤년 2월 29일을 그대로 읽는다', () => {
    expect(dayLabel('2028-02-29')).toBe('2028년 2월 29일')
  })

  // 요일은 캘린더가 소유한다 — 라벨에 섞이면 두 문서가 같은 정보를 각자 정의하게 된다.
  it('요일을 붙이지 않는다', () => {
    expect(dayLabel('2026-08-11')).not.toMatch(/[월화수목금토일]요일/)
  })
})

describe('calendarKeys.weekdayIndex — 0 = 월요일 (ADR-010 §1)', () => {
  const localMs = (iso: string): number => new Date(iso).getTime()

  it('월요일이 0, 일요일이 6 이다', () => {
    expect(calendarKeys(localMs('2026-08-03T09:00:00')).weekdayIndex).toBe(0)
    expect(calendarKeys(localMs('2026-08-09T09:00:00')).weekdayIndex).toBe(6)
  })

  it('주 중간도 월요일 기준으로 센다', () => {
    expect(calendarKeys(localMs('2026-08-06T23:59:00')).weekdayIndex).toBe(3)
  })

  it('weekKey 에 addDays(weekdayIndex) 를 하면 그 날짜가 나온다 — 두 값이 어긋나지 않는다', () => {
    const at = localMs('2026-08-06T09:00:00')
    const { dayKey: d, weekKey: w, weekdayIndex } = calendarKeys(at)
    expect(weeksBetween(w, w)).toEqual([w])
    // 주 시작 + 요일 인덱스 = 그 날. 한 번의 시계 읽기에서 나왔으므로 성립해야 한다.
    const asDay = new Date(Date.UTC(2026, 7, 3) + weekdayIndex * 86_400_000)
    expect(d).toBe(asDay.toISOString().slice(0, 10))
  })
})

describe('addMonths — 표시 대상 월 이동 (calendar-records R8 · milestones R20)', () => {
  it('연 경계를 넘는다 — 12월 다음은 이듬해 1월이다', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('여러 달을 한 번에 옮겨도 자리올림이 맞는다', () => {
    expect(addMonths('2026-08', 5)).toBe('2027-01')
    expect(addMonths('2026-02', -14)).toBe('2024-12')
  })

  it('0 을 더하면 그대로다', () => {
    expect(addMonths('2026-08', 0)).toBe('2026-08')
  })
})

describe('monthOfWeek — 주는 쪼개지지 않는다 (milestones R18)', () => {
  it('8/31~9/6 주는 전체가 8월이다', () => {
    expect(monthOfWeek('2026-08-31')).toBe('2026-08')
  })

  it('9월에 귀속되는 첫 주는 9/7 시작 주다', () => {
    expect(monthOfWeek('2026-09-07')).toBe('2026-09')
  })

  it('연 경계도 주 키의 달을 따른다 — 12/28 주는 12월이다', () => {
    expect(monthOfWeek('2026-12-28')).toBe('2026-12')
  })
})

describe('monthRange — local_date 범위 조회 경계 (calendar-records R3)', () => {
  it('그 달의 첫날과 마지막날이다', () => {
    expect(monthRange('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('윤년 2월은 29일까지다', () => {
    expect(monthRange('2028-02').to).toBe('2028-02-29')
    expect(monthRange('2026-02').to).toBe('2026-02-28')
  })

  it('12월의 다음 달 계산이 이듬해로 넘어가도 경계가 맞는다', () => {
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('monthGridSlots — 월요일 시작 그리드 (calendar-records R7 · A4)', () => {
  it('1일이 수요일인 달의 앞 빈 칸이 2개다 (A4)', () => {
    // 2026-07-01 은 수요일이다.
    expect(monthGridSlots('2026-07').leadingBlanks).toBe(2)
  })

  it('1일이 월요일이면 앞 빈 칸이 없다', () => {
    // 2026-06-01 은 월요일이다.
    expect(monthGridSlots('2026-06').leadingBlanks).toBe(0)
  })

  it('1일이 일요일이면 앞 빈 칸이 6개다 — 일요일이 주의 끝이기 때문이다', () => {
    // 2026-02-01 은 일요일이다.
    expect(monthGridSlots('2026-02').leadingBlanks).toBe(6)
  })

  it('날짜 배열이 그 달만 담는다 — 윤년 2월은 29칸이다', () => {
    const { days } = monthGridSlots('2028-02')
    expect(days).toHaveLength(29)
    expect(days[0]).toBe('2028-02-01')
    expect(days[28]).toBe('2028-02-29')
  })

  it('31일 달의 배열이 31칸이고 다음 달을 침범하지 않는다', () => {
    const { days } = monthGridSlots('2026-08')
    expect(days).toHaveLength(31)
    expect(days.at(-1)).toBe('2026-08-31')
  })
})

describe('monthLabel', () => {
  it('한 자리 달에 zero-pad 를 남기지 않는다', () => {
    expect(monthLabel('2026-08')).toBe('2026년 8월')
    expect(monthLabel('2026-12')).toBe('2026년 12월')
  })
})
