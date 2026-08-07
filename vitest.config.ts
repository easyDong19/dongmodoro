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
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts']
  }
})
