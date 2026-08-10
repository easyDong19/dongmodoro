// @ts-check
import { builtinModules } from 'node:module'
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
const SHARED_PURITY_MESSAGE =
  'ADR-008: src/shared/ 는 순수 TS 여야 한다. Node·Electron API 가 필요하면 main 에 둔다.'
// 손 열거는 누락을 낳는다 (node:buffer 가 새던 전례). 실행 중인 Node 가 아는
// 내장 모듈 전체 + node:* 접두사 글롭으로 잡는다.
const SHARED_FORBIDDEN_PATHS = ['electron', ...builtinModules].map((name) => ({
  name,
  message: SHARED_PURITY_MESSAGE
}))
const NODE_PREFIX_PATTERN = { group: ['node:*'], message: SHARED_PURITY_MESSAGE }

/**
 * ADR-008: 프로세스 경계 — renderer↔main↔preload 는 서로 import 하지 않는다.
 * 공유는 src/shared/ 를 통해서만 한다. 다른 프로세스 폴더로 가는 import 는
 * 반드시 ../ 를 타므로 상대경로 정규식으로 잡는다 (@shared 별칭은 걸리지 않는다).
 */
const zonePattern = (dirs, message) => ({
  regex: `^(\\.\\./)+(${dirs.join('|')})(/|$)`,
  message
})
const RENDERER_ZONE = zonePattern(
  ['main', 'preload'],
  'ADR-008: renderer 는 main·preload 를 import 할 수 없다. 통신은 IPC(window.api)로만 한다.'
)
const SHARED_ZONE = zonePattern(
  ['main', 'renderer', 'preload'],
  'ADR-008: src/shared/ 는 프로세스 폴더를 import 할 수 없다 — 양쪽이 공유하는 순수 TS 다.'
)
const MAIN_ZONE = zonePattern(
  ['renderer', 'preload'],
  'ADR-008: main 은 renderer·preload 를 import 할 수 없다. 공유 코드는 src/shared/ 에 둔다.'
)
const PRELOAD_ZONE = zonePattern(
  ['main', 'renderer'],
  'ADR-007: preload 는 main·renderer 를 import 할 수 없다 — shared 의 계약만 전달한다.'
)

/** ADR-007: renderer 는 electron 을 직접 만질 수 없다 — preload 가 노출한 window.api 만 쓴다. */
const RENDERER_FORBIDDEN_PATHS = [
  {
    name: 'electron',
    message: 'ADR-007: renderer 는 electron 을 import 할 수 없다. window.api 를 쓴다.'
  }
]

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

/**
 * ADR-025 §5: 캐시 조작(invalidate/refetch/reset/remove/setQueryData/setQueriesData/
 * clear/cancelQueries)은 shared/query/invalidate.ts·events.ts 초크포인트에서만 한다.
 * 세 갈래를 잡는다 — 메서드 접근(qc.invalidateQueries()), 구조분해(const { setQueryData } = qc),
 * 계산 접근(qc['refetchQueries']()).
 */
const BANNED_QUERY_METHODS = [
  'invalidateQueries',
  'refetchQueries',
  'resetQueries',
  'removeQueries',
  'setQueryData',
  'setQueriesData',
  'clear',
  'cancelQueries'
]
const QUERY_MSG =
  'ADR-025 §5: 캐시 조작은 shared/query/invalidate.ts·events.ts 초크포인트에서만 한다.'
const QUERY_SELECTORS = [
  {
    selector: `CallExpression[callee.property.name=/^(${BANNED_QUERY_METHODS.join('|')})$/]`,
    message: QUERY_MSG
  },
  {
    selector: `CallExpression[callee.name=/^(${BANNED_QUERY_METHODS.join('|')})$/]`,
    message: QUERY_MSG
  },
  {
    selector: `MemberExpression[computed=true][property.value=/^(${BANNED_QUERY_METHODS.join('|')})$/]`,
    message: QUERY_MSG
  }
]

const QUERY_CHOKEPOINT_FILES = [
  'src/renderer/shared/query/invalidate.ts',
  'src/renderer/shared/query/events.ts'
]

export default tseslint.config(
  // docs/ 는 앱 소스가 아니다. 결정 원장에는 근거로 남긴 실행 가능한 검증 스크립트가
  // 들어 있고(예: decision-log 의 제약 프로브), 그것들은 앱의 아키텍처 규칙이 아니라
  // "그때 이렇게 확인했다"는 기록이다. 앱 규칙으로 검사하면 기록을 고치게 된다.
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'drizzle/**', 'docs/**'] },

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

  // scripts/ 는 앱 코드가 아니라 저장소 도구다 (PR 언어 검사). CI 의 node 에서
  // 직접 돌기 때문에 process·console 이 전역으로 있다 — 아래 프로세스별 import
  // 제약(src/** 스코프)은 여기에 걸리지 않는다.
  // 쓰는 전역만 적는다 — `globals` 패키지는 eslint 의 전이 의존이라 직접 import 하면
  // 상위가 바꾸는 순간 깨진다.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } }
  },

  // ── import 제약 ─────────────────────────────────────────────────────────
  // 프로세스 폴더마다 전체 옵션을 한 번에 준다 (flat config 덮어쓰기 함정 — 상단 주석).
  // (A) src/shared/ — 순수성(ADR-008) + DB 격리(ADR-015) + 프로세스 경계
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: SHARED_FORBIDDEN_PATHS,
          patterns: [NODE_PREFIX_PATTERN, DB_IMPORT_PATTERN, SHARED_ZONE]
        }
      ]
    }
  },
  // (B) src/renderer/ — DB 격리 + 프로세스 경계 + electron 직접 import 금지
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: RENDERER_FORBIDDEN_PATHS, patterns: [DB_IMPORT_PATTERN, RENDERER_ZONE] }
      ]
    }
  },
  // (C) src/preload/ — DB 격리 + 프로세스 경계 (electron 은 preload 의 정당한 의존)
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DB_IMPORT_PATTERN, PRELOAD_ZONE] }]
    }
  },
  // (D) src/main/ — DB 격리 + 프로세스 경계. src/main/db/ 는 DB 라이브러리를 쓰는 유일한 곳이므로 제외
  {
    files: ['src/main/**/*.ts'],
    ignores: ['src/main/db/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DB_IMPORT_PATTERN, MAIN_ZONE] }]
    }
  },
  // (E) src/main/db/ — DB 라이브러리는 허용, 프로세스 경계만 적용
  {
    files: ['src/main/db/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [MAIN_ZONE] }]
    }
  },

  // ── 구문 제약 ───────────────────────────────────────────────────────────
  // (C) renderer 밖 — 시간 초크포인트(ADR-009). 시간 모듈 자신과 테스트는 제외
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/shared/time/**', 'src/renderer/**', ...TESTS],
    rules: { 'no-restricted-syntax': ['error', ...TIME_SELECTORS] }
  },
  // (D-1) renderer 일반 — 시간 + 이모지 + 캐시 조작 금지. 초크포인트 두 파일은 캐시 조작이
  // 존재 이유이므로 제외한다 (D-2 에서 시간+이모지만 다시 적용).
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    ignores: [...QUERY_CHOKEPOINT_FILES, ...TESTS],
    rules: {
      'no-restricted-syntax': ['error', ...TIME_SELECTORS, ...EMOJI_SELECTORS, ...QUERY_SELECTORS]
    }
  },
  // (D-2) 초크포인트·이벤트 리스너 — 시간 + 이모지만 (캐시 조작이 이 파일들의 존재 이유다)
  {
    files: QUERY_CHOKEPOINT_FILES,
    rules: { 'no-restricted-syntax': ['error', ...TIME_SELECTORS, ...EMOJI_SELECTORS] }
  },

  // 서식은 Prettier 가 단독으로 정한다 — 충돌하는 ESLint 규칙을 끈다 (ADR-017).
  // 반드시 마지막에 온다. 앞 블록의 서식 관련 규칙까지 덮어야 하기 때문이다.
  prettier
)
