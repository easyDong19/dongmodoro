import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    // preload 도 @shared 의 IPC 계약을 import 한다 (ADR-007: 계약 정의는 shared 한 곳).
    // 별칭이 없으면 타입 검사는 통과하는데 빌드에서 모듈을 못 찾는다.
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // package.json 이 "type": "module" 이라 기본 산출물은 index.mjs 가 된다.
    // 하지만 sandbox: true 인 preload 는 ESM 을 로드하지 못한다 (ADR-007 은 sandbox 를 요구).
    // → CJS + .cjs 확장자로 고정하고, window.ts 가 그 경로를 가리킨다.
    build: {
      rollupOptions: {
        // 'electron' 은 런타임이 주입한다 — 번들에 넣으면 npm 패키지의 Node 쪽
        // 바이너리 다운로더가 딸려 들어와 preload 가 child_process 를 찾다 죽는다.
        // rollupOptions 를 직접 지정하면서 electron-vite 의 기본 external 이 사라졌다.
        external: ['electron'],
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
