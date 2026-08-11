import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BG_DEEP, OVERLAY_COLORS } from './theme-colors'

/**
 * 이 테스트가 `theme-colors.ts` 의 존재를 정당화한다.
 *
 * 창 컨트롤 색은 CSS 를 읽을 수 없는 프로세스가 쓰므로 tokens.css 밖에 한 벌 더 있다
 * (design-system ADR-010 §5). 두 벌이 존재하는 이상 **어긋날 수 있다는 것이 문제**이고,
 * 여기서 원본을 직접 읽어 대조함으로써 그 어긋남을 커밋 전에 잡는다.
 *
 * tokens.css 를 **import 하지 않고 파일로 읽는다** — CSS 를 import 하면 main 이 renderer 를
 * 의존하게 되어 프로세스 경계(ADR-008)를 깬다. 여기서는 그 파일이 소스가 아니라
 * **검사 대상 데이터**다.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'src/renderer/shared/styles/tokens.css'), 'utf8')

/**
 * 토큰 하나의 값을 뽑는다. 줄 시작에 앵커를 거는 것이 핵심이다 — 앵커가 없으면
 * `--ink` 가 `--light-ink` 에도, `--bg-deep` 이 `--light-bg-deep` 에도 걸려 두 테마의 값이
 * 뒤바뀐 채로 통과한다.
 */
function tokenValue(name: string): string {
  const match = TOKENS_CSS.match(new RegExp(`^\\s*--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'm'))
  if (!match) throw new Error(`tokens.css 에서 --${name} 를 찾지 못했습니다`)
  return match[1]
}

describe('창 컨트롤 오버레이 색 — tokens.css 와의 대조 (design-system ADR-010 §5)', () => {
  it('다크 오버레이가 --bg-deep · --ink 와 같다', () => {
    expect(OVERLAY_COLORS.dark.color).toBe(tokenValue('bg-deep'))
    expect(OVERLAY_COLORS.dark.symbolColor).toBe(tokenValue('ink'))
  })

  it('라이트 오버레이가 --light-bg-deep · --light-ink 와 같다', () => {
    expect(OVERLAY_COLORS.light.color).toBe(tokenValue('light-bg-deep'))
    expect(OVERLAY_COLORS.light.symbolColor).toBe(tokenValue('light-ink'))
  })

  /**
   * 두 테마가 같은 두 색을 뒤집어 쓴다 (ADR-008 §2 — 라이트 잉크는 다크의 배경색을
   * 재사용한다). 그 관계가 깨지면 팔레트 자체가 바뀐 것이므로 여기서 알아야 한다.
   */
  it('다크 배경색과 라이트 글리프색이 같은 색이다', () => {
    expect(OVERLAY_COLORS.light.symbolColor).toBe(OVERLAY_COLORS.dark.color)
  })

  /**
   * 창 자체의 배경색이다. **첫 페인트 전에 화면에 나가는 유일한 색**이므로 어긋나면
   * 사용자가 기동할 때마다 잘못된 색을 한 번 본다 — 오버레이보다 눈에 잘 띄는 자리다.
   */
  it('창 배경색이 두 테마의 --bg-deep 과 같다', () => {
    expect(BG_DEEP.dark).toBe(tokenValue('bg-deep'))
    expect(BG_DEEP.light).toBe(tokenValue('light-bg-deep'))
    // 창 배경에 알파를 주면 그 뒤로 데스크톱이 비친다 — 불투명이어야 한다.
    expect(BG_DEEP.dark).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(BG_DEEP.light).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('알파가 있는 색을 쓰지 않는다 — 글리프는 합성되지 않는 자리다', () => {
    for (const { color, symbolColor } of Object.values(OVERLAY_COLORS)) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(symbolColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
