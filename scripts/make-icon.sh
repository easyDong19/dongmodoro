#!/usr/bin/env bash
# build/icon.png (1024×1024) -> build/icon.icns
#
# `.icns` 는 바이너리라 diff 로 검토할 수 없다. 원본 PNG 를 추적하고 이 스크립트가
# 파생물을 만들게 해서, 아이콘이 바뀔 때 리뷰 대상이 PNG 한 장으로 남게 한다.
#
# 원본 규격: 1024×1024, 알파 있음, **아트는 가운데 824×824** 이고 나머지는 투명 여백이다.
# macOS 아이콘 규격이 그렇고, 꽉 채우면 Dock 에서 이웃 아이콘보다 커 보인다.
#
# sips·iconutil 은 macOS 기본 도구라 추가 설치가 필요 없다.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f build/icon.png ] || {
  echo "build/icon.png 이 없습니다." >&2
  exit 1
}

# iconutil 은 정해진 이름 규칙의 .iconset 디렉토리만 받는다.
TMP="$(mktemp -d)"
ICONSET="$TMP/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" build/icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" build/icon.png \
    --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o build/icon.icns
rm -rf "$TMP"

echo "build/icon.icns 생성 완료"
