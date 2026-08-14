# docs/tmp — 임시 기획 보관함

정식 기획에 들어가기 전의 **아이디어·기능·버그 수정 메모**를 잠깐 보관하는 폴더다.
`docs/features/` 의 기획 문서 규칙(Phase 0 승인, overview.md, meta.yaml 등)을 **적용받지 않는다** —
가볍게 쓰고 가볍게 지우는 것이 목적이다.

## 규칙

- **기능(또는 버그) 단위로 md 파일 하나.** 파일명은 kebab-case (예: `prevent-window-drag.md`).
- 내용은 자유 형식이되, 최소한 **무엇을 / 왜** 는 적는다. 구현 아이디어·참고 링크는 선택.
- 여기 있는 문서는 **확정 명세가 아니다.** 실제 구현 시 정식 기획(`docs/features/`)을 거치거나,
  작다면 바로 구현해도 된다.
- **정식 기능으로 만들어 배포했다면 해당 tmp 파일은 삭제한다.** 이 폴더에는
  "아직 안 만든 것"만 남는다. 이력은 git 히스토리가 보존한다.
- 용어는 [CONTEXT.md](../../CONTEXT.md) 의 캐노니컬 용어를 따른다.

## 현재 목록

| 파일 | 한 줄 요약 |
|---|---|
| [prevent-window-drag.md](prevent-window-drag.md) | 앱 창을 마우스 드래그로 옮기지 못하게 막기 |
| [session-end-dock-bounce-notification.md](session-end-dock-bounce-notification.md) | 세션 종료 시 Dock 아이콘 바운스 + 데스크톱 알림 |
