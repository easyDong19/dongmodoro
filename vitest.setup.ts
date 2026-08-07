import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// vitest 는 jest 와 달리 각 테스트 후 DOM 을 자동으로 치우지 않는다 — 안 하면
// 이전 테스트가 마운트한 컴포넌트가 다음 테스트의 window.api 목과 뒤섞여
// 레이스가 난다 (setup() 이 매 테스트 window.api 를 새로 바꿔치기하므로).
afterEach(() => cleanup())
