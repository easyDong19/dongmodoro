/**
 * PR 제목·본문의 한글을 검사한다 (CONTRIBUTING.md 커밋 규칙).
 *
 * 왜 CI 가 필요한가: `commit-msg` 훅의 commitlint 는 **로컬 커밋만** 본다. 스쿼시
 * 머지 커밋의 본문은 GitHub 이 PR 본문으로 서버에서 조립하므로 훅이 닿지 못한다.
 * PR #2~#15 가 이 경로로 한국어 본문을 main 히스토리에 남겼다.
 *
 * 제목과 본문의 기준이 다르다:
 *   · 제목 — 한글 0. Conventional Commits 한 줄에 인용이 낄 자리가 없다.
 *   · 본문 — 백틱 **밖**의 한글 0. 도메인 용어와 UI 문구는 인용해야 무슨 변경인지
 *     쓸 수 있으므로(CONTEXT.md 가 캐노니컬 용어를 한국어로 정했다), 코드 스팬으로
 *     감싼 한글은 허용한다. 감싸지 않은 한글은 산문으로 본다.
 */
import { fileURLToPath } from 'node:url'

const HANGUL = /[ㄱ-ㆎ가-힣]/u

function newlinesIn(text) {
  return (text.match(/\n/g) ?? []).length
}

/**
 * 코드 스팬·펜스 블록을 지운다. 줄 번호를 보존하려고 줄바꿈은 남긴다.
 *
 * 인라인 스팬이 **줄바꿈 하나까지** 걸치는 것을 허용한다. GitHub 은 스쿼시 커밋
 * 본문을 조립할 때 PR 본문을 72자에서 강제 개행하는데, 그러면 백틱 쌍이 두 줄로
 * 쪼개진다 — 개행을 막으면 인용이 인용으로 안 읽혀 오탐이 난다 (실제로 이 규칙을
 * 들여온 커밋 자신이 걸렸다). 마크다운도 줄바꿈 걸친 인라인 코드를 허용한다.
 *
 * 두 줄 이상은 허용하지 않는다 — 짝이 안 맞는 백틱 하나가 문서를 통째로 삼켜
 * 검사를 무력화하는 것을 막는 상한이다.
 */
function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (m) => '\n'.repeat(newlinesIn(m)))
    .replace(/`[^`]*`/g, (m) => (newlinesIn(m) <= 1 ? '\n'.repeat(newlinesIn(m)) : m))
}

/**
 * 위반한 줄들을 `{ line, text }` 로 돌려준다. 빈 배열이면 통과다.
 *
 * 판정은 코드를 지운 줄로 하되 **보고는 원문 줄로** 한다 — 지운 줄을 보여주면
 * 백틱 안 내용이 사라져서 자기가 쓴 문장을 못 알아본다.
 */
export function findViolations(body) {
  const original = (body ?? '').split('\n')
  return stripCode(body ?? '')
    .split('\n')
    .map((stripped, i) => ({ line: i + 1, stripped, text: (original[i] ?? '').trim() }))
    .filter(({ stripped }) => HANGUL.test(stripped))
    .map(({ line, text }) => ({ line, text }))
}

/** 제목은 인용 예외가 없다 — 한글이 하나라도 있으면 위반이다. */
export function titleHasHangul(title) {
  return HANGUL.test(title ?? '')
}

function main() {
  const title = process.env.PR_TITLE ?? ''
  const body = process.env.PR_BODY ?? ''
  const problems = []

  if (titleHasHangul(title)) {
    problems.push(`제목에 한글이 있다: ${title}`)
  }
  for (const { line, text } of findViolations(body)) {
    problems.push(`본문 ${line}번째 줄 — 백틱 밖 한글: ${text}`)
  }

  if (problems.length === 0) {
    console.log('PASS — PR 제목·본문이 규칙을 지킨다.')
    return
  }

  console.error('FAIL — PR 제목·본문은 영어로 쓴다 (CONTRIBUTING.md).\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error(
    '\n한국어 도메인 용어·UI 문구는 백틱으로 감싸면 통과한다.' +
      '\n예: `+ 오늘로` now does what it says'
  )
  process.exit(1)
}

// 직접 실행일 때만 CLI 로 동작한다 (테스트는 함수만 import 한다).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
