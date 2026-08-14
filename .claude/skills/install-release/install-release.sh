#!/usr/bin/env bash
#
# 릴리스 .dmg 를 받아 /Applications 의 앱을 갈아 끼우고 실행한다.
#
# 사용자 데이터(~/Library/Application Support/dongmodoro)는 건드리지 않는다. 앱 번들과
# 데이터는 서로 다른 자리에 있고, 이 스크립트는 번들만 다룬다. 데이터를 비우려면 앱 안의
# `데이터` → `모든 데이터 초기화…` 를 쓴다 — 그쪽은 백업을 남기고 이쪽은 남기지 않는다.
#
# 사용법:
#   ./install-release.sh            # 최신 릴리스
#   ./install-release.sh v2.1.0     # 특정 태그
set -euo pipefail

REPO="easyDong19/dongmodoro"
APP="/Applications/dongmodoro.app"
TAG="${1:-}"

workdir="$(mktemp -d)"
mountpoint=""

# 마운트한 이미지를 반드시 떼어 낸다. 중간에 실패하면 /Volumes 에 붙은 채로 남고, 다음
# 실행이 같은 이름으로 붙으면서 `dongmodoro 2.1.0-arm64 1` 같은 두 번째 볼륨이 생긴다.
cleanup() {
  [ -n "$mountpoint" ] && hdiutil detach "$mountpoint" -quiet 2>/dev/null || true
  rm -rf "$workdir"
}
trap cleanup EXIT

if [ -z "$TAG" ]; then
  TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName)"
fi
echo "==> $TAG"

# `--repo` 가 필수다. 이 스크립트는 저장소 밖(임시 폴더)에서도 돌 수 있어야 하는데,
# gh 는 저장소 컨텍스트가 없으면 `not a git repository` 로 죽는다.
gh release download "$TAG" --repo "$REPO" --pattern '*.dmg' --dir "$workdir" --clobber
dmg="$(find "$workdir" -name '*.dmg' -print -quit)"
[ -n "$dmg" ] || { echo "이 릴리스에 .dmg 가 없습니다: $TAG" >&2; exit 1; }

# 실행 중인 앱을 남겨 둔 채 번들을 지우면 앱이 반쯤 죽은 상태로 돈다. 그리고 새 앱을
# 열어도 단일 인스턴스 잠금 때문에 옛 창이 앞으로 나올 뿐 새 버전은 뜨지 않는다.
if pgrep -f "$APP" >/dev/null 2>&1; then
  echo "==> 실행 중인 앱을 종료합니다"
  osascript -e 'quit app "dongmodoro"' 2>/dev/null || true
  for _ in $(seq 20); do
    pgrep -f "$APP" >/dev/null 2>&1 || break
    sleep 0.5
  done
  # 종료 확인 대화상자에서 `계속 집중` 을 고르면 종료가 취소된다 — 사용자의 선택이므로
  # 강제로 죽이지 않고 여기서 멈춘다.
  if pgrep -f "$APP" >/dev/null 2>&1; then
    echo "앱이 아직 실행 중입니다. 집중 세션이 돌고 있다면 먼저 정리한 뒤 다시 실행하세요." >&2
    exit 1
  fi
fi

# 마운트 지점을 **attach 출력에서 받아 온다.** 파일명으로 짐작하면 안 된다 — 볼륨 이름은
# `dongmodoro 2.1.0-arm64` 라서 `dongmodoro 2.1.0` 으로 넘겨짚으면 빗나간다. `hdiutil info`
# 로 뒤져도 안 된다: 그쪽은 시뮬레이터 런타임 같은 무관한 이미지까지 함께 나열한다.
mountpoint="$(
  hdiutil attach "$dmg" -nobrowse -readonly -plist |
    plutil -extract system-entities json -o - - |
    python3 -c "import json,sys; print(next(e['mount-point'] for e in json.load(sys.stdin) if e.get('mount-point')))"
)"

echo "==> 설치합니다"
rm -rf "$APP"
cp -R "$mountpoint/dongmodoro.app" /Applications/

# 서명은 애드혹이고 공증이 없어서 (ADR-028) 이것 없이는 macOS 가 실행을 막는다.
xattr -dr com.apple.quarantine "$APP"

installed="$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)"
echo "==> 설치된 버전: $installed"
# 태그와 번들 버전이 어긋나면 릴리스를 자를 때 package.json bump 를 빠뜨린 것이다.
[ "v$installed" = "$TAG" ] || echo "경고: 태그($TAG)와 번들 버전($installed)이 다릅니다." >&2

open -a "$APP"
echo "==> 실행했습니다. 데이터는 그대로입니다: ~/Library/Application Support/dongmodoro"
