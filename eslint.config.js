// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * 이 설정의 주목적은 코드 스타일이 아니라 **ADR 이 정한 아키텍처 규칙의 강제**다 (ADR-016).
 * 각 규칙에는 근거 ADR 을 달았고, 근거 없는 제약은 추가하지 않는다.
 *
 * 주의 — flat config 에서 같은 규칙 이름을 여러 블록에 쓰면 **뒤 블록이 앞 블록을 통째로
 * 덮어쓴다** (옵션이 병합되지 않는다). 그래서 no-restricted-imports / no-restricted-syntax
 * 는 파일 그룹마다 "그 그룹에 필요한 전체 옵션"을 한 번에 준다. 그룹은 서로 겹치지 않는다.
 */

/** ADR-008: src/shared/ 는 순수 TS — Node·Electron 런타임에 의존하지 않는다. */
const NODE_BUILTINS = [
  'fs',
  'fs/promises',
  'path',
  'os',
  'child_process',
  'crypto',
  'http',
  'https',
  'net',
  'stream',
  'url',
  'util',
  'worker_threads',
  'zlib',
  'events'
]
const SHARED_FORBIDDEN_PATHS = [
  'electron',
  ...NODE_BUILTINS,
  ...NODE_BUILTINS.map((m) => `node:${m}`)
].map((name) => ({
  name,
  message: 'ADR-008: src/shared/ 는 순수 TS 여야 한다. Node·Electron API 가 필요하면 main 에 둔다.'
}))

/** ADR-015 §2: DB 라이브러리는 src/main/db/ 하위에서만 import 한다. */
const DB_IMPORT_PATTERN = {
  group: ['better-sqlite3', 'drizzle-orm', 'drizzle-orm/*', 'drizzle-kit'],
  message:
    'ADR-015 §2: DB 라이브러리 import 는 src/main/db/ 하위만 허용된다. 서비스는 리포지토리 포트에만 의존한다.'
}

/** ADR-009 §3: 현재 시각은 src/shared/time/ 만 읽는다. */
const TIME_SELECTORS = [
  {
    selector: 'NewExpression[callee.name="Date"]',
    message:
      'ADR-009 §3: new Date() 는 src/shared/time/ 안에서만 호출한다. now()/dayKey()/weekKey()/monthKey() 를 쓴다.'
  },
  {
    selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
    message:
      'ADR-009 §3: Date.now() 는 src/shared/time/ 안에서만 호출한다. epoch ms 는 저장하지 않는다 (ADR-009 §1).'
  }
]

/** 프로젝트 CLAUDE.md: 렌더되는 UI 에 이모지 금지 — 아이콘은 컴포넌트로. */
const EMOJI_MESSAGE =
  '렌더되는 UI 에 이모지를 쓰지 않는다. lucide-react 아이콘 컴포넌트나 토큰 기반 커스텀 SVG 를 쓴다 (design-system/principles.md §6).'
const EMOJI_SOURCE = /\p{Extended_Pictographic}/u.source
const EMOJI_SELECTORS = [
  { selector: `Literal[value=/${EMOJI_SOURCE}/u]`, message: EMOJI_MESSAGE },
  { selector: `JSXText[value=/${EMOJI_SOURCE}/u]`, message: EMOJI_MESSAGE },
  { selector: `TemplateElement[value.raw=/${EMOJI_SOURCE}/u]`, message: EMOJI_MESSAGE }
]

const TESTS = ['**/*.test.ts', '**/*.test.tsx']

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'drizzle/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // 미사용 변수는 _ 로 시작하면 의도적 무시로 인정한다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  // ── import 제약 ─────────────────────────────────────────────────────────
  // (A) src/shared/ — 순수성(ADR-008) + DB 격리(ADR-015) 둘 다 적용
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: SHARED_FORBIDDEN_PATHS, patterns: [DB_IMPORT_PATTERN] }
      ]
    }
  },
  // (B) src/ 나머지 — DB 격리만. src/main/db/ 는 DB 라이브러리를 쓰는 유일한 곳이므로 제외
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/shared/**', 'src/main/db/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DB_IMPORT_PATTERN] }]
    }
  },

  // ── 구문 제약 ───────────────────────────────────────────────────────────
  // (C) renderer 밖 — 시간 초크포인트(ADR-009). 시간 모듈 자신과 테스트는 제외
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/shared/time/**', 'src/renderer/**', ...TESTS],
    rules: { 'no-restricted-syntax': ['error', ...TIME_SELECTORS] }
  },
  // (D) renderer — 시간 초크포인트 + 이모지 금지를 한 블록에서 함께 준다
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    ignores: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...TIME_SELECTORS, ...EMOJI_SELECTORS] }
  },

  // 서식은 Prettier 가 단독으로 정한다 — 충돌하는 ESLint 규칙을 끈다 (ADR-017).
  // 반드시 마지막에 온다. 앞 블록의 서식 관련 규칙까지 덮어야 하기 때문이다.
  prettier
)
