# 디자인 토큰 (Primitive)

> 출처: `docs/origin/pomodoro-mockup-v7.html` (시안 v7 `:root` CSS 변수)
> 이 문서가 **토큰의 유일한 출처(single source of truth)** 다.
> 모든 기획 문서(ux-spec 등)와 구현 코드는 여기 정의된 **토큰 이름으로만** 색·폰트·radius를 기술한다. raw 값(`#6fd4b8` 등) 직접 사용 금지.

프레임워크 비종속: 토큰의 기술 형식은 **CSS Custom Property** 하나로 통일한다.
React/Vue/vanilla 어디서든 `var(--token)` 으로 소비하며, JS에서 필요하면 `getComputedStyle` 로 읽는다. 별도 JS 상수 사본을 만들지 않는다.

---

## 1. Color

### 1.1 배경·광원

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg-deep` | `#0c1a16` | 앱 전체 배경 (밤의 온실 베이스) |
| `--glow-teal` | `rgba(45, 138, 120, 0.55)` | 배경 라디얼 광원 (틸) |
| `--glow-amber` | `rgba(224, 158, 84, 0.4)` | 배경 라디얼 광원 (앰버) |
| `--glow-moss` | `rgba(96, 140, 74, 0.35)` | 배경 라디얼 광원 (모스) |

### 1.2 유리 표면 (글래스모피즘)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--glass` | `rgba(255, 255, 255, 0.055)` | 기본 카드 표면 |
| `--glass-strong` | `rgba(255, 255, 255, 0.09)` | 강조 표면 (hover, 활성 요소) |
| `--glass-border` | `rgba(255, 255, 255, 0.14)` | 카드 1px 보더 |
| `--glass-border-soft` | `rgba(255, 255, 255, 0.08)` | 내부 구분선, 약한 보더 |

### 1.3 텍스트 (ink)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ink` | `#eef4ef` | 본문·제목 기본 텍스트 |
| `--ink-dim` | `rgba(238, 244, 239, 0.55)` | 보조 텍스트 (설명, 메타) |
| `--ink-faint` | `rgba(238, 244, 239, 0.32)` | 비활성·placeholder·eyebrow |

### 1.4 액센트·시맨틱

| 토큰 | 값 | 용도 |
|---|---|---|
| `--teal` | `#6fd4b8` | 주 액센트. 진행·집중·긍정 상태 |
| `--amber` | `#f0b671` | 부 액센트. 예산 초과(`+N 🔥`)·휴식·온기 표현 |
| `--danger` | `#e8907e` | **파괴적 행위 전용** (삭제 hover, drop 선택). 성과·미달 표현에 사용 금지 — [principles.md](./principles.md) §2 |

> 타이머 링 그라디언트는 `--teal` → `--amber` 조합으로만 만든다. 별도 그라디언트용 색을 추가하지 않는다.

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

| 토큰 | 값 | 흡수하는 시안 값 | 용도 |
|---|---|---|---|
| `--text-2xs` | `9px` | 8.5, 9, 9.5px | eyebrow 라벨(대문자), 미세 배지 |
| `--text-xs` | `10px` | 10, 10.5px | 캡션, 메타 정보, 보조 배지 |
| `--text-sm` | `11px` | 11, 11.5px | 리스트 항목, 보조 본문 |
| `--text-md` | `12px` | 12, 12.5px | 기본 본문 |
| `--text-lg` | `14px` | 13, 14, 15px | 카드 제목, 강조 본문 |
| `--text-xl` | `17px` | 17px | 화면 단위 제목 |
| `--text-display` | `56px` | 46, 56px | 타이머 디스플레이 전용 (`--font-mono`) |

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

---

## 4. 기준 CSS (구현 시 이 블록을 그대로 이식)

```css
:root {
  /* color — 배경·광원 */
  --bg-deep: #0c1a16;
  --glow-teal: rgba(45, 138, 120, 0.55);
  --glow-amber: rgba(224, 158, 84, 0.4);
  --glow-moss: rgba(96, 140, 74, 0.35);

  /* color — 유리 표면 */
  --glass: rgba(255, 255, 255, 0.055);
  --glass-strong: rgba(255, 255, 255, 0.09);
  --glass-border: rgba(255, 255, 255, 0.14);
  --glass-border-soft: rgba(255, 255, 255, 0.08);

  /* color — 텍스트 */
  --ink: #eef4ef;
  --ink-dim: rgba(238, 244, 239, 0.55);
  --ink-faint: rgba(238, 244, 239, 0.32);

  /* color — 액센트·시맨틱 */
  --teal: #6fd4b8;
  --amber: #f0b671;
  --danger: #e8907e;

  /* font */
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system,
    'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  --font-mono: 'Azeret Mono', ui-monospace, monospace;

  --text-2xs: 9px;
  --text-xs: 10px;
  --text-sm: 11px;
  --text-md: 12px;
  --text-lg: 14px;
  --text-xl: 17px;
  --text-display: 56px;

  --weight-regular: 400;
  --weight-semibold: 600;
  --weight-bold: 700;

  --tracking-normal: 0;
  --tracking-wide: 0.05em;
  --tracking-wider: 0.14em;

  /* radius */
  --radius-sm: 9px;
  --radius-md: 13px;
  --radius-lg: 20px;
}
```

---

## 5. 변경 규칙

- 토큰 **추가·변경·삭제는 ADR** (`docs/features/<관련 기능>/decisions/` 또는 전역 결정이면 이 폴더의 `decisions/`)로 근거를 남긴 뒤에만 한다.
- 시안 v7과 값이 달라지는 결정은 이 문서에 `> 원천과의 차이:` 블록으로 명시한다 (§2.1 폰트 교체가 선례).
- spacing·shadow·모션 시간 등은 아직 토큰화하지 않았다. 필요해지면 시안 실측 → ADR → 이 문서에 추가 순서를 따른다. **문서 없는 토큰을 코드에 먼저 만들지 않는다.**
