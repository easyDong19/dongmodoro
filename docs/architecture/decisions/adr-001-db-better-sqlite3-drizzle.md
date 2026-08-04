# ADR-001: 로컬 DB — better-sqlite3 + Drizzle ORM

- 상태: accepted (2026-08-03)

## Context

로컬 단독 동작(네트워크 없음)이 요구사항이고, 집계값을 저장하지 않고 항상 쿼리로
파생하는 원칙(PRD 원칙 8) 때문에 집계 쿼리를 많이 쓰게 된다. 사용자 기기에 이미
설치된 DB 를 깨지 않는 프로덕션 마이그레이션 전략도 초기부터 필요하다 (PRD §5).
"상용 앱처럼 실전성 있게"가 학습 목표라서, 장난감용 우회책보다 업계 표준 구성을
겪는 것 자체가 가치다.

검토한 선택지:

| 선택지 | 판정 | 이유 |
|---|---|---|
| better-sqlite3 + Drizzle | ✅ 채택 | 아래 Decision |
| Prisma | ❌ | 플랫폼별 쿼리 엔진 바이너리(Rust)를 앱에 동봉해야 해서 Electron 패키징이 복잡 (PRD §5 에서도 배제) |
| sql.js (wasm) | ❌ | 네이티브 리빌드는 없지만 DB 전체를 메모리에 올리고 파일 flush 를 직접 관리 — 상용 패턴이 아님 |
| JSON 파일 저장 | ❌ | 이 규모에선 동작하나 "집계는 쿼리로 파생" 원칙과 맞지 않고 배우는 것이 없음 |
| node:sqlite (Node 내장) | ❌ | Electron 버전 종속, Drizzle 지원·생태계가 아직 부족 |

## Decision

**better-sqlite3 를 드라이버로, Drizzle ORM + drizzle-kit 을 스키마·쿼리·마이그레이션
계층으로 사용한다.**

- better-sqlite3 는 Electron 로컬 DB 의 사실상 표준. 동기 API 는 로컬 SQLite 에서
  오히려 장점 (콜백/프로미스 오버헤드 없음).
- Drizzle 은 순수 TS 라이브러리로 추가 바이너리가 없고, 스키마가 TypeScript 코드라
  타입이 스키마에서 자동 파생된다. 집계 쿼리가 SQL 과 1:1 로 대응해 컴파일 타임에
  컬럼·타입 오류를 잡는다.
- drizzle-kit 이 생성하는 마이그레이션은 순수 SQL 파일 — 앱 시작 시
  `migrate()` 로 미적용분만 순서 적용하는 패턴이 깔끔하다.

## Consequences

- (+) 상용 Electron 앱과 동일한 데이터 계층 경험 (네이티브 모듈 × 패키징, 마이그레이션).
- (+) 파생 집계 쿼리 전부 타입 안전.
- (−) 네이티브 모듈이므로 Electron ABI 에 맞는 리빌드가 필요 — electron-builder 가
  설치 시 자동 처리하지만, `asarUnpack` 등 패키징 설정을 이해해야 한다.
- (−) 네이티브 모듈은 main process 전용 → renderer 는 IPC 로만 DB 접근
  (이 제약이 [ADR-002](adr-002-state-tanstack-query-ipc.md) 의 전제가 된다).
- pnpm 사용 시 `onlyBuiltDependencies` 에 better-sqlite3 지정 필요
  ([ADR-004](adr-004-packaging-deploy.md) 참조).
