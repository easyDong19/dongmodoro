# 문서 작성 가이드 (docs/)

이 디렉토리의 기획 문서는 아래 규칙에 따라 작성한다.

## 디렉토리 구조

```
docs/
├── CLAUDE.md        # 이 문서. 문서 작성 규칙
├── origin/          # 원천 데이터 (READ-ONLY) — 절대 수정 금지
├── design-system/   # 횡단 관심사: 디자인 토큰·시각 철칙 (기능 폴더와 동급)
│   └── wireframes/  # 토큰을 적용한 화면 시안 (구속력 없는 시각 참조)
├── architecture/    # 횡단 관심사: 기술 스택·프로세스 구조·기술 결정(ADR) (기능 폴더와 동급)
├── features/        # 생성된 기능별 기획 문서 묶음
└── plans/           # 구현 계획서 (마일스톤·작업 단위, YYYY-MM-DD-<slug>.md)
```

## `docs/plans/` — 구현 계획서

- 구현 작업의 태스크 분해·순서·검증 방법을 담는 **작업 지시서**다. 기획(무엇을)이 아니라
  실행(어떤 순서로)을 기록하며, 파일명은 `YYYY-MM-DD-<slug>.md`.
- 계획은 결정을 만들지 않는다 — 설계 결정이 필요하면 ADR 로 architecture 에 먼저 남기고
  계획은 그것을 참조만 한다. 기능 문서·ADR 과 충돌하면 그쪽이 이긴다.
- 실행이 끝난 계획은 수정하지 않고 이력으로 남긴다.

## `docs/design-system/` — 디자인 토큰과 시각 철칙 (횡단 문서)

- [design-system/tokens.md](design-system/tokens.md) 가 색·폰트·radius·브레이크포인트·유리 표면·모션·레이어·인터랙션 토큰의 **유일한 출처**다. (spacing 만 아직 미토큰화 — M1 Task 7 에서 결정)
- 모든 ux-spec 과 구현 코드는 **토큰 이름으로만** 시각 값을 기술한다. raw hex/px 직접 기입 금지.
- 토큰 추가·변경은 ADR 로 근거를 남긴 뒤에만 한다.
- **접근성 기준선은 판정 가능한 수치다** — 텍스트 대비 4.5:1(판정 배경은 최악 조건), 비텍스트 3:1, 포커스 링 필수, 조작 타깃 24px. [principles.md §7](design-system/principles.md) 참조.
- 시각 판단(색 의미, 실패 프레임, 모션)은 [design-system/principles.md](design-system/principles.md) 를 따르고, 기능 문서와 충돌 시 principles.md 가 이긴다.

### `design-system/wireframes/` — 화면 시안 (구속력 없음)

- 토큰만 사용해 그린 **살아있는 시각 참조**다. 파일명에 날짜를 붙이지 않고, 디자인이
  바뀌면 같은 파일을 갱신한다 (시점 기록은 `docs/decision-log/` 의 몫이다).
- **명세가 아니다.** 와이어프레임이 기능 문서와 어긋나면 **ux-spec·prd 가 이긴다.**
  와이어프레임에서 발견한 결정 사항은 그림에 남기지 말고 해당 문서·ADR 에 반영한다.
- 여기에 raw hex·px 색값을 새로 만들지 않는다. 토큰에 없는 값이 필요하면 ADR 선행
  ([tokens.md §10](design-system/tokens.md)) — 와이어프레임이 토큰 공백을 발견하는
  자리이긴 하지만, 공백을 그림에서 임의로 메우지는 않는다.

## `docs/architecture/` — 기술 스택과 프로세스 구조 (횡단 문서)

- [architecture/overview.md](architecture/overview.md) 가 확정 스택·프로세스 아키텍처·미결정 사항의 **유일한 출처**다.
- 특정 기능에 속하지 않는 기술 결정(스택 선택, 프로세스 경계, 배포 방식)은 기능 폴더가 아니라 여기에 기록한다.
- 기술 선택의 결정 근거는 [architecture/decisions/](architecture/decisions/) 아래 ADR(`adr-NNN-<slug>.md`)로 남긴다. context / decision / consequences 섹션 필수.
- 기능별 technical-spec 은 architecture 문서와 **충돌할 수 없다.** 충돌이 필요하면 먼저 ADR 로 architecture 를 갱신한다.
- 결정이 뒤집히면 기존 ADR 을 수정하지 말고 superseded 표기 후 새 ADR 을 추가한다. 표기는 상태 줄에만 넣고 본문은 이력으로 그대로 둔다. ADR 의 일부만 뒤집힌 경우 **어느 절이 죽고 어느 절이 살아 있는지** 명시한다.
- **ADR 번호가 두 폴더에서 중복된다** (`architecture/decisions/` 와 `design-system/decisions/` 가 각자 001 부터 센다). 문서에서 부를 때 `ADR-007` 은 **architecture** 를 뜻하고, design-system 것은 반드시 **`design-system ADR-007`** 처럼 폴더를 앞에 붙인다.

## ⛔ `docs/origin/` — 원천 데이터 (읽기 전용)

`docs/origin/` 안의 모든 파일은 **초안·개념 스케치**다. 이력 보존을 위해 파일은
건드리지 않지만, **내용이 확정 명세(source of truth)는 아니다.**

- **읽기만 가능하다.** 내용 파악은 Read / Grep / Glob 으로만 한다.
- **수정·생성·삭제·이동·이름 변경 모두 금지한다.** 오타·형식 오류·중복이 보여도 손대지 않는다.
- `mv`, `rm`, `sed -i`, `>` 리다이렉션 등 셸을 이용한 우회 수정도 금지다.
- **내용은 구속력이 없다.** 설계 결정이 origin 과 어긋나도 되며, 확정 기준은
  `docs/features/` · `docs/architecture/` 문서다. 충돌 시 그쪽이 이긴다.
  origin 내용에 오류가 보이면 고치지 말고 확정 문서 쪽에 올바른 내용을 기록한다.
- 원천 데이터에서 얻은 내용은 `docs/features/` 아래의 기획 문서로 **이관(재작성)** 하고, 원본은 그대로 둔다.
- 문서에 사실을 기술할 때 근거로 인용은 가능하다. (예: `> 출처: docs/origin/<파일명>`)

> 이 규칙은 프로젝트 `.claude/settings.json` 의 `permissions.deny` 와
> `PreToolUse` 훅([.claude/hooks/protect-origin.sh](../.claude/hooks/protect-origin.sh))으로
> 도구 레벨에서 강제된다. 차단 메시지를 받으면 우회하지 말고 사용자에게 알린다.

---

# Claude Code 프롬프트: 기능별 기획 문서 묶음 생성

> 사용법: 아래 전체를 Claude Code에 붙여넣고, 상단의 `[ ]` 플레이스홀더만 채우세요.
> 참고 아티클: https://safeai-kr.github.io/llm-wiki-document-architecture/

---

## 컨텍스트

- 프로젝트: [프로젝트 이름과 한 줄 설명]
- 문서 대상: [예: 이 레포의 주요 기능 / 특정 디렉토리 / 기존 통합 기획서 파일 경로]
- 문서 루트: `docs/features/` (없으면 생성)
- 언어: 모든 문서는 한국어로 작성

## 역할

너는 이 저장소의 기획 문서 아키텍트다. 목표는 "단일 통합 기획서"가 아니라 **기능별 기획 문서 묶음(feature folder + overview.md 진입점)** 구조로 기획 문서를 생성·재편하는 것이다. 문서 구조는 소프트웨어 아키텍처처럼 trade-off이므로, 파일 수를 늘리는 것이 목표가 아니라 **수정 책임의 경계를 만드는 것**이 목표다.

## 진행 방식 (반드시 이 순서대로)

### Phase 0. 분석

1. 코드베이스(라우팅, 주요 모듈, API 엔드포인트, 화면 단위)와 기존 문서를 탐색해 **기능 후보 목록**을 뽑는다.
2. 각 기능 후보에 대해 다음을 정리한 표를 출력한다:
   - 기능 이름 (kebab-case 폴더명 제안 포함)
   - 근거가 된 코드/문서 위치
   - 예상 문서 세트 (필수: overview, prd / 선택: ux-spec, technical-spec, decisions, rollout)
   - 선택 문서를 넣는 이유 (아래 "문서 분리 신호" 기준으로만 판단)
3. **여기서 멈추고 내 승인을 받는다.** 기능 목록·폴더명·문서 세트에 대해 내가 수정하면 반영한다. 승인 전에는 어떤 파일도 생성하지 않는다.

### Phase 1. 계획 수립

승인된 기능 목록을 기반으로 TodoWrite로 작업 계획을 만든다. 작업 단위는 "기능 1개 = 태스크 1개"이며, 각 태스크는 폴더 생성 → 문서 작성 → 자체 검증까지 포함한다.

### Phase 2. 기능별 생성 (한 번에 한 기능씩)

기능 하나를 완성한 뒤 다음 기능으로 넘어간다. 여러 기능을 동시에 절반씩 만들지 않는다.

### Phase 3. 인덱스와 검증

1. `docs/features/README.md`에 전체 기능 인덱스 표를 만든다: 기능명 | 상태 | 진입점 링크 | 보유 문서.
2. 아래 "Harness 체크리스트"를 전 문서에 대해 실행하고, 결과를 표로 보고한다. 실패 항목은 수정 후 재검증한다.

## 문서 구조 규칙

```
docs/features/<feature-name>/
├── overview.md          # 필수. 진입점
├── prd.md               # 필수. 제품 요구사항
├── ux-spec.md           # 분리 신호가 있을 때만
├── technical-spec.md    # 분리 신호가 있을 때만
├── decisions/           # ADR. 분리 신호가 있을 때만 (adr-001-<slug>.md)
├── rollout.md           # 분리 신호가 있을 때만
└── meta.yaml            # 필수
```

### 책임 경계 (절대 섞지 말 것)

| 문서 | 책임 | 담으면 안 되는 것 |
| --- | --- | --- |
| overview.md | 기능 목적, 현재 상태, 세부 문서 링크 안내 | 요구사항·스펙 세부 내용의 복사본 |
| prd.md | 문제, 대상 사용자, 목표, 범위·비범위, 제품 요구사항, 성공 지표, 인수 기준 | API 설계, 화면 문구, 배포 절차 |
| ux-spec.md | 화면 상태, 예외 화면, 문구, 상호작용 | 비즈니스 요구사항, DB 구조 |
| technical-spec.md | API, DB, 시스템 구조, 구현 제약 | 제품 목표, UX 문구 |
| decisions/ (ADR) | 선택지, 최종 결정, 결정 근거, 영향 | 요구사항 정의 |
| rollout.md | 배포 순서, 마이그레이션, 모니터링, 롤백 | 기능 스펙 자체 |

### 문서 분리 신호 (선택 문서는 이 기준으로만 추가)

- ux-spec: 상태·예외·문구 규칙이 요구사항 본문보다 길어질 만큼 많다
- technical-spec: API/DB/제약이 코드에서 실제로 확인되고, PRD에 넣으면 책임이 섞인다
- decisions: 기술 선택의 근거를 남기지 않으면 같은 논쟁이 반복될 결정이 코드에 보인다 (예: 상태 판정 방식, 라이브러리 선택)
- rollout: 배포·복구 절차가 기능 스펙과 독립적으로 바뀔 성격이다

신호가 없으면 만들지 않는다. **모든 기능에 모든 문서를 강제하는 것은 실패다.**

## 문서 템플릿

### overview.md

```markdown
# <기능 이름>

## 기능 목적
(1~3문장. 누구의 어떤 문제를 해결하는가)

## 현재 상태
- Draft | In Review | Published

## 문서 안내
- [PRD](./prd.md): 제품 요구사항과 인수 기준
- (존재하는 문서만 나열, 각 링크에 한 줄 설명)
```

### prd.md

```markdown
# PRD: <기능 이름>

## 문제
## 대상 사용자
## 목표
## 범위 / 비범위
## 요구사항
(번호 붙은 목록. 각 항목은 검증 가능한 문장으로)
## 성공 지표
## 인수 기준
(요구사항 번호와 대응되게)
```

### meta.yaml

```yaml
id: feature-<feature-name>
status: draft
owner: [팀/담당자 또는 TBD]
entrypoint: overview.md
docs:
  - prd.md
  # 존재하는 문서만
```

## 작성 원칙

1. **코드가 근거다.** 코드에서 확인한 사실과 추론·가정을 구분한다. 가정은 문서에 `> ⚠️ 가정:` 블록으로 명시하고, 확인 불가 항목은 지어내지 말고 `TBD`로 남긴다.
2. **overview는 입구일 뿐이다.** 세부 내용을 복사해 담지 않는다. 목적·상태·링크만.
3. **one source tree.** `draft/`, `published/` 폴더를 복제하지 않는다. 상태는 meta.yaml의 `status`와 Git 브랜치/PR로 관리한다.
4. 요구사항은 "~할 수 있다"가 아니라 검증 가능한 문장으로 쓴다. (좋음: "정상/지연/끊김 3개 상태를 구분해 표시한다" / 나쁨: "상태를 잘 보여준다")
5. 기존 통합 문서가 있다면 내용을 버리지 말고 책임 경계에 따라 각 문서로 이관하고, 원본은 삭제하지 말고 이관 완료 여부를 나에게 보고한다.

## Harness 체크리스트 (Phase 3에서 기계적으로 검증)

- [ ] 모든 기능 폴더에 overview.md, prd.md, meta.yaml 존재
- [ ] prd.md에 필수 섹션 존재: 문제, 목표, 범위, 요구사항, 성공 지표, 인수 기준
- [ ] technical-spec.md가 존재하면: API/DB/시스템 영향 섹션 존재
- [ ] ADR이 존재하면: context, decision, consequences 섹션 존재
- [ ] rollout.md가 존재하면: 배포 절차, 모니터링, 롤백 섹션 존재
- [ ] 모든 내부 링크가 실제 파일을 가리킴 (깨진 링크 0)
- [ ] meta.yaml의 id 중복 없음, docs 목록이 실제 파일과 일치
- [ ] overview.md에 세부 스펙 내용 중복 없음 (링크로만 안내)

## 금지사항

- **`docs/origin/` 내부 파일의 수정·생성·삭제·이동 (읽기만 허용)**
- 승인 전 파일 생성
- draft/published 이중 트리 생성
- 분리 신호 없는 선택 문서 생성
- 코드로 확인 안 된 수치·정책을 사실처럼 서술
- 한 PR/커밋에 서로 다른 기능의 문서 섞기 (커밋은 `docs(<feature-name>): ...` 형식으로 기능별 분리)
