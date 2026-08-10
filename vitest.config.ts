import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  // electron.vite.config.ts 가 세 번들(main/preload/renderer)에 각각 거는 별칭을
  // 테스트 러너에도 준다. 없으면 tsc 는 통과하는데 vitest 만 모듈을 못 찾는다.
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    // scripts/ 는 앱 코드가 아니라 저장소 도구다 (PR 언어 검사). 앱과 같은 러너로
    // 돌려야 규칙이 바뀔 때 테스트가 함께 깨진다.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // 기본은 node — main 프로세스 테스트가 대다수다. jsdom 은 렌더러 컴포넌트
    // 테스트에서만 파일 상단 `// @vitest-environment jsdom` 도크블록으로 켠다.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts']
  }
})
