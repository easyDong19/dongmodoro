import { test, expect } from './fixtures/app'
import type { Page } from '@playwright/test'

/**
 * 카드 오버플로 회귀 (fix/card-overflow-scroll).
 *
 * 원래 버그 두 갈래: ① 오늘 목록에 항목이 쌓이면 내용이 유리 카드 밖으로 그려졌고
 * ② `결과물` 카드가 내용만큼 무한정 자라 같은 컬럼의 캘린더를 짓눌렀다. 수정은
 * "카드는 안 자라고 안에서 스크롤한다"이므로, 여기서는 **스크롤이 실제로 발동했는지**
 * (`scrollHeight > clientHeight`)와 이웃 카드가 살아남았는지를 잰다 — jsdom 은 레이아웃을
 * 계산하지 않아 이 검증은 e2e 에서만 성립한다.
 */

/** 섹션 안의 스크롤 영역이 실제로 넘쳐 스크롤 중인지 잰다. */
async function scrollEngaged(page: Page, regionName: string): Promise<boolean> {
  return page
    .getByRole('region', { name: regionName })
    .locator('.scroll-area')
    .first()
    .evaluate((el) => el.scrollHeight > el.clientHeight)
}

test('오늘 목록이 넘치면 카드 안에서 스크롤하고 입력 폼은 하단에 남는다', async ({ appWindow }) => {
  const section = appWindow.getByRole('region', { name: '오늘 목록' })
  const input = section.getByPlaceholder('할 일을 바로 추가')
  await expect(input).toBeVisible()

  for (let i = 1; i <= 15; i++) {
    await input.fill(`넘침 검증용 할 일 ${i}`)
    await input.press('Enter')
    // 낙관적 갱신이 아니라 서버 왕복 후 행이 붙는다 — 다음 입력 전에 행을 기다린다.
    await expect(section.getByText(`넘침 검증용 할 일 ${i}`, { exact: true })).toBeVisible()
  }

  // 카드가 자라는 대신 목록이 스크롤해야 한다.
  expect(await scrollEngaged(appWindow, '오늘 목록')).toBe(true)

  // 항목이 몇 개든 추가 진입점은 스크롤 밖 하단 고정이다.
  await expect(input).toBeInViewport()

  // 마지막 행은 스크롤 전에는 잘려서 안 보이고(카드 밖으로 그려지는 대신), 스크롤하면
  // 뷰포트에 들어온다. boundingBox 는 overflow 클리핑을 반영하지 않으므로 좌표 비교
  // 대신 뷰포트 판정으로 잰다.
  const lastRow = section.getByText('넘침 검증용 할 일 15', { exact: true })
  await expect(lastRow).not.toBeInViewport()
  await lastRow.scrollIntoViewIfNeeded()
  await expect(lastRow).toBeInViewport()
})

test('결과물이 쌓여도 카드는 상한에서 멈추고 캘린더가 짓눌리지 않는다', async ({ appWindow }) => {
  const milestone = appWindow.getByRole('region', { name: '월 결과물' })
  const calendar = appWindow.getByRole('region', { name: '캘린더' })
  const calendarBefore = (await calendar.boundingBox())!

  for (let i = 1; i <= 10; i++) {
    await milestone.getByTestId('milestone-add').click()
    const field = milestone.getByLabel('새 결과물')
    await field.fill(`상한 검증용 결과물 ${i}`)
    await field.press('Enter')
    await expect(milestone.getByText(`상한 검증용 결과물 ${i}`, { exact: true })).toBeVisible()
  }

  // 상한(컬럼 40%)에 닿아 내부 스크롤이 발동했어야 한다.
  expect(await scrollEngaged(appWindow, '월 결과물')).toBe(true)

  // 결과물 카드는 컬럼의 40% 를 넘지 못한다. 컬럼 높이는 두 카드 상자로 복원한다.
  const milestoneBox = (await milestone.boundingBox())!
  const calendarAfter = (await calendar.boundingBox())!
  const columnHeight = calendarAfter.y + calendarAfter.height - milestoneBox.y
  expect(milestoneBox.height).toBeLessThanOrEqual(columnHeight * 0.4 + 1)

  // 캘린더는 밀려 내려가되 소멸하면 안 된다 — 수정 전에는 결과물이 자란 만큼 통째로
  // 짓눌렸다. 상한이 40% 이므로 캘린더에는 원래 높이의 절반 이상이 남아야 한다.
  expect(calendarAfter.height).toBeGreaterThan(calendarBefore.height * 0.5)
})
