# 의사결정 기록 — 2026-09-25 기능 상태 값의 뜻

> [온보딩 폐기와 문서·코드 동기화](./2026-09-25-onboarding-and-doc-sync.md) Q3 에서 미룬 결정을
> 닫은 기록. 결정 1건이라 flow html 은 두지 않는다.

---

### Q1. `Draft · In Review · Published` 는 무엇을 뜻하나

- 배경: docs/CLAUDE.md 의 overview 템플릿은 상태 값 3개를 나열만 하고 뜻을 정의하지 않았다.
  그 결과 8개 기능이 모두 출시됐는데 overview 에는 `Draft`·`In Review` 가 섞였고, meta.yaml 은
  7개가 `draft` 였으며, milestones 는 overview(`In Review`)와 meta(`draft`)가 서로 달랐다.
  한편 스펙은 #85·#86 이후 코드와 어긋난 곳이 남아 있었다.
- 선택지:
  - **상태 = 문서가 코드를 얼마나 믿을 만하게 기술하는가 (AI 추천)** — Draft 구현 전 /
    In Review 구현됐지만 스펙·코드 대조 전 / Published 대조까지 끝남. 지금 8개는 전부 In Review
  - 상태 = 구현 여부만 — 출시된 8개가 전부 Published 가 된다. 대신 스펙이 코드와 어긋난 상태를
    Published 가 가리게 된다
- **결정: 첫 번째.** docs/CLAUDE.md 에 "기능 상태의 뜻" 절을 두고, 8개 기능을 In Review 로
  맞췄다 (overview · meta.yaml `in-review` · features/README 표).
- 이유: "2번 ㅇㅇ ㄴ가 생각하대로 가 ㅇㅇ"
- 파생:
  - **Published 를 유지하는 규칙을 함께 적었다** — Published 기능의 UI 문구·동작을 바꾸는
    PR 은 스펙도 같은 PR 에서 고치고, 못 고치면 In Review 로 내린다. #85·#86 이 스펙을 고치지
    않아 생긴 불일치([온보딩 로그](./2026-09-25-onboarding-and-doc-sync.md) 특기 사항)에 대한
    대응이다. 사용자가 명시적으로 고른 항목은 아니며, 상태 정의가 성립하려면 필요한 조건으로
    AI 가 덧붙였다.
  - Published 로 올리는 첫 작업은 #86 UI 용어의 스펙 동기화다.
