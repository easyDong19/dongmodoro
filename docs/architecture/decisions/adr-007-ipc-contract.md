# ADR-007: IPC 계약 — 도메인 명령형 API + zod 런타임 검증

- 상태: accepted (2026-08-03) · **예시 갱신 필요 표기 (2026-08-04)** — 본문의 리뷰 확정
  트랜잭션 예시가 폐지된 스키마를 참조한다: `week_settlements` 는 [ADR-011](adr-011-schema-final.md) §1
  에서 `weeks` 로 흡수됐고, `status` enum 은 §5 에서 `completed_at`/`dropped_at` 으로 교체됐다.
  계약의 형태(도메인 명령형 + zod + 유스케이스 = 트랜잭션 1개)에 대한 결정 자체는 유효하다.
  최신 트랜잭션 정의는 `docs/features/weekly-review/technical-spec.md` 를 따른다.

## Context

renderer 는 IPC 로만 데이터에 접근한다 ([ADR-001](adr-001-db-better-sqlite3-drizzle.md)).
그 API 를 어떤 모양으로 노출할지가 이 앱 아키텍처의 확장 지점(seam)을 결정한다.

| 선택지 | 형태 | 판정 |
|---|---|---|
| 도메인 명령형 | `api.tasks.pullToToday(ids)`, `api.review.settle(decisions)` — 유스케이스 단위 함수 | ✅ 채택 |
| 범용 통로 | `api.db.query(sql)` 또는 Drizzle 쿼리 직렬화 터널 | ❌ 기각 |

## Decision

1. **유스케이스 단위의 도메인 명령형 API 만 노출한다.** renderer 는 SQL 도 스키마도
   모른다. 각 핸들러가 main 에서 트랜잭션·검증을 책임진다.
2. **IPC 경계에서 zod 로 런타임 검증한다.** IPC 는 직렬화 경계이므로 TS 타입은
   경계를 넘는 순간 주석에 불과하다. **zod 스키마가 계약의 단일 정의**이고
   TS 타입은 `z.infer` 로 파생한다. 채널 정의와 스키마는 `src/shared/` 에 모은다
   ([ADR-008](adr-008-code-structure.md)).
3. preload 는 `contextBridge` 로 화이트리스트된 API 만 노출한다. raw `ipcRenderer`
   노출 금지, `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`.

### 범용 통로를 기각한 이유

- renderer 가 스키마를 알고 임의 SQL 을 쏠 수 있으면 `contextIsolation` 으로 격리한
  보안·설계 의미가 사라진다.
- "renderer 는 데이터가 SQLite 에서 오는지 모른다"는 확장성(→ 서버 백엔드 추가)
  논거가 성립하지 않는다. SQL 이 renderer 에 박히면 그게 곧 결합이다.
- **트랜잭션 경계는 유스케이스 단위다.** 예: 리뷰 확정은 "이월 week_items 생성 +
  status 갱신 + week_settlements 기록 + last_settled_week 갱신"이 하나의 원자적
  작업이다. renderer 가 쿼리 4번을 쏘는 구조면 중간 실패 시 반쯤 정산된 상태가 남는다.

## Consequences

- (+) IPC API 가 사실상 리포지토리 인터페이스 역할을 해, 나중에 원격 백엔드가
  생겨도 renderer/Query 계층은 바뀌지 않는다.
- (+) 잘못된 입력이 DB 에 닿기 전에 경계에서 걸러진다.
- (−) 핸들러마다 채널·스키마 보일러플레이트가 생긴다. `src/shared/` 의 계약
  정의에서 preload 로 기계적 매핑해 관리 비용을 낮춘다.
- 이 "타입 안전한 IPC 계약 설계"가 프로젝트의 핵심 학습 대상이다.
