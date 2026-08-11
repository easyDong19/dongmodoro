import {
  test,
  expect,
  launchApp,
  closeApp,
  makeUserDataDir,
  removeUserDataDir
} from './fixtures/app'

/**
 * 테마 4종. 픽스처의 `colorScheme: null` 이 이 파일 전체의 전제다 — 그것이 없으면
 * Playwright 가 `prefers-color-scheme` 을 `'light'` 로 에뮬레이션해서, 아래 단언들이
 * 앱이 아니라 하네스를 검증하게 된다(그리고 전부 통과한다).
 */
const DARK_BG = 'rgb(12, 26, 22)' // --bg-deep
const LIGHT_BG = 'rgb(231, 238, 236)' // --light-bg-deep

const bodyBackground = () => getComputedStyle(document.body).backgroundColor

test('첫 실행은 다크다 — OS 가 라이트여도', async ({ appWindow }) => {
  await appWindow.getByRole('region', { name: '타이머' }).waitFor()

  /**
   * 이것이 `system` 제거의 핵심 단언이다 (design-system ADR-010 §1). 픽스처가 매번 빈
   * 프로필로 띄우므로 여기는 언제나 **시딩 직후의 첫 실행**이고, OS 선호가 무엇이든
   * 결과가 같아야 한다.
   */
  expect(await appWindow.evaluate(bodyBackground)).toBe(DARK_BG)
})

test('세그먼트를 누르면 화면 전체가 뒤집힌다', async ({ appWindow }) => {
  await appWindow.getByRole('region', { name: '타이머' }).waitFor()
  expect(await appWindow.evaluate(bodyBackground)).toBe(DARK_BG)

  await appWindow.screenshot({ path: 'e2e-artifacts/theme-dark.png' })

  // 클래스 이름이 아니라 **실제 계산값**을 본다 — 토큰이 실제로 갈아끼워졌는지가 질문이다.
  await appWindow.getByRole('button', { name: '라이트 테마' }).click()
  await expect.poll(() => appWindow.evaluate(bodyBackground)).toBe(LIGHT_BG)

  // 두 장을 나란히 남긴다. 자동 비교는 하지 않는다(OS 별 폰트 차이) — 사람이 본다.
  //
  // 전이가 끝난 뒤에 찍는다. 클릭 직후에 찍으면 `--motion-medium`(300ms) 전이 중간
  // 상태가 담겨, 버튼들이 흐릿하게 죽은 것처럼 보이는 사진이 남는다 — 사람이 보라고
  // 남기는 아티팩트가 없는 문제를 있는 것처럼 보이게 하면 안 된다.
  await appWindow.waitForTimeout(400)
  await appWindow.screenshot({ path: 'e2e-artifacts/theme-light.png' })

  await appWindow.getByRole('button', { name: '다크 테마' }).click()
  await expect.poll(() => appWindow.evaluate(bodyBackground)).toBe(DARK_BG)
})

test('선택이 재시작 후에도 남는다', async () => {
  // 같은 프로필로 두 번 띄워야 하므로 픽스처를 쓰지 않고 직접 관리한다.
  const userDataDir = makeUserDataDir()
  try {
    const first = await launchApp(userDataDir)
    const firstWindow = await first.firstWindow()
    await firstWindow.getByRole('region', { name: '타이머' }).waitFor()
    await firstWindow.getByRole('button', { name: '라이트 테마' }).click()
    await expect.poll(() => firstWindow.evaluate(bodyBackground)).toBe(LIGHT_BG)
    await closeApp(first)

    const second = await launchApp(userDataDir)
    const secondWindow = await second.firstWindow()
    await secondWindow.getByRole('region', { name: '타이머' }).waitFor()
    // 저장 → 시작 시 읽기 → themeSource 적용까지가 한 줄기로 이어졌는지 본다.
    expect(await secondWindow.evaluate(bodyBackground)).toBe(LIGHT_BG)
    await closeApp(second)
  } finally {
    removeUserDataDir(userDataDir)
  }
})

/**
 * ADR-008 이 **계산으로만** 통과시킨 값을 처음으로 실측한다.
 *
 * 그 ADR 은 라이트 테마의 대비 판정 지점을 **"광원 위, 카드 없음" = 타이틀바**로 지목하고,
 * 그것 때문에 `--ink-dim` 알파를 0.60 → 0.65 로 올렸다(예측 4.97:1). 그런데 지금까지
 * 타이틀바가 없어서 그 지점이 존재한 적이 없다. 이 테스트가 그 공백을 닫는다.
 *
 * 광원을 무시하지 않는다 — `--glow-*` 세 색을 각각 실효 알파로 배경에 합성해 **가장 나쁜
 * 경우**를 고른다. 실효 알파는 "토큰 알파 × --glow-opacity" 이며 그것이 ADR-003 §2 가
 * 정의한 상한의 정의 그대로다.
 */
test('라이트 타이틀바의 날짜 라벨이 대비 기준을 만족한다', async ({ appWindow }) => {
  await appWindow.getByRole('region', { name: '타이머' }).waitFor()
  await appWindow.getByRole('button', { name: '라이트 테마' }).click()
  await expect.poll(() => appWindow.evaluate(bodyBackground)).toBe(LIGHT_BG)

  const measured = await appWindow.evaluate(() => {
    /** 어떤 색 표기든 브라우저에게 정규화시킨다 — 직접 파싱하면 표기법마다 틀린다. */
    const parse = (value: string): [number, number, number, number] => {
      const probe = document.createElement('span')
      probe.style.color = value
      document.body.appendChild(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      const n = resolved.match(/[\d.]+/g)!.map(Number)
      return [n[0], n[1], n[2], n[3] ?? 1]
    }

    const over = (
      fg: [number, number, number, number],
      bg: [number, number, number, number]
    ): [number, number, number, number] => [
      fg[3] * fg[0] + (1 - fg[3]) * bg[0],
      fg[3] * fg[1] + (1 - fg[3]) * bg[1],
      fg[3] * fg[2] + (1 - fg[3]) * bg[2],
      1
    ]

    const luminance = ([r, g, b]: [number, number, number, number]): number => {
      const lin = (c: number) => {
        const s = c / 255
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

    const root = getComputedStyle(document.documentElement)
    const token = (name: string) => root.getPropertyValue(name).trim()

    const base = parse(token('--bg-deep'))
    const glowOpacity = Number(token('--glow-opacity'))

    // 카드가 없는 자리이므로 배경은 --bg-deep + 광원뿐이다. 셋 중 가장 나쁜 것을 고른다.
    const backgrounds = ['--glow-teal', '--glow-amber', '--glow-moss'].map((name) => {
      const glow = parse(token(name))
      return over([glow[0], glow[1], glow[2], glow[3] * glowOpacity], base)
    })
    backgrounds.push(base) // 광원이 닿지 않는 자리

    const inkDim = parse(token('--ink-dim'))
    const results = backgrounds.map((bg) => ratio(luminance(over(inkDim, bg)), luminance(bg)))

    return { worst: Math.min(...results), all: results.map((r) => Number(r.toFixed(2))) }
  })

  console.log('라이트 타이틀바 --ink-dim 대비:', JSON.stringify(measured))

  /**
   * 미달이면 **여기서 멈추고 보고한다.** 알파를 올려 통과시키지 않는다 — 그것은
   * ADR-008 §2 의 팔레트를 바꾸는 결정이고 ADR 이 선행해야 한다.
   */
  expect(measured.worst).toBeGreaterThanOrEqual(4.5)
})
