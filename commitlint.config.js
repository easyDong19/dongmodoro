/**
 * Conventional Commits + 이 저장소 고유 규칙 (CONTRIBUTING.md 커밋 규칙).
 *
 * 커밋 메시지가 "영어인지"는 기계가 판별하기 어려우므로, 실제로 문제를 일으키는 것만
 * 막는다 — 한글이 섞이면 환경에 따라 인코딩이 깨져 히스토리를 읽을 수 없게 된다.
 */
const HANGUL = /[ㄱ-ㆎ가-힣]/

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-hangul': ({ raw }) => [
          !HANGUL.test(raw ?? ''),
          '커밋 메시지는 영어로만 작성한다 (한글은 인코딩이 깨져 히스토리를 읽을 수 없게 된다) — CONTRIBUTING.md'
        ]
      }
    }
  ],
  rules: {
    'no-hangul': [2, 'always']
  }
}
