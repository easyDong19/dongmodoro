# ADR-032: 파괴적 마이그레이션의 FK 안전 절차 — 트랜잭션 바깥 토글과 사후 무결성 검사

- 상태: accepted (2026-08-13)
- 관계: [ADR-020](adr-020-db-safeguards.md) §4 의 시작 실패 3갈래를 **보강**한다 —
  마이그레이션 성공 후 **무결성 회귀**를 검사하는 네 번째 관문을 추가한다.
  §1~§3·§5·§6(백업 방식·보존 개수·자동 복원 금지·스키마 버전 판정)은 그대로 유효하다.
  [ADR-019](adr-019-constraint-implementation.md) §6(`sessions.local_week` FK)·§9
  (`foreign_keys = ON` 기본값)의 결정을 유지하되, 그 FK 를 **제거하는 절차**를 정한다.
- 결정 근거: 2026-08-13 계획 감사에서 실제로 마이그레이션을 생성해 1.1.0 형태 DB 에
  적용한 재현 실험

## Context

ADR-030 이 결정한 스키마 변경(`weeks` 테이블 drop · `est_pomos` 컬럼 2개 drop)을
`drizzle-kit generate` 로 생성해 **데이터가 든 1.1.0 DB 에 실제로 적용해 봤다.**
결과는 `FOREIGN KEY constraint failed` 였고, **같은 마이그레이션이 빈 DB 에서는
성공했다.**

이 비대칭이 이 결정의 이유다. 현행 `migrate.test.ts` 의 모든 케이스가 빈 DB 에서
돌기 때문에, **CI 는 초록이고 사용자 기기에서만 앱이 켜지지 않는다.**

원인은 세 겹이다.

1. **`sessions.local_week` 가 `weeks.week` 를 FK 로 참조한다** (ADR-019 §6). FK 가 켜진
   상태의 `DROP TABLE weeks` 는 암묵적 `DELETE FROM` 을 수행하므로, 세션이 한 행이라도
   있으면 참조 위반으로 죽는다. 생성된 SQL 은 이 DROP 을 재생성 블록보다 **앞에** 놓는다.
2. **생성물이 넣는 `PRAGMA foreign_keys=OFF` 는 무효다.** drizzle 의 sqlite 마이그레이터는
   전체 문장을 `BEGIN`…`COMMIT` 으로 감싸는데, SQLite 에서 이 pragma 는 **트랜잭션
   안에서 no-op** 이다. 실측으로 `BEGIN; PRAGMA foreign_keys=OFF;` 후에도 값이 `1` 이었다.
   `open.ts` 가 시작 시 `foreign_keys = ON` 을 명시적으로 걸어 두므로 기본값에 기댈 수도 없다.
3. **`est_pomos` 두 컬럼은 `ALTER TABLE … DROP COLUMN` 이 불가능하다.** 둘 다 CHECK
   제약에 이름이 박혀 있어 SQLite 가 거부한다(`no such column: est_pomos`). drizzle 은
   그래서 테이블 재생성을 택하는데, 재생성의 `DROP TABLE tasks`·`DROP TABLE week_items`
   가 각각 자식 행(`sessions.task_id` 등) 때문에 다시 같은 위반을 낸다.

`PRAGMA defer_foreign_keys=ON` 도 시험했고 실패했다. 트랜잭션 안에서 유효한 pragma 이긴
하나, `DROP TABLE` 이 올린 지연 위반 카운터를 뒤이은 `RENAME TO` 가 내리지 않아
`COMMIT` 에서 터진다.

## Decision

### §1. FK 토글은 트랜잭션 **바깥**에서, 마이그레이션 코드가 한다

SQLite 공식 12단계 ALTER TABLE 절차를 따른다 — 즉 SQL 파일이 아니라 `migrateDb()` 가
`migrate()` 호출을 감싼다.

```
pragma('foreign_keys = OFF')     // BEGIN 바깥
try   { migrate(...) }
finally { pragma('foreign_keys = ON') }
```

`finally` 로 복원하는 이유는 마이그레이션이 실패해도 세션 나머지가 FK 없이 도는 상태를
남기지 않기 위해서다. 실패 자체는 기존대로 `MigrationError` 로 나간다 (ADR-020 §4).

### §2. 사후 `foreign_key_check` 가 네 번째 관문이다

FK 를 끄고 도는 구간이 생긴 이상, **그 구간이 고아 행을 남기지 않았음을 증명해야 한다.**
마이그레이션 성공 직후·`user_version` 을 올리기 전에 `PRAGMA foreign_key_check` 를 돌리고,
결과가 비어 있지 않으면 `MigrationError` 를 던진다.

이 검사가 ADR-020 §4 표에 네 번째 행을 더한다:

| 상황 | 예외 | 처리 |
|---|---|---|
| 무결성 회귀 (마이그레이션이 고아 행을 남김) | `MigrationError` | 백업을 자동 복원하지 않는다. 백업 경로를 안내한 뒤 종료 |

`user_version` 을 올리기 **전에** 두는 것이 핵심이다 — 검사에 걸린 DB 는 다음 실행에서
같은 마이그레이션을 다시 시도하며, 버전이 올라간 채 고아 행을 안고 사는 상태가 되지 않는다.
(마이그레이션 자체는 이미 커밋된 뒤이므로 이 검사는 되돌리지 못한다. 그것이 §4 의 이유다.)

### §3. 생성물을 그대로 커밋하지 않는다

`drizzle-kit generate` 의 산출물은 **초안**이다. 파괴적 변경에서는 다음을 손으로 고친 뒤
커밋한다.

- 무효한 `PRAGMA foreign_keys` 문장을 제거한다 (§1 이 대신한다).
- 부모 테이블 `DROP` 을 자식 테이블 재생성 **뒤로** 옮긴다.
- `settings` 의 행 삭제(`DELETE FROM settings WHERE key = ...`)를 손으로 덧붙인다 —
  drizzle-kit 은 **데이터 조작을 절대 생성하지 않는다.**

`drizzle/` 디렉토리에 생성물 외의 파일을 두지 않는다는 기존 제약(ADR-020 §6 — 스키마
버전이 `.sql` 개수다)이 여기서 특히 중요하다. 손질 과정에서 백업 사본을 그 폴더에 두면
버전이 어긋나 전 사용자의 판정이 틀어진다.

### §4. 파괴적 마이그레이션은 데이터가 든 DB 로 테스트한다

**빈 DB 테스트는 이 결함군을 구조적으로 잡지 못한다.** 파괴적 변경(테이블 drop, 컬럼
drop, FK 제거)을 담은 마이그레이션마다 이전 세대 스키마에 **행을 채운 픽스처**로 적용
테스트를 둔다. 최소 조건은 FK 참조가 실제로 걸리는 행이 존재하는 것이다 — 세션이 든
DB 여야 §1 의 문제가 재현된다.

## Consequences

- (+) CI 가 잡을 수 없던 실패 모드가 잡힌다. 감사 전까지 이 마이그레이션은 초록으로
  통과한 채 릴리스될 수 있었다.
- (+) `foreign_key_check` 가 상시 관문이 되므로, 앞으로의 어떤 마이그레이션이 무결성을
  깨도 사용자 기기가 아니라 테스트에서 먼저 걸린다.
- (−) FK 를 끄고 도는 구간이 생긴다. 그 구간의 안전은 SQL 의 정확성과 §2 의 사후
  검사에 의존하며, SQLite 가 대신 막아주지 않는다.
- (−) 마이그레이션 저작 비용이 는다 — 생성물을 읽고 손보는 단계가 필수가 된다.
  자동 생성에 기대던 흐름이 파괴적 변경에서만 깨진다.
- **되돌릴 수 없음은 여전하다.** §2 의 검사는 실패를 *알려줄* 뿐 되돌리지 못한다
  (마이그레이션은 이미 커밋됐다). ADR-020 §4 의 "자동 복원하지 않는다"가 유지되므로,
  실질 복귀선은 **백업 파일 + 이전 버전 앱** 조합 하나뿐이다. 백업만 되돌리고 새 앱을
  다시 켜면 같은 마이그레이션이 또 돈다 — 이 사실이 릴리스 노트에 도달해야 한다.
