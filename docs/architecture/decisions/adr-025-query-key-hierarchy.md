# ADR-025: 쿼리 키 계층과 무효화 — 사건이 키를 지운다, 화면이 아니라

- 상태: accepted (2026-08-07)
- 관계: [ADR-002](adr-002-state-tanstack-query-ipc.md) §1 · [ADR-005](adr-005-timer-architecture.md) §4 ·
  [ADR-024](adr-024-query-client-defaults.md) §5 가 **이연해 둔 "쿼리 키 계층 설계"를 확정한다.**
  main 발 사건이 이 문서의 표에 도달하는 경로(이벤트 채널)는
  [ADR-026](adr-026-main-to-renderer-events.md) 이 정한다 — 두 문서는 같은 날 함께 확정됐다.
- 결정 근거: 기능 PRD 8종 전수 대조 + `@tanstack/query-core@5.101.4` 설치 소스 검증.
  적대 리뷰 2회(완성도·메커니즘)의 발견 18건이 반영돼 있다. 설계 원본:
  [2026-08-07 설계 문서](../../superpowers/specs/2026-08-07-query-keys-and-events-design.md).

## Context

renderer 는 main 을 서버처럼 취급하고(ADR-002) 모든 DB 파생 상태를 TanStack Query
캐시에 담는다. ADR-024 가 기본값을 확정하며 자인했듯 이 체계의 대가는 하나다 —
`refetchOnWindowFocus: false` 라서 **invalidate 를 빠뜨리면 화면이 낡은 채로 남는다.**
무효화가 유일한 갱신 경로이므로, "무슨 사건이 어떤 캐시를 지우는가"는 화면마다
즉흥적으로 정할 수 없고 한 번에 설계해야 한다.

이 앱의 무효화가 어려운 이유는 뽀모 세션 1건이 **서로 다른 달력 키 네 개**로
흩어지기 때문이다: 오늘 목록은 날짜 키(`local_date`), 주간 소진은 주 키(`local_week`,
ADR-012), 캘린더 점은 날짜의 달, 마일스톤 카드는 **주 키의 달**(milestones prd R18 —
8/31~9/6 주는 통째로 8월). 게다가 이월 승계(ADR-012 §3)로 항목의 주와 다른 달의
마일스톤에 소진이 올라가는 경로가 정상 존재한다.

여기에 더해, 사건의 발원이 renderer 만이 아니다. 세션 기록·트레이 테마 변경·자정
경계는 **main 이 혼자 일으킨다** — renderer 에 대응하는 mutation 이 없어 `onSuccess`
를 걸 자리가 없다. 그리고 리뷰에서 확인했듯 자정 롤오버는 무효화로 고칠 수 없는
별개의 실패 축이다: 화면이 `['today','어제']` 를 **구독한 채** 날이 바뀌면, 낡은 것은
캐시가 아니라 키 자체다. TanStack Query 는 키 변경을 관찰하지 않는다.

## Decision

### 1. 키 형태 규칙

```
[도메인, 달력키?, 하위이름?, 파라미터...]
```

1. **달력 키는 두 번째 칸 고정.** prefix 무효화(`partialMatchKey` — 배열 좌측부터
   원소별 비교)가 특정 날짜·주·달을 통째로 잡을 수 있는 유일한 배치다.
2. **키 속 달력 키의 출처는 두 가지뿐이다.** renderer 가 렌더 시점에 직접 계산한
   값은 금지한다.
   - 화면이 "지금" 기준 키가 필요하면 → `useClock()` (§2)
   - main 발 사건의 키 → **이벤트 payload 의 저장값 그대로** (재계산 금지 —
     기록 정책은 main 소유, ADR-026 §1)
3. **키에 객체와 `undefined` 금지.** 원시값만 쓴다. 객체는 부분 매칭 서프라이즈
   (빈 객체가 모든 객체와 매치)를 만들고 grep 을 막는다. `undefined` 는 직렬화에서
   `null` 로 붕괴하므로 옵셔널 파라미터는 칸 생략으로 표현한다.
4. **키 리터럴 금지** — `src/renderer/shared/query/keys.ts` 팩토리 함수로만 만든다.

정의 하나를 식으로 박는다: **그주의달 := monthKey(weekKey)**. 주의 귀속 달은 그 주
월요일의 달이다 (milestones prd R18). "오늘이 속한 달"로 구현하면 9/3(목)에 8/31 주를
편집할 때 틀린다.

### 2. 키 목록

| 층 | 키 | 읽는 것 |
|---|---|---|
| 전역 | `['system','appInfo']` | 앱·스키마 버전 (M1 기존) |
| 전역 | `['settings']` | 전역 뽀모 길이·가용량 |
| 전역 | `['timer']` | 타이머 스냅샷. push 리스너만 쓴다 — `staleTime: Infinity` |
| 전역 | `['clock']` | **현재 dayKey·weekKey·monthKey.** 최초 1회 main 에서 pull, 이후 `clock:boundary` 이벤트로 갱신. 달력 키가 필요한 모든 화면의 "오늘" 출처 (`useClock()`) |
| 전역 | `['review','pending']` | 정산 필요 판정 — 워터마크부터 계획 대상 주까지의 구간 파생 (weekly-review prd R1). 여러 주에 걸친 파생 조회라 `['settings']` 에 얹지 않는다 |
| 날짜 | `['today', dayKey]` | 오늘 목록 (today-tasks prd R1) |
| 날짜 | `['day', dayKey]` | 캘린더 날짜 패널 (calendar-records prd R17) — 술어가 오늘 목록과 다르므로(`pull ∪ 세션` 합집합) 분리한다 |
| 주 | `['week', weekKey, 'items']` | 주간 항목·소진 |
| 주 | `['week', weekKey, 'baseline' \| 'budget']` | 유효 베이스라인·예산 계약 (pomo-baseline prd R10·R11). 박제 후 불변 |
| 주 | `['week', weekKey, 'review']` | 그 주의 정산 요약 |
| 월 | `['month', monthKey, 'milestones' \| 'calendar']` | 마일스톤 카드 / 월 그리드 |

`['clock']` 을 React context 가 아니라 Query 캐시에 두는 이유: renderer 의 상태 도구는
TanStack Query 하나다(ADR-005 §5). 시계를 context 로 빼면 상태 보관소가 두 종류가
되고, "이 값은 캐시에? context 에?" 라는 분기점이 모든 후속 작업에 생긴다.

이 목록은 **기능 문서에서 확실히 읽히는 키의 전부**다. 각 쿼리의 인자·반환 모양은
그 기능을 구현하는 태스크가 정한다. 새 키를 만드는 사람은 §1 규칙을 따르고 §3 표에
줄을 추가한다.

### 3. 사건 → 무효화 표

소유자는 `src/renderer/shared/query/invalidate.ts` **한 곳**(초크포인트)이다. 입력은
renderer mutation 의 `onSuccess` 와 main 발 push 이벤트(ADR-026) **전부**이며, 화면
코드는 이 모듈 밖에서 캐시를 만지지 못한다(§5). ADR-009 §3 의 시간 초크포인트,
ADR-015 의 DB 격리와 같은 패턴이다 — 규약을 규율이 아니라 구조로 유지한다.

| # | 사건 (발원) | 지우는 키 |
|---|---|---|
| 1 | **세션 기록됨** (main push `session:recorded`, payload `{localDate, localWeek}`) | `['today', localDate]` — 단 `localDate ≠ 현재 dayKey` 면 `['today']` 전체(자정 걸친 세션 + 재-pull 엣지) · `['day', localDate]` · `['week', localWeek, 'items']` · `['month', monthKey(localDate), 'calendar']` · `['month', *, 'milestones']` |
| 2 | **사후 캡처 기록** (renderer mutation — timer prd R8. 키는 **세션 저장값** 기준, 오늘 기준이 아니다) | `['week', 세션 localWeek, 'items']` · `['day', 세션 localDate]` · `['month', *, 'milestones']` |
| 3 | **pull / 목록에서 치움** | `['today', 오늘]` · `['day', 오늘]` · `['week', 항목의 주, 'items']` · `['month', 이번달, 'calendar']` — pull 행이 캘린더 "기록 있음" 술어에 들어간다 (calendar-records prd R5) |
| 4 | **오늘 목록 직접 입력** (task+기타 항목+pull 생성 — today-tasks prd R9) | 사건 3 과 동일하되 `['week', 기타 항목의 주, 'items']` — 기타 항목이 생기면 주간 카드의 기타 행 표시 조건이 바뀐다 (week-plan prd R17) |
| 5 | **할 일 완료 토글** | `['today', 오늘]` · `['day']` 전체 — 완료는 현재의 사실이라 과거 날짜 패널에 소급된다 (calendar-records prd R19) · `['week', 부모 항목의 주, 'items']` — 오늘의 주가 아니다, 지난 주 항목의 pull 이 정상 경로다 (today-tasks prd R5) · `['month', *, 'milestones']` |
| 6 | **주간 항목 편집·완료·해제·폐기·예산 확정** | `['week', 그주]` prefix (스냅샷 포함 — 예산 확정이 `weeks` 행을 쓴다) · `['month', *, 'milestones']` — est 합이 롤업 분모다 (milestones prd R17) |
| 7 | **정산 확정** — 지울 키는 renderer 가 계산하지 않고 **확정 응답 payload**(바뀐 주 키 목록 + 그 달 집합)에서 받는다. 정산 범위는 주 하나가 아니라 구간이다 (weekly-review prd R3) | payload 의 각 `['week', *]` prefix · 각 `['month', *]` prefix · `['today', 오늘]` — 재부모화가 출처 라벨을 바꾼다 · `['review','pending']` — 배너 즉시 소멸 (weekly-review prd R23) |
| 8 | **마일스톤 편집·완료·보관·복사** | `['month', 그달, 'milestones']` |
| 9 | **마일스톤 삭제** — `ON DELETE SET NULL` 로 연결이 끊긴 주간 항목들의 주를 renderer 가 특정할 수 없다 (이월 승계로 달 밖에도 있다) | `['month', 그달, 'milestones']` · `['week']` 전체 |
| 10 | **주간 항목↔마일스톤 연결 변경** | `['week', 항목의 주, 'items']` · `['month', *, 'milestones']` |
| 11 | **설정 변경** (renderer mutation **또는** main push `settings:changed` — 트레이 테마는 main 이 직접 쓴다, app-shell prd R42) | `['settings']` · `['week']` 전체 — 스냅샷 없는 주의 폴백이 전역값이라 (pomo-baseline prd R10) 어느 주가 그런 주인지 renderer 는 모른다 · `['review','pending']` |
| 12 | **경계 전이** (main push `clock:boundary`, payload = 전이 후 키 3종) | `['clock']` 에 setQueryData · `['today']` 전체 · `['review','pending']` · 주 경계면 `['week']` 전체 추가, 달 경계면 `['month']` 전체 추가 |

마일스톤 카드(`['month', *, 'milestones']`)를 사건 1·2·5·6·10 에서 **달을 가리지 않고**
지우는 이유: 이월 승계(ADR-012 §3, milestones prd R15)로 9월 주의 세션이 8월
마일스톤의 롤업을 올리는 경로가 정상 존재한다. 달을 특정하면 이 경로에서 카드가
낡고, 카드는 화면에 최대 1장이라 광역의 비용이 0이다.

**광역(`*` 또는 도메인 전체) 허용 조건** — 다음 둘 중 하나일 때만:

- ⓐ 영향 집합을 renderer 가 특정할 수 없다 (마일스톤 삭제·설정 폴백·타월 연결)
- ⓑ 활성 구독이 구조적으로 1개뿐이라 비용이 0 (마일스톤 카드·날짜 패널)

이 조건에 해당하지 않는 사건에서 "귀찮으면 광역"은 금지다 — 자주 일어나는 사건
(세션 기록, 완료 토글)은 좁은 키를 유지한다. 불변 하위(`baseline`·`budget`)까지
매 뽀모마다 재조회하는 낭비를 막기 위해 사건 1·5 는 `'items'` 로 좁혀져 있다.

### 4. staleTime 과 폭발 반경

- `['timer']`·`['clock']` 만 `staleTime: Infinity` — push 가 유일한 쓰기 경로다
  (ADR-005 §4, ADR-026 §4). **`staleTime: 'static'` 은 금지한다** — v5 소스에서
  `refetchQueries` 가 static 쿼리를 필터로 제외하므로 invalidate 로도 복구할 수 없다.
- 나머지는 전부 0. 로컬 SQLite 재조회는 사실상 공짜이고(ADR-024), stale 캐시가
  무효화 누락을 가려주는 상태를 만들지 않는다.
- **폭발 반경**: invalidate 의 기본 refetchType 은 `'active'` — 떠 있는 쿼리만 즉시
  재조회하고, 안 떠 있는 쿼리는 staleTime 0 덕에 다음 마운트에서 자동 재조회된다.
  즉 §3 표의 누락이 만드는 버그는 **"두 화면이 동시에 떠 있을 때"로 한정**된다.
  표의 완전성 부담이 이만큼으로 정직해진다.
- `QueryClient` 에 **`refetchOnReconnect: false` 를 추가**한다 (ADR-024 실행분 보강 —
  포커스와 마찬가지로, 네트워크 재연결은 로컬 앱의 갱신 신호가 아니다).
- **편집 폼은 마운트 시 스냅샷을 로컬 state 로 복사해서 쓴다.** 쿼리 data 를
  controlled 입력값으로 직접 쓰면 main 발 invalidate 가 입력 중 폼을 리셋한다.
- 재조회가 목록을 튀게 하지 않을까는 기우로 확인됐다 — v5 는 refetch 중 기존
  데이터를 유지하고, structural sharing 이 내용 동일 응답의 참조를 보존해 리렌더
  자체가 없다. 데이터가 실제로 바뀐 경우에만 화면이 바뀌고, 그때는 바뀌어야 맞다.

### 5. ESLint 강제

import 차단은 무력하다 — 화면은 `useQueryClient()` **훅으로 런타임에** queryClient 를
얻으므로 import 그래프에 나타나지 않는다. 실효 수단은 `no-restricted-syntax` 의
메서드명 셀렉터다.

- 금지 목록: `invalidateQueries` `refetchQueries` `resetQueries` `removeQueries`
  `setQueryData` `setQueriesData` `clear` `cancelQueries`. **`setQueryData` 를 빼면
  초크포인트가 통째로 샌다** — 캐시 직접 쓰기가 열려 있으면 사건→키 매핑이 무의미하다.
- 예외 파일: 초크포인트(`invalidate.ts`)와 ADR-026 의 이벤트 리스너 파일.
- flat config 에서 같은 규칙명은 뒤 블록이 앞 블록을 통째로 덮으므로(기존
  eslint.config.js 의 자체 경고), renderer 블록을 **겹치지 않는 2개**(일반 renderer /
  예외 파일)로 재편하고 각 블록에 전체 셀렉터를 다시 준다.
- 구조분해(`const { invalidateQueries } = qc`)·계산 접근(`qc['invalidateQueries']`)
  우회를 잡는 셀렉터를 병행한다. `useQuery().refetch()` 는 자기 자신 재조회라 마운트
  refetch 와 등가 — 허용한다.
- 잔여 구멍(eslint-disable 주석, 동적 문자열)은 1인 저장소에서 수용한다.

## Consequences

- (+) "세션이 끝났는데 숫자가 안 오르는" 화면과 "무관한 사건에 전부 재조회되는"
  화면 사이의 즉흥 판단이 사라진다. 새 화면은 키 팩토리와 §3 표에 줄을 추가하는
  것으로 합류한다.
- (+) 무효화 누락의 피해가 "동시에 떠 있는 두 화면"으로 구조적으로 한정된다 (§4).
- (+) 달력 키 직접 계산 금지(§1-2)로 자정 롤오버 실패 축이 닫힌다 — 키의 출처가
  `['clock']` 하나라서, 날이 바뀌면 구독이 함께 바뀐다.
- (−) 화면 하나 만드는 데 파일 세 곳(키 팩토리, 초크포인트 표, 화면)을 오간다.
  그 대가로 무효화 수사 범위가 `invalidate.ts` 한 곳으로 좁혀진다.
- (−) `['week']`·`['month']` 광역 사건(삭제·설정 변경·경계)은 "무엇이 무엇을
  바꾸는가"의 정밀 지도를 남기지 않는다. §3 의 허용 조건 ⓐⓑ 가 남용을 막는 선이다.
- (−) ESLint 강제는 renderer 블록 재편이라는 일회성 비용이 있고, 이후 예외 파일이
  늘 때마다 블록 경계를 손봐야 한다.
- 이 문서는 키의 **이름과 사건 매핑**만 확정한다. 각 쿼리의 인자·반환 zod 계약,
  IPC 채널 추가는 기능 태스크의 몫이다 (M1 계획의 "채널 추가 4곳 규칙" 유지).
