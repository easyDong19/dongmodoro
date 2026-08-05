import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    // package.json 이 "type": "module" 이라 기본 산출물은 index.mjs 가 된다.
    // 하지만 sandbox: true 인 preload 는 ESM 을 로드하지 못한다 (ADR-007 은 sandbox 를 요구).
    // → CJS + .cjs 확장자로 고정하고, window.ts 가 그 경로를 가리킨다.
    build: {
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
