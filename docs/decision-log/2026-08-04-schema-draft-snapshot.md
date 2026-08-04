# dongmodoro — 계획 단계 DB 스키마 초안 (평가 대상 스냅샷)

> ⚠️ **시점 주의**: 이 파일은 Q7 결정 직후, ERD 서브에이전트 평가에 넘긴 **그 시점의 스냅샷**이다.
> 이후 결정으로 뒤집힌 내용이 포함되어 있다 — 주 키는 `'YYYY-Wnn'`이 아니라 **그 주 월요일 날짜**(Q9-E),
> 주 시작은 월요일(Q8-1), `week_settlements`는 `weeks` 테이블로 흡수(B4), `pulled_date`는 `task_pulls`로
> 승격(B3), `done`→`completed_at`(S3), `local_date`/`local_week`/`origin_week` 추가 등.
> **확정 내용은 [2026-08-04-planning-session.md](./2026-08-04-planning-session.md)가 기준이다.**
> 이 파일의 용도는 "ERD 평가가 무엇을 보고 지적했는지"의 재현용 원본 보존.

1인용 로컬 Electron 뽀모도로 앱. 네트워크·멀티유저·로그인 없음.
DB: SQLite (better-sqlite3) + Drizzle ORM. 마이그레이션은 앱 시작 시 적용.
PK 는 UUID v7 (TEXT), mutable 테이블에는 `updated_at` (미래 동기화 대비 보험).

## 도메인 계층

```
Milestone (월, 결과물)
 └─ WeekItem (주, 할당량 + est🍅 + 요일 배치 의도)
     └─ Task (일 단위 조각 — 첫 pull 때 생성)
         └─ Session (타이머 1회 완료 = 1🍅)
```

- WeekItem → Milestone: 선택 (nullable)
- Task → WeekItem: **필수 (NOT NULL)**
- Session → Task: 선택 (nullable = "미분류 집중")

## 테이블

### settings
```
key    TEXT PK
value  TEXT  -- JSON
```
사용 키:
- `weekly_capacity`: `[8,4,2,4,2,4,0]` — 일~토 요일별 가용 뽀모 **개수**(분 아님). index 0 = 일요일.
- `focus_min` / `short_break_min` / `long_break_min` — 기본 25/5/15
- `last_settled_week`: `'2026-W33'` — 정산 워터마크 (아래 참조)

### milestones
```
id           TEXT PK        -- uuid v7
month        TEXT           -- 'YYYY-MM' (zero-pad, 사전순 = 시간순)
title        TEXT
done         INTEGER        -- 0/1
sort_order   INTEGER
created_at   TEXT
updated_at   TEXT
archived_at  TEXT NULL
```

### week_items
```
id             TEXT PK
week           TEXT           -- 'YYYY-Wnn' (ISO week, 주 시작 = 일요일)
title          TEXT
est_pomos      INTEGER        -- 예상 🍅
milestone_id   TEXT NULL FK -> milestones.id
days           TEXT           -- JSON [0..6] 요일 배치 의도. 빈 배열 = 미배치
carry_from_id  TEXT NULL FK -> week_items.id   -- 이월 사슬. 이월 횟수 = 사슬 길이로 파생
status         TEXT           -- 'active' | 'done' | 'dropped'
is_system      INTEGER        -- 0/1. 1 = 주차별 시스템 "기타" 항목 (아래 참조)
created_at     TEXT
updated_at     TEXT
deleted_at     TEXT NULL      -- soft delete
```

### tasks
```
id            TEXT PK
week_item_id  TEXT NOT NULL FK -> week_items.id
title         TEXT
est_pomos     INTEGER
done          INTEGER        -- 0/1
pulled_date   TEXT NULL      -- 'YYYY-MM-DD'. 오늘 목록 포함 여부 (별도 엔티티 아님)
created_at    TEXT
updated_at    TEXT
deleted_at    TEXT NULL
```

### sessions
```
id            TEXT PK
started_at    TEXT           -- 세션의 날짜 귀속 기준 컬럼
ended_at      TEXT
duration_sec  INTEGER        -- 실제 경과. ±조절/조기 완료 반영
kind          TEXT           -- 'focus' | 'short' | 'long'
task_id       TEXT NULL FK -> tasks.id   -- NULL = 미분류 집중
note          TEXT NULL      -- 사후 캡처 한 줄
```
불변 레코드로 취급 (updated_at 없음).

### week_settlements
```
week             TEXT PK        -- 'YYYY-Wnn'
settled_at       TEXT
budget           INTEGER        -- 그 주의 예산 스냅샷
focus_min        INTEGER        -- 그 주의 뽀모 베이스라인 스냅샷
short_break_min  INTEGER
```
**용도는 이력·스냅샷 전용.** 정산 필요 판정에는 쓰지 않는다.

## 파생값 규칙 (절대 저장하지 않음, 항상 쿼리로 계산)

설계 원칙: **집계는 아래→위 단방향 파생. 부모-자식 수치 불일치가 구조적으로 불가능해야 한다.**

| 값 | 계산 |
|---|---|
| task 소진 | `count(sessions where task_id = t.id and kind='focus')` |
| week item 소진 | 자식 task 소진 합 |
| milestone 소진 | 연결된 week_items 소진 합 (기간 필터) |
| 주간 총 소진 | 그 주 focus 세션 수 전체 (미분류 포함) |
| 미분류 🍅 | 그 주 focus 세션 중 `task_id IS NULL` |
| 이월 횟수 배지 "N주째" | `carry_from_id` 사슬 길이 |
| 주간 기본 예산 | `sum(weekly_capacity)` (주별 오버라이드 가능) |
| 캘린더 점 | `started_at` 날짜별 focus 세션 수 (>=1 점, >=4 진한 점) |
| 긴 휴식 차례 | 그날 focus 세션 수 mod 4 (저장 안 함) |
| 오늘 목록 | `tasks where pulled_date = today and deleted_at is null` |

## 확정된 설계 결정 (이 스키마의 전제)

1. **하루 경계 = 로컬 자정 (00:00).** OS 로컬 타임존 사용, 하드코딩 없음. 모든 `YYYY-MM-DD` / `YYYY-Wnn` 키는 로컬 시간으로 계산.
2. **세션 날짜 귀속 = `started_at` 기준.** 23:50 시작 → 00:15 종료 세션은 시작일에 귀속. 캘린더 점·스트릭·날짜 패널 전부 이 컬럼 하나로 파생.
3. **휴식 사이클**: 집중 완료 시 모드만 휴식으로 자동 전환(4회차마다 긴 휴식), 시작은 사용자가. 카운터는 파생값, 저장 안 함.
4. **"완료 처리" 버튼**: 남은 시간 무관하게 온전한 1🍅 로 기록. `duration_sec` 에 실제 경과 저장. 1🍅 = focus 세션 1회 완료(길이 무관).
5. **정산 필요 판정 = 워터마크 단독.** `현재 주 > last_settled_week + 1` 이면 정산 대기. `last_settled_week` 는 정산한 주가 아니라 **항상 그 시점의 (현재 주 − 1)** 을 기록. 첫 실행 초기값도 `현재 주 − 1`. `week_settlements` 는 판정에 미사용.
6. **정산 범위 = `last_settled_week + 1 … 현재 주 − 1` 구간의 미완료 항목 전체를 한 화면에 병합.** 몇 주를 비웠든 리뷰 화면은 항상 1개. "알림 큐" 금지.
7. **주차별 시스템 "기타" week_item (`is_system = 1`)**: 부모 없는 task(오늘 목록 직접 추가, 사후 캡처로 소급 생성된 task)를 여기에 붙여 `week_item_id` NOT NULL 을 유지한다. 규칙:
   - `est_pomos = 0` (예산 과적 경고·요일별 부하 계산에 미산입)
   - 플래너에서 편집·삭제 불가
   - 주간 리뷰의 이월 3택 대상에서 제외
   - 실제로 필요할 때만 생성 (lazy)
8. **주간 리뷰 확정 시** 이월/축소분은 새 주의 week_items 로 **생성**되며 `carry_from_id` 로 원본을 가리킨다 (`days` 는 빈 배열).
9. soft delete: `week_items` / `tasks` 는 `deleted_at`. 폐기("보내주기")는 `status='dropped'`.
