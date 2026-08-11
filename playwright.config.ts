import { defineConfig } from '@playwright/test'

/**
 * E2E 러너 설정. 단위 테스트(vitest)와 **파일이 겹치지 않는다** — vitest.config.ts 의
 * `include` 가 `src/**`·`scripts/**` 화이트리스트라 `e2e/` 는 애초에 그쪽 시야 밖이다.
 * 그래서 여기에 exclude 를 두지 않는다.
 *
 * 브라우저를 내려받지 않는다. Electron 테스트는 `node_modules/electron` 의 바이너리를
 * 그대로 쓰므로 `playwright install` 이 필요 없고, 그것을 안 하는 것이 CI 시간의 대부분을
 * 아낀다 (계획서 Task 1 Step 1).
 */
export default defineConfig({
  testDir: './e2e',

  /**
   * 직렬 실행이다. Electron 앱 인스턴스가 여럿 뜨면 임시 userData 로 DB 는 격리되어도
   * **창 포커스 같은 단일 자원**에서 서로 간섭한다. 지금 스펙이 하나뿐이라 병렬로 얻을
   * 것도 없다.
   */
  fullyParallel: false,
  workers: 1,

  /**
   * 재시도 1회는 은폐가 아니라 **앱 기동 지연**에 대한 대응이다. 느린 러너에서 Electron
   * 기동이 간헐적으로 늦는다. 2회 이상은 진짜 문제를 숨기므로 두지 않는다.
   */
  retries: process.env.CI ? 1 : 0,

  /** `test.only` 가 CI 를 조용히 통과시키지 못하게 한다 — 나머지 스펙이 전부 건너뛰어진다. */
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [['html', { open: 'never' }]] : [['list']],

  use: {
    /** 실패한 실행만 추적을 남긴다. 성공까지 남기면 아티팩트가 무의미하게 커진다. */
    trace: 'on-first-retry'
  }
})
