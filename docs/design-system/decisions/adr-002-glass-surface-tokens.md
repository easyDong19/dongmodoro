# ADR-002 (design-system): 유리 표면 토큰 (backdrop·하이라이트·그림자)

- 상태: accepted (2026-08-04)
- 닫는 TBD: [app-shell PRD R38](../../features/app-shell/prd.md) · [app-shell ux-spec §1](../../features/app-shell/ux-spec.md)
- 값의 출처: `docs/origin/pomodoro-mockup-v7.html` 실측 (인용만, 원본 수정 없음)

## Context

[tokens.md](../tokens.md) 는 색·폰트·radius·브레이크포인트를 토큰화했지만 **유리 표면을
유리로 보이게 하는 값 3종은 빠져 있었다** — backdrop blur 반경, inset 하이라이트,
드롭 섀도. tokens.md 변경 규칙이 "문서 없는 토큰을 코드에 먼저 만들지 않는다" 를 규율로 걸어
두었으므로, 그 값들은 문서·구현 어디에도 쓸 수 없는 상태였고 app-shell 이 이를
**셸 구현 전에 필요한 TBD**(PRD R38)로 명시해 두었다.

와이어프레임(v1)을 그리면서 이 공백이 관측 가능해졌다: 토큰만 써서 카드를 렌더하면
`--glass` 반투명 배경과 1px 보더만 남아 **평면 패널로 보인다.** 유리라는 인상은 색이
아니라 blur·하이라이트·그림자가 만든다.

값 자체는 발명할 필요가 없다. 시안 v7 에 실측값이 있고, tokens.md 의 색 토큰이 이미
그 시안에서 온 것이므로 같은 출처를 쓰는 것이 정합적이다.

| 시안 v7 선택자 | backdrop-filter | box-shadow |
|---|---|---|
| `.card` | `blur(24px) saturate(140%)` | `inset 0 1px 0 rgba(255,255,255,0.08)`, `0 12px 32px rgba(0,0,0,0.25)` |
| `.btn-primary` | `blur(8px)` | `inset 0 1px 0 rgba(255,255,255,.15)`, `0 8px 24px rgba(0,0,0,.3)` |
| `.window` | `blur(6px)` | `0 40px 90px rgba(0,0,0,0.55)` |

## Decision

### 1. 레벨은 2개다 — 표면(surface)과 컨트롤(control)

시안의 3개 레벨 중 `.window` 는 **토큰화하지 않는다.** 그것은 시안이 브라우저 안에서
데스크톱 창을 흉내내기 위해 그린 값이고, 실제 앱에서 창 그림자는 OS 가 그린다.
프레임리스 창(app-shell PRD R5)이라도 마찬가지다.

남는 두 레벨을 각각 토큰 3종으로 정의한다.

| 토큰 | 값 | 적용 대상 |
|---|---|---|
| `--glass-backdrop` | `blur(24px) saturate(140%)` | 유리 카드, MONTH 오버레이, 다이얼로그 |
| `--glass-highlight` | `inset 0 1px 0 rgba(255, 255, 255, 0.08)` | 위와 동일 |
| `--glass-shadow` | `0 12px 32px rgba(0, 0, 0, 0.25)` | 위와 동일 |
| `--control-backdrop` | `blur(8px)` | 버튼, 칩, 세그먼트 토글, 스테퍼 |
| `--control-highlight` | `inset 0 1px 0 rgba(255, 255, 255, 0.15)` | 위와 동일 |
| `--control-shadow` | `0 8px 24px rgba(0, 0, 0, 0.3)` | 위와 동일 |

- 이름은 기존 `--glass` / `--glass-strong` / `--glass-border` 계열과 같은 접두사를
  쓴다. app-shell 이 TBD 에서 부른 `--glass-blur` 는 가칭이었고, 이 ADR 이 확정 이름을
  정한다.
- **레벨 3개(오버레이 전용 등)를 만들지 않는다.** 오버레이는 표면 레벨을 그대로 쓰고
  차이는 배경 토큰으로만 준다(`--glass` → `--glass-strong`) — app-shell ux-spec §3.1 의
  기존 규칙과 그대로 맞는다.

### 2. backdrop 은 blur 반경이 아니라 **filter 값 전체**를 토큰화한다

`--glass-backdrop` 은 `24px` 이 아니라 `blur(24px) saturate(140%)` 다. 즉 소비는
`backdrop-filter: var(--glass-backdrop)` 한 줄이다.

근거: blur 와 saturate 는 한 벌로 유리 인상을 만든다. 반경만 토큰화하면 각 소비처가
saturate 를 붙이거나 빼면서 표면 질감이 갈라지고, 그 조합은 어느 문서에도 기록되지
않는다. 값 하나로 묶으면 잘못된 조합이 만들어질 수 없다.

같은 이유로 하이라이트·그림자도 오프셋·색을 쪼개지 않고 **완성된 shadow 값**으로 둔다.
두 개를 함께 쓸 때는 `box-shadow: var(--glass-highlight), var(--glass-shadow)` 로
나열한다.

### 3. spacing·모션 시간은 여전히 토큰화하지 않는다

이 ADR 의 범위는 유리 표면 3종뿐이다. [tokens.md §7](../tokens.md) 변경 규칙의
"필요해지면 실측 → ADR → 문서" 순서는 spacing·모션에 그대로 남는다. 이번에 함께 처리하지
않는 이유는 그 둘이 아직 "없어서 막힌 곳"이 없기 때문이다 — blur 는 셸 구현이 그것 없이는
시작할 수 없었다.

### 4. tokens.md 섹션 번호 이동 (문서 housekeeping)

Surface 를 **§5** 로 끼우면서 기준 CSS 는 §5 → §6, 변경 규칙은 §6 → §7 로 밀렸다.
이 자리를 고른 이유는 참조 손상이 가장 적기 때문이다 — 기존 참조 7건 중 `§4`(4건)와
`§1.4`(1건)가 그대로 살고, `§6`(2건, 둘 다 변경 규칙 의도)만 고치면 됐다.
그 2건은 이 ADR 이 닫는 TBD 블록 안에 있어 어차피 재작성 대상이었다.

## Consequences

- (+) app-shell 의 셸 구현 선행 조건(PRD R38)이 닫힌다. ux-spec §1 의 TBD 블록도 함께
  해소된다.
- (+) 와이어프레임과 구현 코드가 같은 값을 쓰므로, 와이어프레임에서 본 질감이 구현에서
  달라지지 않는다.
- (+) 잘못된 blur·saturate 조합이 구조적으로 만들어지지 않는다 (§2).
- (−) `backdrop-filter` 는 GPU 합성 비용이 있다. 카드가 여러 겹 쌓인 와이드 3컬럼에서
  Electron 렌더러 성능을 실측해야 한다. 저사양에서 문제가 되면 **토큰을 새로 만들지 않고**
  `--glass` 불투명도를 올려 blur 를 낮추는 방향으로 대응하고, 그 변경은 이 ADR 을 갱신한다.
- (−) 시안 실측값이므로 사용자 데이터에서 도출한 근거는 없다. 구현 중 조정이 필요하면
  tokens.md §5 와 이 ADR 을 함께 고친다.
- (−) 그림자 값에 raw rgba 가 들어간다 — 색 토큰(`--ink` 등)으로 표현할 수 없는 값이라
  (검정 기반 그림자, 흰색 기반 하이라이트) tokens.md 기준 CSS 블록 안에만 존재하고
  그 밖에서는 토큰 이름으로만 소비된다. 브레이크포인트에 이어 두 번째로 **색 토큰
  체계 밖에 있는 값**이며, 이 ADR 이 예외임을 명시한다.
