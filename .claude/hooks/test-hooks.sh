#!/usr/bin/env bash
# protect-origin.sh · protect-git-flow.sh 회귀 테스트.
# 2026-08-04 훅 패치(docs/decision-log/2026-08-04-hook-patch.md)의 결함 6건이
# 다시 생기지 않는지 검증한다. 실패가 있으면 종료 코드 1.
#
# 사용법: bash .claude/hooks/test-hooks.sh
set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HOOKS_DIR/../.." && pwd)"
export CLAUDE_PROJECT_DIR="$REPO_DIR"

pass=0; fail=0

# probe <expected: allow|deny|ask> <hook> <cwd> <label> <command...>
probe() {
  local expect="$1" hook="$2" cwd="$3" label="$4" command="$5"
  local out verdict
  out="$(jq -n --arg c "$command" --arg w "$cwd" \
        '{tool_name:"Bash",cwd:$w,tool_input:{command:$c}}' \
        | bash "$HOOKS_DIR/$hook" 2>&1)"
  if   printf '%s' "$out" | grep -q '"deny"'; then verdict="deny"
  elif printf '%s' "$out" | grep -q '"ask"';  then verdict="ask"
  else verdict="allow"; fi

  if [[ "$verdict" == "$expect" ]]; then
    printf 'PASS  %-6s %s\n' "$verdict" "$label"; pass=$((pass+1))
  else
    printf 'FAIL  %-6s (want %s) %s\n' "$verdict" "$expect" "$label"; fail=$((fail+1))
  fi
}

# 브랜치 시뮬레이션용 임시 저장소 2개 — 실제 체크아웃 상태와 무관하게 검증한다
FEAT_DIR="$(mktemp -d)"
MAIN_DIR="$(mktemp -d)"
trap 'rm -rf "$FEAT_DIR" "$MAIN_DIR"' EXIT
git -C "$FEAT_DIR" init -q && git -C "$FEAT_DIR" switch -q -c feature/docs-sim
git -C "$MAIN_DIR" init -q && git -C "$MAIN_DIR" switch -q -c main

O=protect-origin.sh
G=protect-git-flow.sh
NL=$'\n'

echo "=== protect-origin.sh ==="
# 진짜 막아야 하는 것
probe deny  $O "$REPO_DIR" 'origin 에 리다이렉션 쓰기'            'echo x > docs/origin/pomodoro-prd.md'
probe deny  $O "$REPO_DIR" 'origin 을 sed -i 로 수정'             'sed -i "" s/a/b/ docs/origin/pomodoro-prd.md'
probe deny  $O "$REPO_DIR" 'origin 으로 cp'                       'cp /tmp/x.md docs/origin/'
probe deny  $O "$REPO_DIR" 'rm -rf docs (상위 경로 파괴)'         'rm -rf docs'
probe deny  $O "$REPO_DIR" 'mv docs 이동 (상위 경로 파괴)'        'mv docs /tmp/'
probe deny  $O "$REPO_DIR" '절대경로 /bin/rm 우회'                '/bin/rm -rf docs'
probe deny  $O "$REPO_DIR" 'cd 후 상대경로로 origin 진입'         'cd docs/origin && touch x.md'
# 통과해야 하는 것 (과거 오탐)
probe allow $O "$REPO_DIR" '읽기 전용 grep'                       'grep -n foo docs/origin/pomodoro-prd.md'
probe allow $O "$REPO_DIR" 'heredoc 본문의 docs(scope): 제목'     "cat > /tmp/m.txt <<EOF${NL}docs(week-plan): add planning documents${NL}EOF"
probe allow $O "$REPO_DIR" 'heredoc 본문의 인용된 docs 단어'      "python3 - <<EOF${NL}d = 'docs' + '/features'${NL}EOF"
probe allow $O "$REPO_DIR" 'git add docs (비파괴 + bare 토큰)'    'touch x && git add docs'
probe allow $O "$REPO_DIR" 'features 하위 cp (origin 아님)'       'cp /tmp/prd.md docs/features/week-plan/prd.md'
probe allow $O "$REPO_DIR" '커밋 메시지의 화살표·docs 스코프'     'git add -A && git commit -m "docs(x): a -> b"'

echo
echo "=== protect-git-flow.sh ==="
probe deny  $G "$MAIN_DIR" 'main cwd 에서 commit'                 'git commit -m "x"'
probe deny  $G "$MAIN_DIR" 'main cwd 에서 ff-only 없는 pull'      'git pull -q --prune'
probe allow $G "$MAIN_DIR" 'main cwd 에서 --ff-only pull'         'git pull --ff-only --prune'
# 워크트리/브랜치 판정
probe allow $G "$FEAT_DIR" 'feature 워크트리 cwd 에서 commit'     'git commit -F /tmp/m.txt'
probe allow $G "$FEAT_DIR" 'feature cwd 에서 merge origin/main'   'git merge origin/main --no-edit'
probe allow $G "$MAIN_DIR" '같은 명령에서 feature 로 switch+commit' 'git switch -q feature/docs-x && git commit -F /tmp/m.txt'
probe deny  $G "$FEAT_DIR" '같은 명령에서 main 으로 switch+commit'  'git switch main && git commit -m "x"'
# cd 로 다른 체크아웃에 들어가는 경우 (2026-08-12 패치)
# 하네스가 호출마다 cwd 를 되돌리므로 `cd <워크트리> && git …` 이 정상 경로다.
probe allow $G "$MAIN_DIR" 'main cwd 에서 cd 후 feature 워크트리 commit' "cd $FEAT_DIR && git add -A && git commit -m 'x'"
probe deny  $G "$FEAT_DIR" 'feature cwd 에서 cd 후 main 체크아웃 commit' "cd $MAIN_DIR && git commit -m 'x'"
probe allow $G "$MAIN_DIR" 'cd 후 feature 에서 push'              "cd $FEAT_DIR && git push -u origin feature/docs-sim"
probe deny  $G "$FEAT_DIR" 'cd 후 main 에서 tag 생성'             "cd $MAIN_DIR && git tag v9.9.9"
probe allow $G "$MAIN_DIR" 'cd 대상이 저장소가 아니면 판정 대상 아님' "cd /tmp && git commit -m 'x'"
probe ask   $G "$FEAT_DIR" 'cd 경로가 변수라 불확실 → 사람에게 확인' 'cd $TARGET && git commit -m "x"'
probe allow $G "$FEAT_DIR" '불확실해도 보호 대상 명령이 아니면 통과'  'cd $TARGET && git status'
# 우회 경로
probe deny  $G "$FEAT_DIR" 'git -C <main 체크아웃> commit 우회'   "git -C $MAIN_DIR commit -m 'x'"
probe deny  $G "$FEAT_DIR" '/usr/bin/git -C <main> commit 우회'   "/usr/bin/git -C $MAIN_DIR commit -m 'x'"
probe allow $G "$MAIN_DIR" 'git -C <feature 워크트리> commit 은 정상' "git -C $FEAT_DIR commit -m 'x'"
probe deny  $G "$FEAT_DIR" 'switch 후 cd 로 main 에서 커밋 (전역 덮어쓰기 악용)' "git switch -q feature/docs-sim && cd $MAIN_DIR && git commit -m 'x'"
probe deny  $G "$MAIN_DIR" '커밋 메시지 본문의 git switch 는 명령이 아니다' "git commit -F - <<'MSG'${NL}fix: something${NL}${NL}git switch feature/x was mentioned here${NL}MSG"
# 머지 방식
probe allow $G "$FEAT_DIR" 'gh pr merge --squash'                 'gh pr merge 5 --squash --delete-branch'
probe deny  $G "$FEAT_DIR" 'gh pr merge --merge'                  'gh pr merge 5 --merge'
probe deny  $G "$FEAT_DIR" 'main 직접 push (refspec)'             'git push origin HEAD:main'
probe ask   $G "$FEAT_DIR" '태그 push'                            'git push origin v1.0.0'

echo
echo "결과: PASS $pass / FAIL $fail"
[[ $fail -eq 0 ]]
