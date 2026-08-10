import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **정의만 되고 소비되지 않는 디자인 토큰을 막는다.**
 *
 * M3a 를 끝낸 시점에 `--glass-backdrop`·`--glass-shadow`·`--glass-highlight`·`--glow-*` 가
 * tokens.css 에 전부 있는데 화면 어디서도 쓰이지 않아 카드가 단색으로 렌더됐다. M1 이
 * 토큰만 옮기고 스킨을 미뤘고, 그 뒤 아무도 소비처를 만들지 않았는데 **어떤 검사도
 * 그것을 잡지 못했다** — 값이 존재한다는 사실은 화면에 대해 아무것도 보장하지 않는다.
 *
 * 이 검사가 `scripts/` 에 있는 이유: 스타일시트를 파일로 읽어야 하는데 renderer 는
 * tsconfig 에 node 타입이 없고(ADR-008 의 프로세스 경계), vitest 는 기본적으로 CSS 처리를
 * 꺼 두어 `?raw` 임포트가 빈 문자열이 된다. `check-pr-language.test.mjs` 와 같은 부류의
 * 저장소 규칙 검사다.
 */
const root = join(fileURLToPath(import.meta.url), '../..')
const styles = join(root, 'src/renderer/shared/styles')
const global = readFileSync(join(styles, 'global.css'), 'utf8')
const tokens = readFileSync(join(styles, 'tokens.css'), 'utf8')

/** 규칙 하나에 해당하는 블록만 잘라낸다 — 다른 규칙의 선언이 섞여 통과하지 않게. */
function rule(css, selector) {
  const at = css.indexOf(`\n${selector} {`)
  if (at === -1) throw new Error(`rule not found: ${selector}`)
  return css.slice(at, css.indexOf('}', at))
}

describe('배경 광원 (tokens.md §1.1)', () => {
  const glow = rule(global, 'body::before')

  it('라디얼 광원 3종을 전부 깐다', () => {
    for (const token of ['--glow-teal', '--glow-amber', '--glow-moss']) {
      expect(glow).toContain(token)
    }
    expect(glow.match(/radial-gradient/g)).toHaveLength(3)
  })

  it('실효 알파 상한을 토큰으로 건다 — 하드코딩한 opacity 를 쓰지 않는다', () => {
    expect(glow).toMatch(/opacity:\s*var\(--glow-opacity\)/)
  })

  it('고대비 모드에서 꺼진다 — 그 스위치가 --glow-opacity 다', () => {
    const forced = tokens.slice(tokens.indexOf('@media (forced-colors: active)'))
    expect(forced).toMatch(/--glow-opacity:\s*0/)
  })

  it('정적이다 — 장식성 무한 애니메이션 금지 (principles §4)', () => {
    expect(glow).not.toMatch(/animation|@keyframes/)
  })

  it('클릭을 가로채지 않고 콘텐츠 뒤에 깔린다', () => {
    expect(glow).toMatch(/pointer-events:\s*none/)
    expect(glow).toMatch(/z-index:\s*-1/)
  })
})

describe('유리 카드 표면 (design-system ADR-002)', () => {
  const card = rule(global, '.card')

  it('표면 3종을 전부 토큰으로 소비한다', () => {
    expect(card).toMatch(/background:\s*var\(--glass\)/)
    expect(card).toMatch(/border:\s*1px solid var\(--glass-border\)/)
    expect(card).toMatch(/backdrop-filter:\s*var\(--glass-backdrop\)/)
  })

  it('하이라이트와 그림자를 한 box-shadow 에 나열한다 (ADR-002 §2)', () => {
    expect(card).toMatch(/box-shadow:\s*var\(--glass-highlight\),\s*var\(--glass-shadow\)/)
  })

  it('raw 값을 새로 만들지 않는다 — hex 색과 blur 반경 직접 기입 금지 (tokens.md §10)', () => {
    expect(card).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(card).not.toMatch(/blur\(/)
  })
})

describe('컨트롤 표면 (design-system ADR-002 §1)', () => {
  it('컨트롤 backdrop 을 토큰으로 소비한다 — 카드와 다른 레벨이다', () => {
    expect(rule(global, '.control')).toMatch(/backdrop-filter:\s*var\(--control-backdrop\)/)
  })

  it('떠 있는 컨트롤은 하이라이트와 그림자를 함께 나열한다', () => {
    expect(rule(global, '.control-raised')).toMatch(
      /box-shadow:\s*var\(--control-highlight\),\s*var\(--control-shadow\)/
    )
  })

  it('레벨을 3개로 늘리지 않는다 — 표면과 컨트롤 둘뿐이다 (ADR-002 §1)', () => {
    // `--overlay-backdrop` 류를 새로 만들면 여기서 걸린다. 오버레이는 표면 레벨을
    // 그대로 쓰고 차이는 배경 토큰(`--glass` → `--glass-strong`)으로만 준다.
    expect(global).not.toMatch(/--overlay-backdrop|--dialog-backdrop/)
  })
})

describe('카드 타이포 (시안 .card-head)', () => {
  it('eyebrow 는 2xs + wider 자간이고 --ink-dim 이다', () => {
    const eyebrow = rule(global, '.eyebrow')
    expect(eyebrow).toMatch(/font-size:\s*var\(--text-2xs\)/)
    expect(eyebrow).toMatch(/letter-spacing:\s*var\(--tracking-wider\)/)
    // 컬럼이 어느 레이어인지 알리는 유일한 표지라 faint 가 아니라 dim 이다 (ADR-003 §3).
    expect(eyebrow).toMatch(/color:\s*var\(--ink-dim\)/)
    expect(eyebrow).not.toMatch(/--ink-faint/)
  })

  it('카드 제목은 lg + semibold 다 — 본문과 같은 크기로 두지 않는다', () => {
    const title = rule(global, '.card-title')
    expect(title).toMatch(/font-size:\s*var\(--text-lg\)/)
    expect(title).toMatch(/font-weight:\s*var\(--weight-semibold\)/)
  })

  it('타이포도 raw 값을 새로 만들지 않는다', () => {
    for (const selector of ['.eyebrow', '.card-title']) {
      expect(rule(global, selector)).not.toMatch(/\b\d+(\.\d+)?(px|rem|em)\b/)
    }
  })
})
