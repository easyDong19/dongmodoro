---
name: tmp-backlog
description: |
  정식 기획 전의 아이디어·기능·버그 수정 메모를 docs/tmp/ 에
  기능 단위 md 파일로 보관·관리한다.

  USE WHEN: 사용자가 "일단 tmp 에 넣어둬", "임시로 기획 메모 남겨줘",
  "나중에 할 기능인데 적어놔", "백로그에 추가해줘" 라고 할 때,
  또는 tmp 에 있던 항목을 정식 기능으로 승격·배포해서 tmp 파일을 정리해야 할 때.

  DO NOT USE FOR: 정식 기획 문서 작성 (docs/features/ — docs/CLAUDE.md 의
  Phase 0~3 규칙을 따른다), 의사결정 기록 (decision-log 스킬),
  아키텍처 결정 (docs/architecture/decisions/ 의 ADR).
allowed-tools: Read, Grep, Glob, Write, Edit
---

# docs/tmp 임시 기획 보관함 관리

## 위치와 파일명

```
docs/tmp/
├── README.md              # 폴더 규칙 + 현재 목록 표
└── <feature-name>.md      # 기능(버그) 단위 1파일, kebab-case
```

## 항목 추가

1. `docs/tmp/<kebab-case>.md` 를 만든다. 최소 구조:
   - `# 제목` / `## 무엇을` / `## 왜` — 필수
   - `## 구현 아이디어 (미확정)` / `## 열린 질문` — 선택
2. 용어는 [CONTEXT.md](../../../CONTEXT.md) 캐노니컬 용어만 쓴다 (`_Avoid_` 표기 금지).
3. `docs/tmp/README.md` 의 "현재 목록" 표에 한 줄 추가한다.

## 항목 승격·정리

- tmp 항목을 **정식 기능으로 구현·배포했다면 해당 md 파일을 삭제**하고
  README 목록에서도 지운다. 이력은 git 이 보존하므로 별도 아카이브는 없다.
- 규모가 커져 정식 기획이 필요하면 `docs/features/` 로 옮기되,
  그때는 docs/CLAUDE.md 의 Phase 0 승인 절차를 따른다 (승인 전 파일 생성 금지).

## 주의

- tmp 문서는 **확정 명세가 아니다** — 구현 시 그대로 따를 의무 없음.
- `docs/origin/` 에는 절대 만들지 않는다 (읽기 전용, 도구 레벨 차단).
- 커밋 메시지는 영어 (`docs(tmp): ...`).
