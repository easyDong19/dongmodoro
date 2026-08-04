# ADR-011: 계획 단계 스키마 확정 — weeks·task_pulls 신설, 불변 달력 키, 제약·PRAGMA

- 상태: accepted (2026-08-04) · **부분 정정됨 (2026-08-04, 문서 리뷰 결과)**
  - §2 의 "pull 은 오늘이 속한 주의 항목으로 제한한다" → [ADR-012](adr-012-aggregation-predicate.md) 가 폐기 (집계 술어로 대체)
  - §1 의 `budget INTEGER NULL`(기본값 파생)과 행 생성 시점 → [ADR-013](adr-013-baseline-budget-effect.md) 이 정정 (확정 저장 + 첫 세션 시 생성)
  - 정의하지 않았던 삭제·보관 표현 → [ADR-014](adr-014-deletion-and-archive.md) 가 보완
  - 그 외(`weeks`·`task_pulls` 신설, 불변 달력 키, `completed_at` 통일, 제약·PRAGMA, 백업·버전 검사)는 유효하다.
- 결정 근거 원장: [2026-08-04 기획 검증 세션](../../decision-log/2026-08-04-planning-session.md) §C (Q7·Q10~Q14 + ERD 평가 수용분)
- 평가 대상 스냅샷: [2026-08-04-schema-draft-snapshot.md](../../decision-log/2026-08-04-schema-draft-snapshot.md) — 이 ADR 이전의 초안. 충돌 시 이 ADR 이 이긴다.

## Context

계획 단계 스키마 초안을 컨텍스트 격리된 서브에이전트로 평가시켜 블로커(B1~B6)와
주요 지적(S1~S10)을 받았고, Q7·Q10~Q14 결정과 합쳐 스키마를 확정한다. 반복해서
문제가 된 지점은 세 가지였다: ① 집계 귀속 기준이 화면마다 달라 숫자가 안 맞을 수
있다 ② 조회 시점 재계산(날짜 파생, 사슬 길이)이 타임존 이동·건너뛴 주에서 틀어진다
③ SQLite 는 제약을 나중에 추가하려면 테이블 재작성이라 초기 마이그레이션에 다
넣어야 한다.

이 ADR 은 초안 대비 **변경분**을 기록한다. 변경 없는 테이블 구조(milestones 골격,
settings 등)는 스냅샷과 기능별 technical-spec 을 따른다.

## Decision

### 1. `weeks` 테이블 신설 (B4 — `week_settlements` 흡수·폐지)

```
week             TEXT PK   -- 그 주 월요일 날짜, CHECK (strftime('%w', week)='1') (ADR-010)
budget           INTEGER NULL   -- NULL = capacity 합이 기본 예산. 값 = 주별 오버라이드
capacity         TEXT      -- 요일별 가용 뽀모 수 JSON [월..일] — 계획 시점 스냅샷
focus_min        INTEGER   -- 그 주 뽀모 베이스라인 스냅샷
short_break_min  INTEGER
long_break_min   INTEGER   -- 초안 week_settlements 에 누락돼 있던 것 보완
planned_at       TEXT NULL -- 순간. 주간 계획 확정 시각
settled_at       TEXT NULL -- 순간. 이 주가 정산된 시각
```

주별 예산 오버라이드·베이스라인 스냅샷·계획/정산 이력이 한 행으로 모인다.
행은 그 주를 계획하거나 정산할 때 생긴다 (lazy). 정산 필요 **판정**은 여전히
워터마크 단독이다 (Q5) — `settled_at` 은 이력·스냅샷 전용.

### 2. `task_pulls` 행 승격 (B3 — `tasks.pulled_date` 삭제)

```
task_id    TEXT FK -> tasks.id
pull_date  TEXT    -- 달력 키 'YYYY-MM-DD'
PRIMARY KEY (task_id, pull_date)
```

단일 컬럼이면 재-pull 때 과거 이력이 덮여 지난 날짜 패널이 거짓말을 한다.
행으로 승격해 "그날 오늘 목록에 있었다"는 사실을 보존한다.
**pull 은 오늘이 속한 주의 항목으로 제한한다** (Q10) — 날짜 기준 집계(주간 총 소진)와
관계 기준 집계(항목별 소진)가 구조적으로 일치해, 게이지 = 항목 합 + 미분류가 항상
닫힌다. 대가: "내일 계획을 오늘 밤 미리 시작"은 불가 — 수용.

### 3. `sessions` — 불변 달력 키 + `updated_at` (B5·S1)

- `local_date`·`local_week` TEXT NOT NULL 추가 — **insert 시 1회 계산 후 불변**
  (ADR-009 §2). 귀속 기준은 `started_at` 의 로컬 날짜(Q2), `local_week` 은 ADR-010 의
  주 키. 조회 시 `strftime()` 파생 금지 — 타임존 이동에 과거 기록이 소급 이동하고
  인덱스가 무효화된다.
- `updated_at` 추가 (S1). **ADR-006 의 "sessions 제외" 결정을 부분 정정한다** —
  사후 캡처가 기존 세션의 `task_id`·`note` 를 UPDATE 하므로 sessions 는 append-only 가
  아니다. ADR-006 본문은 수정하지 않고 상태 표기로 남긴다.

### 4. `week_items` — `origin_week`·`is_system` (Q7·Q11·Q12)

- `origin_week` TEXT NOT NULL — 항목이 최초 생성된 주를 박제. 이월 배지 "N주째" =
  `(week − origin_week)/7 + 1` (날짜 산술 한 줄, 건너뛴 주 자동 포함).
  `carry_from_id` 는 직전 원본 추적·이력 전용으로 축소한다 — 사슬 길이를 배지로
  쓰지 않는다 (건너뛴 주에서 틀어짐).
- `is_system` INTEGER — 주차별 시스템 "기타" 행 (Q7). 부모 없는 task(오늘 목록 직접
  추가, 사후 캡처 소급 생성)를 여기 붙여 `tasks.week_item_id` NOT NULL 을 유지한다.
  규칙: `est_pomos = 0`(과적 경고·요일 부하 미산입) / 플래너에서 편집·삭제 불가 /
  정산 이월 3택 제외 / 실제 필요할 때만 생성 (lazy). 주간 카드에서는 미분류 집중과
  합쳐 "기타 — 계획에 없던 집중" 한 행으로 표시한다 (Q11).

### 5. 완료 표현 통일 — `done` 삭제, `completed_at` (S3)

- `milestones.done`·`tasks.done` boolean 을 `completed_at` TEXT NULL(순간)로 교체.
  boolean 은 완료 시각을 잃어 "8/5에 끝낸 task 가 8/1 날짜 패널에서 완료로 보이는"
  버그를 만들고, 정산의 "끝낸 것들"을 주 단위로 거를 수 없다.
- `week_items.status` enum('active'|'done'|'dropped')도 같은 패턴으로 대체한다:
  `completed_at` TEXT NULL + `dropped_at` TEXT NULL, 둘 다 NULL = active.
  세 테이블의 완료 표현이 `completed_at` 하나로 통일되고, 폐기 시각도 정산 이력에
  남는다. (S3 의 "세 테이블 표현 통일"을 스키마로 구체화한 것)

### 6. 제약은 초기 마이그레이션에 전부 (B6)

NOT NULL·CHECK·FK 를 첫 마이그레이션에 모두 포함한다. SQLite 는 이들을 나중에
추가하려면 **테이블 재작성**이고, 그 SQL 이 실데이터 위에서 앱 시작 시 돌게 된다.
CHECK 예: 주 키 월요일(§1), `kind IN ('focus','short','long')`, 달력 키 GLOB
`'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`, 순간 컬럼의 `'...Z'` 접미사.

### 7. PRAGMA 세트 + 시작 시 안전장치

- 연결마다: `foreign_keys = ON` (**better-sqlite3 기본 OFF** — 켜지 않으면 위 FK 가
  전부 장식이다), `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout` 설정.
- 앱 시작 시: 마이그레이션 적용 **전에 DB 파일 백업** + 스키마 버전 검사 — DB 버전이
  앱보다 높으면(다운그레이드 실행) 열지 않고 안내한다. 크래시·데이터 파손 방지.

### 8. 보류 (YAGNI — 뒤집으려면 새 ADR)

- `days` JSON → 행 정규화 (S4): 근거였던 "task 단위 요일 배정"이 명시적 비목표. 보류.
- 인덱스 6종 (S5): 옳지만 이 규모(수만 행)에서 급하지 않음. 구현 시 포함한다.

## Consequences

- (+) 화면 간 숫자 불일치(게이지 vs 항목 행, 정산 "남은 몫")가 구조적으로 불가능해진다.
- (+) 타임존 이동·건너뛴 주·재-pull 에도 과거 기록이 불변이다.
- (+) 잘못된 값(월요일 아닌 주 키, 미지의 kind)은 저장 자체가 실패한다 — 버그가
  조용히 데이터를 오염시키는 대신 시끄럽게 죽는다.
- (−) `local_date` 등 "행 자신의 사실" 저장은 PRD 원칙 8(집계값 저장 금지)의 예외로
  보일 수 있다 — 예외가 아니다. 원칙 8 이 금지하는 것은 아래→위 합산 파생값이고,
  이들은 그 행이 벌어진 맥락의 박제다 (ADR-009 §2).
- (−) 기타 행·`task_pulls` 등으로 초안보다 테이블·행이 늘었다. 대신 nullable FK 와
  "덮어쓰는 컬럼"이 사라져 불변식이 단순해졌다.
- ADR-006 은 sessions `updated_at` 항목에 한해 이 ADR 로 부분 정정된다. UUID v7 PK 등
  나머지 결정은 유효하다.
