/**
 * 측정 시간 표기 (week-plan ux-spec §0 — **그 절이 규칙의 원본이고 이 파일은 단일
 * 구현이다**). 화면마다 다른 포맷을 만들지 않는다.
 *
 * main 은 언제나 초를 내려보내고 renderer 는 포맷만 한다 (ADR-031 §2). 반올림은
 * **여기서 한 번만** 일어난다 — 합산·차액은 이미 초 단계에서 끝나 있다.
 */

const SEC_PER_MIN = 60
const SEC_PER_HOUR = 3600

/**
 * 초 → 표시 문자열 (ux-spec §0.1).
 *
 * - `0` → `0분` — 쟀는데 0 이라는 **사실**이다. 값 없음(`null`)은 애초에 숫자 자리를
 *   그리지 않으므로 이 함수에 오지 않는다 (§0.3).
 * - `1`~`59` → `1분 미만` — 내림만 적용하면 30초짜리 세션이 `0분` 이 되어 잰 시간이
 *   증발한 것처럼 보인다 (§0.2). `duration_sec >= 0` 이라 몇 초짜리 세션은 정상 경로다.
 * - 그 밖은 **내림(floor)** — 하지 않은 집중을 숫자로 주장하지 않는다.
 * - 정각 시간은 `1시간` 이다. `1시간 0분` 을 쓰지 않는다.
 * - 시간 자리에 자릿수 제한도 천 단위 구분 기호도 없다 (§0.4).
 * - **음수는 정의역 밖이다.** 차액이 음수면 술어 버그이므로 감추지 않고 `-` 를 붙여
 *   그대로 드러낸다.
 */
export function formatMeasured(sec: number): string {
  if (!Number.isFinite(sec)) return '0분'
  if (sec < 0) return `-${formatMeasured(-sec)}`

  const whole = Math.floor(sec)
  if (whole === 0) return '0분'
  if (whole < SEC_PER_MIN) return '1분 미만'

  const hours = Math.floor(whole / SEC_PER_HOUR)
  const minutes = Math.floor((whole % SEC_PER_HOUR) / SEC_PER_MIN)
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}
