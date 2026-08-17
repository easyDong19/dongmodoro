/**
 * 반응형 구간 경계. **값의 출처는 [tokens.md §4](../../../docs/design-system/tokens.md)** 이고
 * 이 파일은 그 이식본이다 — 코드에서 경계값 리터럴이 존재하는 유일한 자리다.
 *
 * 미디어 쿼리는 `var()` 를 해석하지 못해 CSS 커스텀 프로퍼티로 소비할 수 없다. 그래서
 * 브레이크포인트만은 토큰 체계의 예외로 여기에 물질화한다 (design-system ADR-001 §2).
 *
 * main 프로세스도 이 파일을 읽는다 — 창 최소 폭이 미디엄 하한과 같은 값이어야 하고,
 * 두 곳에 적으면 한쪽만 고쳐지는 날이 온다.
 */
export const BP_MEDIUM = 720
export const BP_WIDE = 1200

export type Breakpoint = 'wide' | 'medium'
