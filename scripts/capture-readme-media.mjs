/**
 * README 용 스크린샷·GIF 프레임을 찍는다.
 *
 * 실행: `pnpm build` 후 `node scripts/capture-readme-media.mjs`
 * 산출: docs/assets/readme/ 에 PNG 2장. GIF 소스 프레임은 임시 폴더에 쌓이고,
 *       프레임 → GIF 변환은 ffmpeg 이 한다 — 이 스크립트 끝에 명령이 출력된다.
 *
 * **빌드가 최신인지부터 확인한다.** out/ 은 자동으로 갱신되지 않는다 — 낡은 번들로
 * 찍으면 옛 화면이 README 에 실린다. 의심되면 `pnpm build` 를 먼저 돌린다.
 *
 * **실데이터를 건드리지 않는다.** e2e 픽스처와 같은 방식으로 임시 `--user-data-dir` 를
 * 만들어 순정 첫 실행 상태에서 시연용 데이터를 UI 로 심는다 — 스크린샷에 실리는 것은
 * 여기서 만든 가짜 할 일뿐이다.
 *
 * UI 가 바뀌어 이미지가 낡으면 이 스크립트를 다시 돌려 뽑는다. 셀렉터가 깨지는 것이
 * 곧 "이미지도 낡았다"는 신호다.
 */
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'assets', 'readme')
/** GIF 소스 프레임은 저장소 밖에 쓴다 — 커밋 대상은 최종 PNG·GIF 뿐이다. */
const FRAMES_ROOT = mkdtempSync(join(tmpdir(), 'dongmodoro-readme-frames-'))
const MAIN_ENTRY = join(REPO_ROOT, 'out', 'main', 'index.js')

/** 프레임 녹화기 — GIF 소스. 액션과 병행으로 일정 간격 스크린샷을 쌓는다. */
function startRecorder(page, dir, intervalMs = 120) {
  mkdirSync(dir, { recursive: true })
  let n = 0
  let running = true
  const loop = (async () => {
    while (running) {
      const path = join(dir, `f${String(n++).padStart(4, '0')}.png`)
      // 페이지가 닫히는 순간의 실패는 무시한다 — 마지막 프레임 경합일 뿐이다.
      await page.screenshot({ path }).catch(() => {})
      await sleep(intervalMs)
    }
  })()
  return async () => {
    running = false
    await loop
  }
}

async function setWindowSize(app, width, height) {
  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(width, height)
    },
    { width, height }
  )
}

const userDataDir = mkdtempSync(join(tmpdir(), 'dongmodoro-readme-'))
mkdirSync(OUT_DIR, { recursive: true })

const app = await electron.launch({
  args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
  colorScheme: null
})

try {
  const page = await app.firstWindow()
  await setWindowSize(app, 1280, 800)
  await page.getByRole('region', { name: '타이머' }).waitFor()

  // ── 시연 데이터 심기 ────────────────────────────────────────────
  // Milestone 2개
  for (const title of ['포트폴리오 케이스 스터디 3편 공개', '이력서 v2 완성']) {
    await page.getByRole('button', { name: 'Milestone 추가' }).click()
    const input = page.getByLabel('새 Milestone')
    await input.fill(title)
    await input.press('Enter')
    await sleep(200)
  }

  // Sprint 3개 — 플래너를 열고 제목 + 요일을 넣는다
  await page.getByRole('button', { name: '+ 이번 주 Sprint 잡기' }).click()
  const plans = [
    ['케이스 스터디 초안 쓰기', '월'],
    ['이력서 STAR 사례 정리', '화'],
    ['면접 질문 리스트 만들기', '수']
  ]
  for (const [title, day] of plans) {
    await page.getByLabel('Sprint 제목').fill(title)
    await page.getByRole('button', { name: day, exact: true }).click()
    await page.getByRole('button', { name: '항목 추가' }).click()
    await sleep(150)
  }
  await page.getByRole('button', { name: '이번 주 시작' }).click()
  await sleep(400)

  // ── GIF ① 코어 루프: 드로어에서 task 만들기 → 오늘로 → 타이머 시작 ──
  const stopLoop = startRecorder(page, join(FRAMES_ROOT, 'core-loop'))
  await sleep(400)
  await page.getByRole('button', { name: '드로어 열기' }).first().click()
  await sleep(600)
  const sprintCard = page.getByRole('region', { name: 'Sprint' })
  const drawerInput = sprintCard.locator('input[maxlength="40"]')
  for (const task of ['개요 잡기', '스크린샷 고르기']) {
    await drawerInput.fill(task)
    await drawerInput.press('Enter')
    await sleep(500)
  }
  await page.getByRole('button', { name: /오늘로 가져오기/ }).click()
  await sleep(800)
  await page.getByRole('region', { name: '오늘 목록' }).getByLabel('타이머 시작').first().click()
  await sleep(2500) // 타이머가 도는 것이 보이게
  await stopLoop()

  // 타이머를 세워 둔다 — 이후 스크린샷이 매번 다른 숫자가 되지 않게
  await page.getByRole('button', { name: '일시정지' }).click()
  await page.getByRole('button', { name: '초기화' }).click()
  await sleep(300)

  // ── 히어로 (다크, 와이드) ──────────────────────────────────────
  await page.screenshot({ path: join(OUT_DIR, 'hero-dark.png') })

  // ── 라이트 테마 ────────────────────────────────────────────────
  await page.getByRole('button', { name: '라이트 테마' }).click()
  await sleep(600)
  await page.screenshot({ path: join(OUT_DIR, 'theme-light.png') })
  await page.getByRole('button', { name: '다크 테마' }).click()
  await sleep(600)

  // ── GIF ② 미디엄 구간: 좁히면 접히고, MONTH 로 여닫는다 ─────────
  const stopMedium = startRecorder(page, join(FRAMES_ROOT, 'medium'))
  await sleep(600)
  for (let w = 1280; w >= 900; w -= 38) {
    await setWindowSize(app, w, 800)
    await sleep(90)
  }
  await sleep(1200) // 연속성 규칙: 오버레이가 열린 채 진입한 상태를 보여준다
  await page.keyboard.press('Escape') // 닫으면 타이머가 온전히 남는다
  await sleep(1200)
  await page.getByRole('button', { name: 'MONTH', exact: true }).click() // 다시 연다
  await sleep(1500)
  await stopMedium()

  console.log('\n캡처 완료. GIF 변환:')
  // 코어 루프: 프레임 크기가 일정하다 — 축소만 한다.
  console.log(
    `ffmpeg -y -framerate 8 -i '${join(FRAMES_ROOT, 'core-loop', 'f%04d.png')}' -vf "fps=8,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" '${join(OUT_DIR, 'core-loop.gif')}'`
  )
  // 미디엄: 창이 줄어들며 프레임 크기가 변한다 — 고정 캔버스(640x400, 배경 --bg-deep)에
  // 패딩해야 GIF 가 성립한다. scale=800 류로 각 프레임을 따로 맞추면 높이가 프레임마다
  // 달라져 깨진다.
  console.log(
    `ffmpeg -y -framerate 6 -i '${join(FRAMES_ROOT, 'medium', 'f%04d.png')}' -vf "scale=iw/2:ih/2,pad=640:400:(640-iw)/2:0:color=0x0c1a16,fps=6,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" '${join(OUT_DIR, 'medium-range.gif')}'`
  )
} finally {
  await app.close().catch(() => {})
  rmSync(userDataDir, { recursive: true, force: true })
}
