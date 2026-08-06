# 구조 다이어그램 (as-built 스냅샷)

이 폴더는 **지금 코드가 실제로 어떻게 배선돼 있는지**를 그린 그림을 담는다.
[overview.md](../overview.md) 의 ASCII 프로세스 도식은 타이머·트레이까지 포함한
**목표 구조**이고, 여기 있는 그림은 **그 시점에 실재하는 것만** 그린다. 둘이 어긋나면
목표 구조 쪽(overview.md)이 명세이고, 여기 그림은 현황 보고다.

- 그림은 **명세가 아니다.** 결정은 ADR 이 소유하고, 그림은 그 결정이 코드에 어떻게
  나타났는지 보여준다. 그림에서 발견한 결정 사항은 그림에 적지 말고 ADR·기능 문서에 넣는다.
- 파일명에 날짜를 붙이지 않는다. 구조가 바뀌면 같은 파일을 다시 렌더한다
  (시점 기록은 `docs/decision-log/` 의 몫이다).

## 목록

| 파일 | 무엇을 그렸나 | 기준 시점 |
|---|---|---|
| [m1-scaffold-structure.html](m1-scaffold-structure.html) | 프로세스 3분할(renderer·preload·main)과 IPC 왕복 1회, DB 부트스트랩, 리포지토리 포트 배선 | M1 스캐폴딩 머지 직후 (PR #26·#27) |

## 다시 렌더하는 방법

각 그림은 `<name>.architecture.json` 이 원본이고 `.html` 이 산출물이다.
JSON 을 고친 뒤 archify 스킬의 렌더러로 다시 만든다.

```bash
node ~/.claude/skills/archify/bin/archify.mjs render architecture docs/architecture/diagrams/m1-scaffold-structure.architecture.json docs/architecture/diagrams/m1-scaffold-structure.html
```

렌더러는 노드 겹침·라벨 충돌·캔버스 이탈을 검사해 실패시키므로, 통과했다는 것은
겹쳐서 안 읽히는 자리가 없다는 뜻이다. HTML 은 의존성 없는 단일 파일이며 브라우저에서
바로 열린다 (다크·라이트 토글과 PNG·SVG 내보내기 포함).
