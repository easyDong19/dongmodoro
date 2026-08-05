# 디자인 토큰 (Primitive)

> 출처: `docs/origin/pomodoro-mockup-v7.html` (시안 v7 `:root` CSS 변수)
> 이 문서가 **토큰의 유일한 출처(single source of truth)** 다.
> 모든 기획 문서(ux-spec 등)와 구현 코드는 여기 정의된 **토큰 이름으로만** 색·폰트·radius를 기술한다. raw 값(`#6fd4b8` 등) 직접 사용 금지.

> 이 토큰을 적용한 화면 참조: [wireframes/v1-wireframe.html](./wireframes/v1-wireframe.html)
> (구속력 없는 시각 참조 — 기능 문서와 충돌하면 ux-spec·prd 가 이긴다)

프레임워크 비종속: 토큰의 기술 형식은 **CSS Custom Property** 하나로 통일한다.
React/Vue/vanilla 어디서든 `var(--token)` 으로 소비하며, JS에서 필요하면 `getComputedStyle` 로 읽는다. 별도 JS 상수 사본을 만들지 않는다.

---

## 1. Color

> **테마는 2개다 — 다크(기본)와 라이트.** 근거는
> [ADR-008](./decisions/adr-008-light-theme.md). 토큰 **이름은 두 테마가 공유하고 값만
> 재정의**하므로, ux-spec·구현 코드는 테마를 의식하지 않고 토큰 이름만 쓴다.
> 고대비 모드(`forced-colors: active`)에서는 두 테마 모두 팔레트를 포기하고 시스템 색을
> 따른다 ([ADR-006 §2](./decisions/adr-006-theme-scope.md)).
>
> **대비 기준: 텍스트 4.5:1, 아이콘·보더·의미 있는 그래픽 3:1 (WCAG 2.1 AA).**
> **판정 배경은 테마마다 다르다** — 방향이 뒤집히기 때문이다.
>
> | 테마 | 글자 | 대비가 나빠지는 방향 | 판정 배경 |
> |---|---|---|---|
> | 다크 | 밝다 | 배경이 **밝아질수록** | 광원 위 `--glass-strong` (카드 안) |
> | 라이트 | 어둡다 | 배경이 **어두워질수록** | 광원 위 **카드 밖** — 타이틀바가 그 자리다 |
>
> 근거와 실측값은 [ADR-003](./decisions/adr-003-contrast-baseline.md)(다크) ·
> [ADR-008 §2](./decisions/adr-008-light-theme.md)(라이트).
>
> `--bg-deep` 이라는 이름은 라이트에서 부정확하다. 개명 비용이 정확성보다 커서
> **알려진 부채로 수용**했다 (ADR-008 §1).

### 1.1 배경·광원

| 토큰 | 다크 | 라이트 | 용도 |
|---|---|---|---|
| `--bg-deep` | `#0c1a16` | `#e7eeec` | 앱 전체 배경 (다크 = 밤의 온실 / 라이트 = 흰색보다 어둡게 두어 카드가 떠오르게 한다) |
| `--glow-teal` | `rgba(45, 138, 120, 0.55)` | 같음 | 배경 라디얼 광원 (틸) |
| `--glow-amber` | `rgba(224, 158, 84, 0.4)` | 같음 | 배경 라디얼 광원 (앰버) |
| `--glow-moss` | `rgba(96, 140, 74, 0.35)` | 같음 | 배경 라디얼 광원 (모스) |

> **광원 실효 알파 상한: 다크 0.20 / 라이트 0.10.** 실효 알파 = 토큰 자신의 알파 × 렌더 시
> opacity 이며, `--glow-teal`(0.55) 기준 opacity 상한은 다크 0.36 · 라이트 0.18 이다.
> 라이트의 상한은 대비가 아니라 **미학** 근거다 — 밝은 배경의 컬러 광원은 탁해진다.
> 대비만 보면 라이트는 0.18 에서도 본문이 12.45:1 로 여유가 크다 (ADR-008 §2).
>
> **다크의 0.20 상한은 임의로 올리지 않는다** — 배경이 밝아지면 `--ink-dim` 이 AA 를
> 벗어난다. 고대비 모드에서는 두 테마 모두 광원과 별을 렌더하지 않는다.

### 1.2 유리 표면 (글래스모피즘)

| 토큰 | 다크 | 라이트 | 용도 |
|---|---|---|---|
| `--glass` | 흰색 `0.055` | 흰색 `0.72` | 기본 카드 표면 |
| `--glass-strong` | 흰색 `0.09` | 흰색 `0.92` | 강조 표면 (hover, 활성 요소) |
| `--glass-border` | 흰색 `0.14` | 잉크 `0.14` | **장식용** 보더 — 카드·오버레이 테두리 |
| `--glass-border-soft` | 흰색 `0.08` | 잉크 `0.08` | **장식용** 보더 — 내부 구분선 |
| `--control-border` | 잉크 `0.45` | 잉크 `0.50` | **컴포넌트 경계** — 체크박스·입력 필드·스테퍼. 3.50:1 / 3.35:1 |

> **유리의 방향이 테마마다 뒤집힌다.** 다크는 `카드 = 배경 + 흰색` 이라 카드가 배경보다
> 밝다. 라이트에서 그 관계를 유지하려면 페이지 배경이 흰색보다 어두워야 하며(`#e7eeec`),
> 그 위에 거의 흰 카드가 떠오른다. 라이트 보더가 흰색이 아니라 **잉크 기반**인 것도 같은
> 이유다 — 밝은 배경에서 흰 보더는 보이지 않는다 (ADR-008 §3).

> 보더가 두 종류인 이유 (ADR-003 §4): WCAG SC 1.4.11 의 3:1 요건은 **UI 컴포넌트의 경계**
> 에 적용되고 장식적인 카드 테두리에는 적용되지 않는다. `--glass-border` 는 1.51:1 이라
> 유리 인상을 위해 그대로 두고, 사용자가 경계를 판별해야 하는 곳만 `--control-border`
> (3.50:1)로 분리했다. 유리 표면을 지키기 위해 `--glass-border` 를 38% 로 올리지 않았다.

### 1.3 텍스트 (ink)

| 토큰 | 다크 | 다크 대비 | 라이트 | 라이트 대비 | 용도 |
|---|---|---|---|---|---|
| `--ink` | `#eef4ef` | 8.31:1 | `#0c1a16` | 13.63:1 | 본문·제목 기본 텍스트 |
| `--ink-dim` | 잉크 `0.60` | 4.61:1 | 잉크 `0.65` | 4.97:1 | 보조 텍스트 (설명, 메타, eyebrow, placeholder) |
| `--ink-faint` | 잉크 `0.32` | 2.26:1 | 잉크 `0.38` | — | **꺼져 있음 전용** — 아래 표의 용도만 |

> 라이트의 잉크는 **다크의 배경색을 그대로 재사용**한다(`#0c1a16`). 두 테마가 같은 두 색을
> 뒤집어 쓰는 구조라 색온도가 자동으로 맞는다.
> 라이트 `--ink-dim` 알파가 0.65 인 이유는 판정 지점이 **타이틀바(카드 밖)** 라서다 —
> 0.60 은 카드 위에서 4.58:1 로 통과하지만 타이틀바에서 4.27:1 로 미달한다 (ADR-008 §2).

**`--ink-faint` 는 정보를 전달하는 텍스트에 쓸 수 없다** (ADR-003 §3). 2.26:1 은 AA 는
물론 3:1 도 못 넘는다. WCAG SC 1.4.3 이 **비활성 UI 요소를 면제**하므로 그 범위에서만 쓴다.

| 허용 (면제 대상) | 금지 → `--ink-dim` 사용 |
|---|---|
| 비활성 버튼·선택 불가 항목 | eyebrow (`MONTH`/`WEEK`/`TODAY`) |
| 하한·상한에 닿은 스테퍼 버튼 | 출처 주 라벨 (`W33`) |
| 그 달에 속하지 않는 캘린더 앞·뒤 빈 칸 | 입력 placeholder |
| 미배정 요일 핍 ("부재"의 표현) | 그 밖의 모든 읽어야 하는 텍스트 |

- 애매하면 `--ink-dim` 을 쓴다. 판단은 "사용자가 이걸 읽어야 하는가" 하나다.
- `--ink-dim` 이 55% → 60% 로 오른 대가: 감쇠 표현(지난달 카드 등)이 약해진다. 색이 아닌
  수단으로 보강한다 (ADR-003 Consequences).

### 1.4 액센트·시맨틱

| 토큰 | 다크 | 다크 대비 | 라이트 | 라이트 대비 | 용도 |
|---|---|---|---|---|---|
| `--teal` | `#6fd4b8` | 5.20:1 | `#216e59` | 4.66:1 | 주 액센트. 진행·집중·긍정 상태. 텍스트 가능 |
| `--amber` | `#f0b671` | 5.14:1 | `#8f550f` | 4.61:1 | 부 액센트. 예산 초과(`+N` 배지)·휴식·온기. 텍스트 가능 |
| `--danger` | `#e8907e` | 3.85:1 | `#b13820` | 4.63:1 | **파괴적 행위 전용**. **두 테마 모두 텍스트 색으로 쓰지 않는다** |

> 라이트 액센트는 **색상(hue)·채도를 그대로 두고 명도만 내린** 값이다 — teal 163° ·
> amber 33° · danger 13° 가 두 테마에서 같다. 그래서 principles §3 의 상태 → 색 매핑이
> 테마와 무관하게 유지된다. 다크 액센트를 라이트 배경에 그대로 쓰면 1.66~2.25:1 로
> 전멸한다 (ADR-008 Context).

- **`--danger` 는 아이콘·보더·배경 강조에만 쓴다** (비텍스트 3:1 통과). 파괴적 액션의
  라벨 글자는 `--ink` 다 — 의미는 아이콘과 문구가 이미 전달한다 (ADR-003 §5, principles §2).
- `--danger` 를 성과·미달 표현에 쓰지 않는다 — [principles.md](./principles.md) §2.
- 타이머 링 그라디언트는 `--teal` → `--amber` 조합으로만 만든다. 별도 그라디언트용 색을
  추가하지 않는다.

---

## 2. Font

### 2.1 패밀리

| 토큰 | 값 | 용도 |
|---|---|---|
| `--font-sans` | `'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif` | 본문·UI 전체 |
| `--font-mono` | `'Azeret Mono', ui-monospace, monospace` | 숫자·타이머·카운트 전용. 반드시 `font-variant-numeric: tabular-nums` 와 함께 사용 |

> **원천과의 차이:** 시안 v7과 PRD §4는 본문 폰트로 Gothic A1을 지정했으나, **Pretendard로 교체 결정** (2026-08-03, 사용자 결정). 숫자용 Azeret Mono는 유지.
> 오프라인 동작을 위해 두 폰트 모두 **로컬 번들** (PRD §4 요구사항).

### 2.2 크기 (type scale)

시안 v7에는 8.5~56px 사이 16개 크기가 산재한다. 이를 아래 **7단계**로 정규화한다.
구현·문서에서 이 7단계 외의 font-size 를 새로 만들지 않는다.

**폰트 크기만 `rem` 이다** ([ADR-007](./decisions/adr-007-font-size-rem.md)). 루트를
`html { font-size: 62.5% }` 로 두어 **1rem = 10px** 이며, 값이 읽기 쉬운 것이 채택 이유다.
퍼센트이므로 사용자 기본 글자 크기에 대한 비례성은 보존된다.

| 토큰 | 값 | (= px) | 흡수하는 시안 값 | 용도 |
|---|---|---|---|---|
| `--text-2xs` | `0.9rem` | 9px | 8.5, 9, 9.5px | eyebrow 라벨(대문자), 미세 배지 |
| `--text-xs` | `1rem` | 10px | 10, 10.5px | 캡션, 메타 정보, 보조 배지 |
| `--text-sm` | `1.1rem` | 11px | 11, 11.5px | 리스트 항목, 보조 본문 |
| `--text-md` | `1.2rem` | 12px | 12, 12.5px | 기본 본문 |
| `--text-lg` | `1.4rem` | 14px | 13, 14, 15px | 카드 제목, 강조 본문 |
| `--text-xl` | `1.7rem` | 17px | 17px | 화면 단위 제목 |
| `--text-display` | `5.6rem` | 56px | 46, 56px | 타이머 디스플레이 전용 (`--font-mono`) |

- **`body` 에 `--text-md` 를 명시한다.** 루트가 62.5% 이므로 이것을 빠뜨리면 기본 본문이
  10px 로 렌더된다.
- **rem 은 폰트 크기에만 쓴다.** radius·보더·`--target-min`·브레이크포인트는 px 다 —
  특히 `--target-min` 은 WCAG 2.2 SC 2.5.8 이 "24 **CSS px**" 절대값을 요구하므로 rem 이
  될 수 없다 (ADR-007 §1).
- **타이머 링 지름은 `em`** 으로 두어 `--text-display` 와 함께 비례 확대된다. px 고정이면
  글자가 커질 때 `88:88` 이 링을 넘친다 (ADR-007 §3).

### 2.3 굵기

| 토큰 | 값 | 용도 |
|---|---|---|
| `--weight-regular` | `400` | 본문 |
| `--weight-semibold` | `600` | 제목·강조·버튼 (시안의 지배적 굵기) |
| `--weight-bold` | `700` | 타이머 숫자 등 최상위 강조 |

> 시안의 300(light)·500(medium)은 위 3단계로 흡수한다. 3단계 외 굵기 추가 금지.

### 2.4 자간

| 토큰 | 값 | 용도 |
|---|---|---|
| `--tracking-normal` | `0` | 본문 기본 |
| `--tracking-wide` | `0.05em` | 대문자 라벨, 버튼 |
| `--tracking-wider` | `0.14em` | eyebrow (MONTH/WEEK/TODAY) |

---

## 3. Radius

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | `9px` | 배지, 작은 입력 요소 |
| `--radius-md` | `13px` | 버튼, 리스트 항목, 내부 카드 |
| `--radius-lg` | `20px` | 최상위 유리 카드 |

> **px 유지다.** 모서리가 글자 크기에 따라 변할 이유가 없다 (ADR-007 §1).

---

## 4. Breakpoint

> 근거: [decisions/adr-001-breakpoint-tokens.md](./decisions/adr-001-breakpoint-tokens.md) (Q17·Q17-1)

| 토큰 | 값 | 정의하는 구간 |
|---|---|---|
| `--bp-wide` | `1200px` | 와이드 (`≥ 1200px`): 3컬럼 |
| `--bp-medium` | `800px` | 미디엄 (`800–1199px`): MONTH 접힘, WEEK/TODAY 유지 |
| (기본) | — | 내로우 (`< 800px`): 1컬럼 — 타이머 상단 고정 + 탭 |

> **예외 — CSS 변수로 소비 불가.** 미디어 쿼리는 `var()` 를 해석하지 못하므로,
> 이 두 값만은 Tailwind `screens` 설정에 물질화해 소비한다. 이 표가 값의 유일한
> 출처이며, 변경 시 설정 상수를 함께 고친다 (ADR-001 §2).
>
> 최소 창 크기: 목표 ~420×640, app-shell 구현 시 실측 후 이 표에 확정값 기록 (TBD).

---

## 5. Surface (유리 표면)

> 근거: [decisions/adr-002-glass-surface-tokens.md](./decisions/adr-002-glass-surface-tokens.md)
> 값의 출처는 시안 v7 실측(`.card` · `.btn-primary`)이다.

유리 표면을 유리로 보이게 하는 값 3종(backdrop·inset 하이라이트·드롭 섀도)이며,
레벨은 **표면(surface)** 과 **컨트롤(control)** 2개다. 레벨 추가는 ADR 사안이다.

| 토큰 | 다크 | 라이트 | 적용 대상 |
|---|---|---|---|
| `--glass-backdrop` | `blur(24px) saturate(140%)` | 같음 | 유리 카드, MONTH 오버레이, 다이얼로그 |
| `--glass-highlight` | `inset 0 1px 0 rgba(255,255,255,0.08)` | 흰색 `0.9` | 위와 동일 |
| `--glass-shadow` | `0 12px 32px rgba(0,0,0,0.25)` | 잉크 `0.10` | 위와 동일 |
| `--control-backdrop` | `blur(8px)` | 같음 | 버튼, 칩, 세그먼트 토글, 스테퍼 |
| `--control-highlight` | `inset 0 1px 0 rgba(255,255,255,0.15)` | 흰색 `0.9` | 위와 동일 |
| `--control-shadow` | `0 8px 24px rgba(0,0,0,0.3)` | 잉크 `0.12` | 위와 동일 |

> 라이트의 그림자는 **순검정이 아니라 잉크 기반**이고 알파가 낮다 — 밝은 배경에서 검정
> 그림자는 지저분해진다. 하이라이트는 반대로 알파를 높인다(흰 카드의 위 모서리 광택).
> `--glass-backdrop`·`--control-backdrop` 은 두 테마 공통이다 (ADR-008 §3).

- **backdrop 은 blur 반경이 아니라 filter 값 전체다** — 소비는
  `backdrop-filter: var(--glass-backdrop)` 한 줄이며, 소비처가 `saturate` 를 따로
  붙이거나 빼지 않는다 (ADR-002 §2).
- 하이라이트와 그림자를 함께 쓸 때는 나열한다:
  `box-shadow: var(--glass-highlight), var(--glass-shadow)`.
- 오버레이는 전용 레벨을 갖지 않는다 — 표면 레벨을 그대로 쓰고 차이는 배경 토큰으로만
  준다 (`--glass` → `--glass-strong`).
- **창 자체의 그림자는 토큰이 아니다.** 시안 `.window` 의 blur·그림자는 브라우저에서
  데스크톱 창을 흉내낸 값이고, 실제 앱에서는 OS 가 그린다 (ADR-002 §1).
- 그림자·하이라이트의 raw rgba 는 §6 기준 CSS 블록 안에만 존재한다. 검정 기반 그림자와
  흰색 기반 하이라이트는 색 토큰(`--ink` 등)으로 표현할 수 없어, 브레이크포인트에 이어
  **색 토큰 체계 밖에 있는 두 번째 예외**다 (ADR-002 Consequences).

---

## 6. Motion (전이 시간·이징)

> 근거: [decisions/adr-005-motion-and-layer.md](./decisions/adr-005-motion-and-layer.md)
> 값의 출처는 시안 v7 의 `transition` 실측이다.

| 토큰 | 값 | 용도 | 흡수한 시안 값 |
|---|---|---|---|
| `--motion-fast` | `150ms` | hover, 색·배경·보더 전이, 포커스 링 | `.15s`(15회), `.2s`(3회) |
| `--motion-medium` | `300ms` | 오버레이 슬라이드, 드로어 펼침, 섹션 접힘 | `.3s` |
| `--motion-slow` | `400ms` | 진행 바 width, 타이머 링 채움 | `.4s` |
| `--ease-standard` | `ease` | 전부 | 시안이 실제로 쓴 값 |

- 3단계 밖의 시간을 새로 만들지 않는다. `--ease-standard` 를 그럴싸한 `cubic-bezier` 로
  바꾸지 않는다 — 더 나은 곡선이 필요하다는 근거가 아직 없다 (ADR-005 §1).
- **`prefers-reduced-motion: reduce` 는 이 토큰들을 `0ms` 로 재정의해 처리한다.**
  `* { transition: none !important }` 전역 킬은 폐기됐다 — 상태 변화 피드백까지 죽이기
  때문이다 (ADR-005 §2, [principles.md §4](./principles.md)).
- 장식성 무한 애니메이션 금지는 그대로다. 초과 글로우는 정적 처리다.

---

## 7. Layer (스태킹 순서)

> 근거: [decisions/adr-005-motion-and-layer.md](./decisions/adr-005-motion-and-layer.md) §3
> app-shell 명세에 실재하는 레이어만 정의한다. 미래를 위한 빈 칸을 만들지 않는다.

| 토큰 | 값 | 대상 |
|---|---|---|
| `--layer-base` | `0` | 카드·컬럼. 정산 배너도 여기다 (카드 안 인라인이므로) |
| `--layer-sticky` | `10` | 내로우 축약형 고정 바, 카드 하단 고정 게이지 |
| `--layer-overlay` | `20` | MONTH 오버레이, 첫 실행 온보딩 오버레이 |
| `--layer-dialog` | `30` | 종료 확인, 삭제 확인 |
| `--layer-toast` | `40` | 정산 확정 결과 토스트 |

- 배경 광원·별은 `z-index: -1` 로 두고, 창 요소에 `isolation: isolate` 를 걸어 그 음수
  값이 창 배경 위에만 머무르게 한다.
- 이 5단계 밖의 값을 코드에 직접 쓰지 않는다. 새 레이어는 ADR 로 추가한다.

---

## 8. Interaction (포커스·조작 타깃)

> 근거: [decisions/adr-004-focus-and-target.md](./decisions/adr-004-focus-and-target.md)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--focus-ring-width` | `2px` | 포커스 링 두께 |
| `--focus-ring-offset` | `2px` | 요소 보더와 겹치지 않게 띄우는 거리 |
| `--focus-ring-color` | `#eef4ef` (`--ink` 와 같은 값) | 포커스 링 색. 9.61:1 |
| `--target-min` | `24px` | 조작 가능한 요소의 히트 영역 최소 (WCAG 2.2 SC 2.5.8 AA) |

- **포커스 링은 `--ink` 기반이다.** `--teal`·`--amber` 는 상태 → 색 매핑에 의미가 이미
  배정돼 있어 포커스에 쓰면 "포커스된 것"과 "진행 중인 것"이 같은 색이 된다 (ADR-004 §1).
- `:focus-visible` 에서만 링을 그린다 — 마우스 클릭에 링이 뜨지 않게 `:focus` 를 쓰지 않는다.
- `outline: none` 을 대체 표시 없이 쓰지 않는다.
- **히트 영역은 시각적 크기와 무관하게 `--target-min` 이상이다. 라벨·아이콘을 키워 이를
  달성하지 않는다** — 투명 패딩 또는 `::after` 확장으로 넓힌다 (ADR-004 §2). 9px 라벨을
  유지하면서 3컬럼 밀도를 지키기 위한 규칙이다.
- 인접 컨트롤의 히트 영역이 겹치지 않는다. 겹치면 간격을 늘린다.

---

## 9. 기준 CSS (구현 시 이 블록을 그대로 이식)

```css
/* 루트 62.5% = 1rem 10px. 폰트 크기만 rem 이다 (ADR-007).
   퍼센트이므로 사용자 기본 글자 크기에 대한 비례성은 보존된다. */
html { font-size: 62.5%; }
body { font-size: var(--text-md); }   /* 빠뜨리면 본문이 10px 로 렌더된다 */

:root {
  /* ── 테마 무관 ────────────────────────────────── */

  /* font */
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system,
    'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  --font-mono: 'Azeret Mono', ui-monospace, monospace;

  --text-2xs: 0.9rem;    /* 9px  */
  --text-xs: 1rem;       /* 10px */
  --text-sm: 1.1rem;     /* 11px */
  --text-md: 1.2rem;     /* 12px */
  --text-lg: 1.4rem;     /* 14px */
  --text-xl: 1.7rem;     /* 17px */
  --text-display: 5.6rem;/* 56px */

  --weight-regular: 400;
  --weight-semibold: 600;
  --weight-bold: 700;

  --tracking-normal: 0;
  --tracking-wide: 0.05em;
  --tracking-wider: 0.14em;

  /* radius — px 유지 (모서리는 글자 크기와 무관하다) */
  --radius-sm: 9px;
  --radius-md: 13px;
  --radius-lg: 20px;

  /* surface — backdrop 은 두 테마 공통 (ADR-002) */
  --glass-backdrop: blur(24px) saturate(140%);
  --control-backdrop: blur(8px);

  /* motion (ADR-005) */
  --motion-fast: 150ms;
  --motion-medium: 300ms;
  --motion-slow: 400ms;
  --ease-standard: ease;

  /* layer (ADR-005) */
  --layer-base: 0;
  --layer-sticky: 10;
  --layer-overlay: 20;
  --layer-dialog: 30;
  --layer-toast: 40;

  /* interaction (ADR-004) — px 필수: SC 2.5.8 이 24 CSS px 절대값을 요구한다 */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --target-min: 24px;

  /* ── 다크 = 기본 테마 ──────────────────────────── */

  --bg-deep: #0c1a16;
  --glow-teal: rgba(45, 138, 120, 0.55);
  --glow-amber: rgba(224, 158, 84, 0.4);
  --glow-moss: rgba(96, 140, 74, 0.35);
  --glow-opacity: 0.36;              /* 실효 알파 상한 0.20 (ADR-003 §2) */

  --glass: rgba(255, 255, 255, 0.055);
  --glass-strong: rgba(255, 255, 255, 0.09);
  --glass-border: rgba(255, 255, 255, 0.14);        /* 장식용 */
  --glass-border-soft: rgba(255, 255, 255, 0.08);   /* 장식용 */
  --control-border: rgba(238, 244, 239, 0.45);      /* 컴포넌트 경계 — 3.50:1 */

  --ink: #eef4ef;
  --ink-dim: rgba(238, 244, 239, 0.60);   /* 4.61:1 */
  --ink-faint: rgba(238, 244, 239, 0.32); /* 꺼져 있음 전용 — §1.3 허용 표 */

  --teal: #6fd4b8;
  --amber: #f0b671;
  --danger: #e8907e;

  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  --control-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.15);
  --control-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);

  --focus-ring-color: #eef4ef;   /* --ink 와 같은 값 (ADR-004) */
}

/* ── 라이트 테마 (ADR-008) ──────────────────────────
   토큰 이름은 그대로, 값만 재정의한다. 기능 문서는 테마를 의식하지 않는다.
   OS 선호를 따르되 data-theme 이 그것을 덮어쓴다. */
@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) { /* 아래 --light-* 블록과 같은 값 */ }
}

:root[data-theme='light'],
:root:not([data-theme='dark']):is(.light-preference) {
  --bg-deep: #e7eeec;                /* 흰색보다 어둡게 — 카드가 떠오르게 (ADR-008 §3) */
  --glow-opacity: 0.18;              /* 실효 알파 상한 0.10 — 미학 근거 */

  --glass: rgba(255, 255, 255, 0.72);
  --glass-strong: rgba(255, 255, 255, 0.92);
  --glass-border: rgba(12, 26, 22, 0.14);          /* 잉크 기반 — 흰 보더는 안 보인다 */
  --glass-border-soft: rgba(12, 26, 22, 0.08);
  --control-border: rgba(12, 26, 22, 0.50);        /* 3.35:1 */

  --ink: #0c1a16;                    /* 다크의 배경색을 재사용한다 */
  --ink-dim: rgba(12, 26, 22, 0.65); /* 4.97:1 — 판정 지점이 타이틀바(카드 밖)다 */
  --ink-faint: rgba(12, 26, 22, 0.38);

  --teal: #216e59;                   /* 색상 163° 유지, 명도만 내림 */
  --amber: #8f550f;                  /* 색상 33° */
  --danger: #b13820;                 /* 색상 13° */

  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --glass-shadow: 0 12px 32px rgba(12, 26, 22, 0.10);
  --control-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --control-shadow: 0 8px 24px rgba(12, 26, 22, 0.12);

  --focus-ring-color: #0c1a16;
}

/* 움직임을 줄이되 상태 변화 피드백은 남긴다 (ADR-005 §2) */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-medium: 0ms;
    --motion-slow: 0ms;
  }
}

/* 고대비 모드는 테마보다 우선한다 — 두 테마 모두 팔레트를 포기한다 (ADR-006 §2) */
@media (forced-colors: active) {
  :root { --glow-opacity: 0; }
  .card, .overlay, .dialog { backdrop-filter: none; border: 1px solid CanvasText; }
}
```

> **구현 메모.** 위 블록의 라이트 선택자는 문서용 축약이다. 실제 구현에서는 라이트 값을
> CSS 커스텀 프로퍼티 세트 하나로 두고 `@media (prefers-color-scheme: light)` 와
> `[data-theme='light']` 두 곳에서 같은 세트를 참조하도록 구성한다(중복 정의를 만들지
> 않는다). `data-theme` 값은 `settings` 테이블의 `theme` 키(`system`/`light`/`dark`)에서
> 오며, 전환 경로는 트레이 메뉴다 (ADR-008 §4).

---

## 10. 변경 규칙

- 토큰 **추가·변경·삭제는 ADR** (`docs/features/<관련 기능>/decisions/` 또는 전역 결정이면 이 폴더의 `decisions/`)로 근거를 남긴 뒤에만 한다.
- 시안 v7과 값이 달라지는 결정은 이 문서에 `> 원천과의 차이:` 블록으로 명시한다 (§2.1 폰트 교체가 선례).
- **spacing 은 아직 토큰화하지 않았다.** 시안 실측값이 2·3·4·5·6·7·8·9·10·12·14·16·20px
  로 거의 연속이라, 여기서 단계를 뽑으면 실측이 아니라 발명이 된다. **실제 레이아웃을 코드로
  짤 때(M1 Task 7) 결정한다** — 그때 [ADR-004](./decisions/adr-004-focus-and-target.md) 의
  `--target-min` 을 제약으로 함께 본다.
- 토큰화가 끝난 범주: 색(§1) · 폰트(§2) · radius(§3) · 브레이크포인트(§4) · 유리 표면(§5) ·
  모션(§6) · 레이어(§7) · 인터랙션(§8). **문서 없는 토큰을 코드에 먼저 만들지 않는다.**
- **색 토큰을 바꿀 때는 두 테마를 함께 본다** (§1). 한쪽만 고치면 다른 테마가 조용히 기준을
  벗어난다. 판정 배경이 테마마다 다르다는 점도 함께 확인한다 (§1 머리말 표).
- **단위를 바꾸지 않는다**: 폰트 크기만 rem, 그 밖은 px. 특히 `--target-min` 을 rem 으로
  바꾸면 WCAG 2.2 SC 2.5.8 위반이 된다 ([ADR-007](./decisions/adr-007-font-size-rem.md) §1).

> **원천과의 차이 (2026-08-05, ADR-003):** `--ink-dim` 을 시안의 0.55 에서 **0.60** 으로
> 올렸고, 배경 광원의 실효 알파에 **0.20 상한**을 걸었다. 시안 v7 은 대비 검증을 거치지
> 않은 초안이며, 시안 값 그대로는 보조 텍스트가 WCAG AA(4.5:1)를 만족하지 못한다.
>
> **원천과의 차이 (2026-08-05, ADR-007·ADR-008):** 폰트 크기를 px 에서 **rem** 으로 바꿨고,
> 시안에 없던 **라이트 테마**를 추가했다. 시안 v7 은 다크 단일 팔레트다.
