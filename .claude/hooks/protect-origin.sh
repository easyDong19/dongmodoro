#!/usr/bin/env bash
# docs/origin/ 은 원천 데이터(read-only)다.
# PreToolUse 훅으로 해당 경로를 "변경"하는 도구 호출만 차단한다.
#
# 판정 방식:
#   - Write/Edit/NotebookEdit : 대상 경로를 정규화해 docs/origin 하위인지 검사
#   - Bash                    : 변경 계열 명령일 때만 검사. 읽기 전용(ls/cat/grep 등)은 통과.
#                               `cd` 대상까지 후보 CWD 로 잡아 상대경로 우회를 막는다.
# stdin: Claude Code hook input JSON
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

payload="$(cat)"
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // ""' 2>/dev/null)"

deny() {
  cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "docs/origin/ 은 원천 데이터입니다. 읽기만 허용되며 생성·수정·삭제·이동할 수 없습니다. 내용 확인은 Read/Grep/Glob 도구를 사용하세요."
  }
}
JSON
  exit 0
}

# 경로를 실제 파일 존재 여부와 무관하게 정규화한다 (realpath -m 은 BSD 에 없음).
normalize() {
  local p="$1" base="$2"
  [[ "$p" != /* ]] && p="$base/$p"
  local -a out=() segs=()
  IFS='/' read -r -a segs <<< "$p"
  local seg
  for seg in ${segs[@]+"${segs[@]}"}; do
    case "$seg" in
      ''|'.') ;;
      '..') ((${#out[@]})) && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$seg") ;;
    esac
  done
  ((${#out[@]})) || { printf '/'; return; }
  printf '/%s' "${out[@]}"
}

ORIGIN="$(normalize "docs/origin" "$PROJECT_DIR")"

# 정규화된 절대경로가 docs/origin 하위이거나, docs/origin 을 포함하는 상위 경로면 true.
hits_origin() {
  local abs="$1"
  [[ "$abs" == "$ORIGIN" || "$abs" == "$ORIGIN"/* ]] && return 0
  [[ "$ORIGIN" == "$abs"/* ]] && return 0   # 예: rm -rf docs
  return 1
}

# ---------------------------------------------------------------- 파일 도구
if [[ "$tool_name" != "Bash" ]]; then
  paths="$(printf '%s' "$payload" | jq -r '
    [ .tool_input.file_path?, .tool_input.path?, .tool_input.notebook_path? ]
    | map(select(type == "string")) | .[]
  ' 2>/dev/null)"

  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    hits_origin "$(normalize "$p" "$PROJECT_DIR")" && deny
  done <<< "$paths"

  # MultiEdit 등 경로가 중첩된 입력을 위한 안전망.
  # content 는 검사하지 않는다 — 문서 본문이 경로를 인용하는 건 정상이다.
  nested="$(printf '%s' "$payload" | jq -r '
    [ .tool_input.edits?, .tool_input.files?, .tool_input.file_paths? ]
    | map(select(. != null)) | tostring
  ' 2>/dev/null)"
  printf '%s' "$nested" | grep -qE 'docs/+origin(/|$|[^A-Za-z0-9_-])' && deny

  exit 0
fi

# ---------------------------------------------------------------- Bash
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0

# 1) 변경 계열인지 판정. 아니면 읽기 전용으로 보고 통과시킨다.
mutating=0

# 출력 리다이렉션 (> / >>). 2>/dev/null 같은 fd 리다이렉션은 제외.
printf '%s' "$cmd" | grep -qE '(^|[^0-9&<>])>>?[[:space:]]*[^&|[:space:]]' && mutating=1

# 파일을 만들거나 바꾸는 명령어들
write_cmds='rm|rmdir|mv|cp|ln|touch|mkdir|install|truncate|dd|tee|shred|patch|unlink|rename|sponge|chmod|chown|chgrp|chflags|xattr|sed|perl|python|python3|node|ruby|osascript|rsync|zip|unzip|tar'
printf '%s' "$cmd" | grep -qE "(^|[|&;(]|[[:space:]])(${write_cmds})([[:space:]]|$)" && mutating=1

# git 은 쓰기 서브커맨드일 때만
printf '%s' "$cmd" | grep -qE '(^|[|&;(]|[[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(checkout|restore|clean|apply|mv|rm|stash|reset|revert|merge|rebase|am|switch)([[:space:]]|$)' && mutating=1

[[ "$mutating" -eq 0 ]] && exit 0

# 2) 안전망: 변경 명령이면서 경로 문자열이 그대로 보이면 즉시 차단.
printf '%s' "$cmd" | grep -qE 'docs/+origin(/|$|[^A-Za-z0-9_-])' && deny

# 3) 후보 CWD 수집: 프로젝트 루트 + 커맨드 안의 `cd <dir>` 대상
declare -a cwds=("$PROJECT_DIR")
while IFS= read -r d; do
  [[ -z "$d" ]] && continue
  d="${d%\"}"; d="${d#\"}"; d="${d%\'}"; d="${d#\'}"
  cwds+=("$(normalize "$d" "$PROJECT_DIR")")
done < <(printf '%s' "$cmd" | grep -oE '(^|[|&;(]|[[:space:]])cd[[:space:]]+[^;|&[:space:]]+' | sed -E 's/.*cd[[:space:]]+//')

# 4) 토큰을 뽑아 모든 후보 CWD 기준으로 정규화 후 검사
tokens="$(printf '%s' "$cmd" | tr ';|&()<>"'"'"'`=,' ' ' | tr -s ' ' '\n')"
while IFS= read -r tok; do
  [[ -z "$tok" || "$tok" == -* ]] && continue
  [[ "$tok" != */* && "$tok" != "docs" && "$tok" != "origin" ]] && continue
  for base in "${cwds[@]}"; do
    hits_origin "$(normalize "$tok" "$base")" && deny
  done
done <<< "$tokens"

exit 0
