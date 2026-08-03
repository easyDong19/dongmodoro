#!/usr/bin/env bash
# 브랜치 전략(CONTRIBUTING.md) 을 Claude 의 git 사용에 강제하는 PreToolUse 훅.
#
#   DENY : main 에서 commit/merge/cherry-pick/tag, main 으로 push,
#          main·release 로 force push, 스쿼시 외 gh pr merge,
#          release 브랜치에 feat 커밋
#   ASK  : release/* 에서 commit·push (버그픽스만 허용 — 사람이 판단),
#          태그 push (= 배포 트리거)
#
# stdin: Claude Code hook input JSON
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

payload="$(cat)"
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // ""' 2>/dev/null)"
[[ "$tool_name" != "Bash" ]] && exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0
printf '%s' "$cmd" | grep -qE '(^|[|&;([:space:]])(git|gh)([[:space:]]|$)' || exit 0

decide() { # $1=deny|ask $2=reason
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# 부트스트랩 예외: 커밋이 하나도 없으면 최초 커밋은 main 에 허용
git -C "$PROJECT_DIR" rev-parse HEAD >/dev/null 2>&1 || exit 0

branch="$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)"

# 커맨드 안에서 main/release 로 checkout|switch 하면 그 브랜치 기준으로 판정
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+(checkout|switch)[[:space:]]+([^-][^[:space:]]*[[:space:]]+)?main([[:space:]]|$|;|&)'; then
  branch="main"
elif printf '%s' "$cmd" | grep -qE 'git[[:space:]]+(checkout|switch)[[:space:]]+([^-][^[:space:]]*[[:space:]]+)?release/'; then
  branch="release/x"
fi

on_main=0; on_release=0
[[ "$branch" == "main" ]] && on_main=1
[[ "$branch" == release/* ]] && on_release=1

has() { printf '%s' "$cmd" | grep -qE "$1"; }

GIT='git([[:space:]]+-[^[:space:]]+)*[[:space:]]+'

# ---------------------------------------------------------------- push
if has "${GIT}push"; then
  # force push 로 main/release 겨냥
  if has '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))' && { has '(^|[[:space:]:])(main|release/[^[:space:]]*)([[:space:]]|$)' || [[ $on_main -eq 1 || $on_release -eq 1 ]]; }; then
    decide deny "main/release 브랜치에 force push 금지."
  fi
  # main 을 직접 push (refspec 또는 현재 브랜치)
  if has "${GIT}push[^|;&]*([[:space:]:])main([[:space:]]|$|;|&)"; then
    decide deny "main 직접 push 금지. feature 브랜치 → PR → 스쿼시 머지로만 반영한다."
  fi
  if [[ $on_main -eq 1 ]] && ! has "${GIT}push[^|;&]*[[:space:]:][^[:space:]]"; then
    decide deny "현재 브랜치가 main 이다. main 직접 push 금지 — feature 브랜치에서 작업할 것."
  fi
  # 태그 push = 배포 트리거 → 사용자 확인
  if has '(--tags|refs/tags|[[:space:]]v[0-9]+\.[0-9]+)'; then
    decide ask "태그 push 는 릴리즈 워크플로우(배포)를 트리거한다. 진행할지 확인 필요."
  fi
  # release 브랜치 push → 사용자 확인 (cherry-pick 백포트만 허용)
  if has "([[:space:]:])release/[^[:space:]]*" || [[ $on_release -eq 1 ]]; then
    decide ask "release 브랜치 push. 버그픽스 백포트인지 확인 필요 (새 기능 금지)."
  fi
fi

# ---------------------------------------------------------------- 히스토리 변경
if has "${GIT}(commit|merge|cherry-pick|revert|rebase|am)([[:space:]]|$)"; then
  if [[ $on_main -eq 1 ]]; then
    decide deny "main 에서 직접 커밋/머지 금지. main 반영은 PR 스쿼시 머지로만 한다. feature/* 또는 fix/* 브랜치를 만들 것."
  fi
  if [[ $on_release -eq 1 ]]; then
    if has "${GIT}commit[^|;&]*(-m|--message)[^|;&]*['\"]?feat"; then
      decide deny "release 브랜치에 feat 커밋 금지. 새 기능은 main 으로만 (upstream first)."
    fi
    decide ask "release 브랜치($branch)에서의 히스토리 변경. 버그픽스 백포트(cherry-pick)인지 확인 필요."
  fi
fi

# ---------------------------------------------------------------- 태그 생성
if has "${GIT}tag[[:space:]]" && ! has "${GIT}tag[[:space:]]+(-l|--list|-d|--delete)"; then
  if [[ $on_release -ne 1 ]]; then
    decide deny "태그는 release/X.Y 브랜치에서만 생성한다 (현재: ${branch:-unknown})."
  fi
fi

# ---------------------------------------------------------------- gh pr merge
if has 'gh[[:space:]]+pr[[:space:]]+merge'; then
  if has '(--merge|--rebase|[[:space:]]-m([[:space:]]|$)|[[:space:]]-r([[:space:]]|$))'; then
    decide deny "스쿼시 머지만 허용한다: gh pr merge --squash"
  fi
  if ! has '(--squash|[[:space:]]-s([[:space:]]|$))'; then
    decide ask "머지 방식이 명시되지 않았다. --squash 를 붙여 스쿼시 머지로 진행할 것."
  fi
fi

exit 0
