#!/usr/bin/env bash
# docs/origin/ 은 원천 데이터(read-only)다.
# PreToolUse 훅으로 해당 경로를 "변경"하는 도구 호출만 차단한다.
#
# 판정 방식:
#   - Write/Edit/NotebookEdit : 대상 경로를 정규화해 docs/origin 하위인지 검사
#   - Bash                    : 변경 계열 명령일 때만 검사. 읽기 전용(ls/cat/grep 등)은 통과.
#                               `cd` 대상까지 후보 CWD 로 잡아 상대경로 우회를 막는다.
#
# 2026-08-04 패치 (docs/decision-log/2026-08-04-hook-patch.md):
#   1) heredoc 본문은 데이터(커밋 메시지·문서 내용)다 — 경로 검사에서 제외한다.
#      (이전에는 본문 속 `docs(week-plan):` 이 단독 `docs` 토큰으로 쪼개져
#       "docs 폴더 삭제 시도"로 오판, Conventional Commits 제목과 충돌했다)
#   2) "상위 경로(예: rm -rf docs)" 규칙은 파괴적 명령(rm·mv 등)에만 적용한다.
#      cp·tee·인터프리터 실행은 docs 를 통째로 없앨 수 없다.
#   3) /bin/rm 등 절대경로 호출도 변경 명령으로 인식한다.
#
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

# destructive=1 (rm·mv 등) 일 때만 "docs/origin 을 포함하는 상위 경로"도 차단한다.
destructive=0
hits_origin() {
  local abs="$1"
  [[ "$abs" == "$ORIGIN" || "$abs" == "$ORIGIN"/* ]] && return 0
  [[ "$destructive" -eq 1 && "$ORIGIN" == "$abs"/* ]] && return 0   # 예: rm -rf docs
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

# 0) heredoc 본문 제거 — 커밋 메시지·문서 내용은 명령이 아니라 데이터다.
#    검사 대상(scan)은 heredoc 본문 줄을 건너뛴 나머지다.
scan="$(printf '%s\n' "$cmd" | awk '
  inhd == 1 {
    t = $0; sub(/^[ \t]+/, "", t)
    if (t == hd) inhd = 0
    next
  }
  {
    if (match($0, "<<-?[ \t]*[\"\047]?[A-Za-z_][A-Za-z0-9_]*")) {
      hd = substr($0, RSTART, RLENGTH)
      sub(/^<<-?[ \t]*/, "", hd)
      gsub(/["\047]/, "", hd)
      inhd = 1
    }
    print
  }')"

# 1) 변경 계열인지 판정. 아니면 읽기 전용으로 보고 통과시킨다.
mutating=0
PFX='([^[:space:]|&;()]*/)?'   # /bin/rm 같은 절대경로 호출 허용

# 출력 리다이렉션 (> / >>). 2>/dev/null 같은 fd 리다이렉션은 제외.
printf '%s' "$scan" | grep -qE '(^|[^0-9&<>])>>?[[:space:]]*[^&|[:space:]]' && mutating=1

# 파일을 만들거나 바꾸는 명령어들
write_cmds='rm|rmdir|mv|cp|ln|touch|mkdir|install|truncate|dd|tee|shred|patch|unlink|rename|sponge|chmod|chown|chgrp|chflags|xattr|sed|perl|python|python3|node|ruby|osascript|rsync|zip|unzip|tar'
printf '%s' "$scan" | grep -qE "(^|[|&;(]|[[:space:]])${PFX}(${write_cmds})([[:space:]]|$)" && mutating=1

# git 은 쓰기 서브커맨드일 때만
printf '%s' "$scan" | grep -qE "(^|[|&;(]|[[:space:]])${PFX}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(checkout|restore|clean|apply|mv|rm|stash|reset|revert|merge|rebase|am|switch)([[:space:]]|$)" && mutating=1

[[ "$mutating" -eq 0 ]] && exit 0

# 1.5) 파괴적 명령 판정 — 상위 경로 규칙(rm -rf docs)은 이 경우에만 적용한다.
destr_cmds='rm|rmdir|mv|shred|unlink|dd|truncate|rename'
printf '%s' "$scan" | grep -qE "(^|[|&;(]|[[:space:]])${PFX}(${destr_cmds})([[:space:]]|$)" && destructive=1
printf '%s' "$scan" | grep -qE "(^|[|&;(]|[[:space:]])${PFX}git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(rm|mv|clean)([[:space:]]|$)" && destructive=1

# 2) 안전망: 변경 명령이면서 경로 문자열이 그대로 보이면 즉시 차단.
printf '%s' "$scan" | grep -qE 'docs/+origin(/|$|[^A-Za-z0-9_-])' && deny

# 3) 후보 CWD 수집: 프로젝트 루트 + 커맨드 안의 `cd <dir>` 대상
declare -a cwds=("$PROJECT_DIR")
while IFS= read -r d; do
  [[ -z "$d" ]] && continue
  d="${d%\"}"; d="${d#\"}"; d="${d%\'}"; d="${d#\'}"
  cwds+=("$(normalize "$d" "$PROJECT_DIR")")
done < <(printf '%s' "$scan" | grep -oE '(^|[|&;(]|[[:space:]])cd[[:space:]]+[^;|&[:space:]]+' | sed -E 's/.*cd[[:space:]]+//')

# 4) 토큰을 뽑아 모든 후보 CWD 기준으로 정규화 후 검사
tokens="$(printf '%s' "$scan" | tr ';|&()<>"'"'"'`=,' ' ' | tr -s ' ' '\n')"
while IFS= read -r tok; do
  [[ -z "$tok" || "$tok" == -* ]] && continue
  [[ "$tok" != */* && "$tok" != "docs" && "$tok" != "origin" ]] && continue
  for base in "${cwds[@]}"; do
    hits_origin "$(normalize "$tok" "$base")" && deny
  done
done <<< "$tokens"

exit 0
