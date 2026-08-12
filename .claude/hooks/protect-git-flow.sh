#!/usr/bin/env bash
# 브랜치 전략(CONTRIBUTING.md) 을 Claude 의 git 사용에 강제하는 PreToolUse 훅.
#
#   DENY : main 에서 commit/merge/cherry-pick/tag, main 으로 push,
#          main·release 로 force push, 스쿼시 외 gh pr merge,
#          release 브랜치에 feat 커밋, main 에서 --ff-only 없는 pull
#   ASK  : release/* 에서 commit·push (버그픽스만 허용 — 사람이 판단),
#          태그 push (= 배포 트리거)
#
# 브랜치 판정 (2026-08-12 재설계, docs/decision-log/2026-08-12-hook-patch.md):
#   명령 하나가 저장소 하나를 겨냥한다는 가정을 버린다. `cd`·`git -C`·`switch` 로
#   한 명령이 여러 체크아웃을 오갈 수 있으므로, **git 호출마다 "그 호출이 실제로
#   실행될 디렉토리"를 따로 계산**하고 그 후보들을 전부 판정한다. 하나라도 main 이면
#   히스토리 변경을 거부한다.
#
#   1) 명령을 세그먼트(`&&` `||` `;` `|` 개행 괄호)로 쪼개 왼쪽부터 걷는다.
#      `cd`·`pushd` 는 현재 디렉토리 상태를 옮기고, git 호출은 그 시점의 디렉토리를
#      후보로 기록한다. `git -C <dir>` 은 그 호출에 한해 디렉토리를 대체한다.
#   2) `checkout`/`switch` 는 **그 호출이 일어난 디렉토리에만** 브랜치 덮어쓰기로
#      기록한다 (전역 덮어쓰기 금지 — 다른 체크아웃의 판정을 오염시켰다).
#   3) 경로를 정적으로 확정할 수 없으면(`cd -`, 변수·명령치환·글롭, `popd`)
#      **보수적으로** 명령에 등장한 모든 디렉토리를 후보에 넣는다.
#   4) heredoc 본문은 데이터이지 명령이 아니다 — 판정 전에 제거한다.
#      (커밋 메시지에 적힌 `git switch feature/x` 가 판정을 뒤집던 구멍)
#   5) /usr/bin/git 등 절대경로 호출도 git 으로 인식한다.
#
# 이전 이력: 2026-08-04 패치(docs/decision-log/2026-08-04-hook-patch.md)가 판정 기준을
# CLAUDE_PROJECT_DIR 고정에서 payload 의 cwd 로 옮겼다. 그 전제("셸이 이미 대상
# 워크트리 안에 있다")가 `cd <워크트리> && git commit` 패턴에서 깨진 것이 이번 재설계의
# 발단이다.
#
# stdin: Claude Code hook input JSON
# 주의: macOS 기본 bash 3.2 에서 동작해야 한다 — 연관 배열(declare -A) 사용 금지.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

payload="$(cat)"
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // ""' 2>/dev/null)"
[[ "$tool_name" != "Bash" ]] && exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0

# --- heredoc 본문 제거: 데이터를 명령으로 읽지 않는다 -------------------------
# `git commit -F - <<'EOF' … EOF` 의 본문에 적힌 git 명령이 판정에 끼어들지 않게 한다.
cmd_code="$(printf '%s\n' "$cmd" | awk '
  BEGIN { SQ = sprintf("%c", 39); DQ = sprintf("%c", 34); QC = "[" SQ DQ "]" }
  {
    if (skip) {
      s = $0; gsub(/^[ \t]+|[ \t]+$/, "", s)
      if (s == term) skip = 0
      next
    }
    print
    i = index($0, "<<")
    if (i > 0) {
      rest = substr($0, i + 2)
      sub(/^-/, "", rest); sub(/^[ \t]+/, "", rest); gsub(QC, "", rest)
      n = split(rest, a, /[ \t;&|)]/)
      if (n > 0 && a[1] ~ /^[A-Za-z_][A-Za-z0-9_]*$/) { term = a[1]; skip = 1 }
    }
  }')"

# 절대경로(/usr/bin/git)·상대경로 호출 포함
printf '%s' "$cmd_code" | grep -qE '(^|[|&;([:space:]])([^[:space:]|&;()]*/)?(git|gh)([[:space:]]|$)' || exit 0

decide() { # $1=deny|ask $2=reason
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
  exit 0
}

# 부트스트랩 예외: 커밋이 하나도 없으면 최초 커밋은 main 에 허용
git -C "$PROJECT_DIR" rev-parse HEAD >/dev/null 2>&1 || exit 0

# --- 출발 디렉토리: 명령이 실행되는 cwd (워크트리 지원) ----------------------
cwd="$(printf '%s' "$payload" | jq -r '.cwd // ""' 2>/dev/null)"
start_dir="$PROJECT_DIR"
[[ -n "$cwd" && -d "$cwd" ]] && start_dir="$cwd"
git -C "$start_dir" rev-parse --git-dir >/dev/null 2>&1 || start_dir="$PROJECT_DIR"

resolve_dir() { # $1=경로 $2=기준 디렉토리 — 따옴표·틸데·상대경로를 편다
  local p="$1" base="$2"
  p="${p%\"}"; p="${p#\"}"; p="${p%\'}"; p="${p#\'}"
  case "$p" in
    '~')   p="$HOME" ;;
    '~/'*) p="$HOME/${p#\~/}" ;;
  esac
  [[ "$p" != /* ]] && p="$base/$p"
  printf '%s' "$p"
}

# --- 세그먼트를 걸으며 git 호출별 실행 디렉토리를 모은다 ----------------------
# cand_list : 판정 대상 (git 호출이 실제로 도는 디렉토리) — 개행 구분
# all_list  : 명령에 등장한 모든 디렉토리 (파싱 불확실 시 보수적 판정용)
# ovr_list  : 디렉토리별 브랜치 덮어쓰기 (checkout/switch), `디렉토리<TAB>브랜치`
# bash 3.2 에서 빈 배열 + set -u 가 unbound 로 죽으므로 배열 대신 문자열을 쓴다.
cand_list=""; all_list="$start_dir"; ovr_list=""
curdir="$start_dir"; ambiguous=0

segments="$(printf '%s' "$cmd_code" | sed -E 's/\(|\)/\n/g; s/&&|\|\||;|\|/\n/g')"

while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # 앞 공백 제거
  [[ -z "$seg" ]] && continue

  # cd / pushd — 현재 디렉토리 이동
  if [[ "$seg" =~ ^(cd|pushd)([[:space:]]+|$) ]]; then
    if [[ "$seg" =~ ^(cd|pushd)[[:space:]]+([^[:space:]]+) ]]; then
      t="${BASH_REMATCH[2]}"
      case "$t" in
        -|*'$'*|*'`'*|*'*'*|*'?'*) ambiguous=1 ;;
        *) curdir="$(resolve_dir "$t" "$curdir")"; all_list="$all_list
$curdir" ;;
      esac
    else
      ambiguous=1   # 인자 없는 cd = 홈으로
    fi
    continue
  fi
  [[ "$seg" =~ ^popd([[:space:]]|$) ]] && { ambiguous=1; continue; }

  # git 호출인가
  [[ "$seg" =~ (^|[[:space:]])([^[:space:]]*/)?git([[:space:]]|$) ]] || continue

  gdir="$curdir"
  if [[ "$seg" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]]; then
    t="${BASH_REMATCH[1]}"
    case "$t" in
      *'$'*|*'`'*|*'*'*) ambiguous=1 ;;
      *) gdir="$(resolve_dir "$t" "$curdir")" ;;
    esac
  fi
  all_list="$all_list
$gdir"

  # checkout/switch → 그 디렉토리에만 브랜치 덮어쓰기
  if [[ "$seg" =~ (checkout|switch)([[:space:]]+-[^[:space:]]+)*[[:space:]]+([^-][^[:space:]]*) ]]; then
    ovr_list="$ovr_list
$gdir	${BASH_REMATCH[3]}"
  fi

  cand_list="$cand_list
$gdir"
done <<EOF
$segments
EOF

# 파싱이 불확실하면 등장한 모든 디렉토리를 판정한다 (오탐보다 미탐이 위험하다)
[[ $ambiguous -eq 1 ]] && cand_list="$all_list
$cand_list"
# git 호출이 없으면(gh 전용 등) 출발 디렉토리 기준으로 판정한다
[[ -z "${cand_list//[[:space:]]/}" ]] && cand_list="$start_dir"

branch_of() { # $1=디렉토리 — 덮어쓰기가 있으면 그것이, 없으면 실제 브랜치가 답이다
  local d="$1" line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if [[ "${line%%	*}" == "$d" ]]; then printf '%s' "${line#*	}"; return; fi
  done <<EOF
$ovr_list
EOF
  git -C "$d" branch --show-current 2>/dev/null
}

on_main=0; on_release=0; branch=""
while IFS= read -r d; do
  [[ -z "$d" ]] && continue
  b="$(branch_of "$d")"
  [[ -z "$b" ]] && continue
  [[ -n "$branch" ]] || branch="$b"
  [[ "$b" == "main" ]] && { on_main=1; branch="$b"; }
  [[ "$b" == release/* ]] && { on_release=1; branch="$b"; }
done <<EOF
$cand_list
EOF

has() { printf '%s' "$cmd_code" | grep -qE "$1"; }

GIT='([^[:space:]|&;()]*/)?git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+'

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

# ---------------------------------------------------------------- pull (main 보호)
# pull 은 fetch+merge 다. main 에서 --ff-only 없는 pull 은 머지 커밋을 만들 수 있다.
if [[ $on_main -eq 1 ]] && has "${GIT}pull([[:space:]]|$)" && ! has '[[:space:]]--ff-only([[:space:]]|$)'; then
  decide deny "main 에서는 git pull --ff-only 만 허용한다 (머지 커밋 방지)."
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

# ---------------------------------------------------------------- 경로 불확실
# 여기까지 왔다는 것은 확정된 후보 중 막을 것이 없었다는 뜻이다. 그런데 경로를 정적으로
# 못 읽은 구간이 있었다면(변수·명령치환·`cd -`·`popd`) "안전하다"가 아니라 "모른다"이다.
# 오탐으로 막으면 우회를 학습시키고(2026-08-04 원장), 통과시키면 미탐이므로 사람에게 묻는다.
if [[ $ambiguous -eq 1 ]] && has "${GIT}(commit|merge|cherry-pick|revert|rebase|am|push|tag)([[:space:]]|$)"; then
  decide ask "대상 디렉토리를 정적으로 확정할 수 없다 (변수·명령치환·cd -·popd). 어느 브랜치에서 실행되는지 확인 필요."
fi

exit 0
