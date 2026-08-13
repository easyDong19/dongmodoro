import { describe, expect, it } from 'vitest'
import { formatMeasured } from './measured-time'

/**
 * week-plan ux-spec §0 의 7개 경계 케이스. 규칙의 소유자는 그 문서이고 이 파일은
 * 그것이 코드에서 참인지만 확인한다.
 */
describe('formatMeasured — 표기 규칙 (week-plan ux-spec §0)', () => {
  it('0 초는 `0분` 이다 — 쟀는데 0 이라는 사실이다 (§0.3)', () => {
    expect(formatMeasured(0)).toBe('0분')
  })

  it('0 초과 1분 미만은 `1분 미만` — 내림만 하면 잰 시간이 증발한다 (§0.2)', () => {
    expect(formatMeasured(1)).toBe('1분 미만')
    expect(formatMeasured(30)).toBe('1분 미만')
    expect(formatMeasured(59)).toBe('1분 미만')
  })

  it('1분 이상은 내림이다 — 하지 않은 집중을 주장하지 않는다 (§0.2)', () => {
    expect(formatMeasured(60)).toBe('1분')
    expect(formatMeasured(119)).toBe('1분') // 반올림이면 `2분` 이 된다
    expect(formatMeasured(1500)).toBe('25분')
    expect(formatMeasured(3599)).toBe('59분')
  })

  it('정각 60분은 `1시간` 이다 — `1시간 0분` 을 쓰지 않는다', () => {
    expect(formatMeasured(3600)).toBe('1시간')
    expect(formatMeasured(7200)).toBe('2시간')
    expect(formatMeasured(5400)).toBe('1시간 30분')
  })

  it('세 자리 시간에 자릿수 제한도 천 단위 구분 기호도 없다 (§0.4)', () => {
    expect(formatMeasured(142 * 3600 + 5 * 60)).toBe('142시간 5분')
    expect(formatMeasured(1024 * 3600)).toBe('1024시간')
  })

  it('빈 상태의 시각적 등가물은 `0분` 이지 `—` 가 아니다 (§0.5)', () => {
    // 값 없음(null)은 애초에 숫자 자리를 그리지 않으므로 이 함수에 오지 않는다.
    // 따라서 이 함수의 출력에 `—` 는 존재할 수 없다.
    expect(formatMeasured(0)).not.toBe('—')
  })

  it('음수는 정의역 밖이지만 감추지 않는다 — 차액 버그가 화면에 드러나야 한다', () => {
    expect(formatMeasured(-90)).toBe('-1분')
  })
})
