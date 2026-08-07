# 설계: 쿼리 키 계층·무효화 + main→renderer 이벤트 채널

- 날짜: 2026-08-07
- 산출물: ADR-025 (쿼리 키 계층과 무효화), ADR-026 (main→renderer 이벤트 채널)
- 지위: 이 문서는 두 ADR 의 승인된 설계 원본이다. ADR 작성 후에는 ADR 이 확정 기준이 된다.
- 검증: 리뷰 에이전트 2회 통과 — ① 기능 PRD 8종 대조 완성도 리뷰, ② TanStack Query v5.101 소스 대조 메커니즘 리뷰. 리뷰가 찾은 문제 18건이 본문에 반영돼 있다.

## 결정 요약 (사용자 승인)

1. ADR 확정 범위 = **규칙 + 키 이름 목록**. 쿼리별 인자·반환 모양은 각 기능 태스크가 정한다.
2. 무효화 굵기 = **달력 키 단위 prefix**.
3. 타이머 push = **스냅샷 push + 양쪽 zod parse** (ADR-005 유지·실행분 구체화).
4. 무효화 호출 = **초크포인트 모듈 단일화** (`invalidate.ts`), ESLint 로 강제.
5. "지금 날짜"의 소유 = **Query 캐시 `['clock']`** (context 이원화 기각 — 상태 도구는 Query 하나, ADR-005 원칙 유지).
6. 마일스톤 삭제 = **`['week']` 광역 무효화** (드문 사건, 정밀 코드는 유지비만 남는다).
7. 자정 이벤트 = **정각 알람 1개 + powerMonitor resume 보정** (매분 tick 기각 — "전이 시점에만 push" 원칙 유지).

---

## ADR-025: 쿼리 키 계층과 무효화

### 키 형태 규칙

```
[도메인, 달력키?, 하위이름?, 파라미터...]
```

1. **달력 키는 두 번째 칸 고정.** prefix 무효화가 배열 앞에서부터 잡기 때문.
2. **키 속 달력 키의 출처는 두 가지뿐.** renderer 가 직접 계산한 값은 금지.
   - 화면이 "지금" 기준 키가 필요하면 → `useClock()` (`['clock']` 캐시)
   - main 발 사건의 키 → **이벤트 payload 의 저장값 그대로** (재계산 금지)
3. **키에 객체·`undefined` 금지.** 원시값만. 옵셔널 파라미터는 칸 생략으로 (undefined 는 직렬화에서 null 로 붕괴).
4. 키 리터럴 금지 — `src/renderer/shared/query/keys.ts` 팩토리로만 생성.

정의: **그주의달 := monthKey(weekKey)** — 주의 귀속 달은 그 주 월요일의 달 (milestones R18. 8/31~9/6 주 = 8월).

### 키 목록

| 층 | 키 | 읽는 것 |
|---|---|---|
| 전역 | `['system','appInfo']` | 앱·스키마 버전 (기존) |
| 전역 | `['settings']` | 전역 뽀모 길이·가용량 |
| 전역 | `['timer']` | 타이머 스냅샷 — push 리스너만 쓴다, `staleTime: Infinity` |
| 전역 | `['clock']` | 현재 dayKey·weekKey·monthKey. 최초 1회 main 에서 pull, 이후 `clock:boundary` 로 갱신. 모든 화면의 "오늘" 출처 |
| 전역 | `['review','pending']` | 정산 필요 판정 — 워터마크부터 계획 대상 주까지의 구간 파생 |
| 날짜 | `['today', dayKey]` | 오늘 목록 |
| 날짜 | `['day', dayKey]` | 캘린더 날짜 패널 |
| 주 | `['week', weekKey, 'items']` | 주간 항목·소진 |
| 주 | `['week', weekKey, 'baseline' \| 'budget']` | 유효 베이스라인·예산 계약 (박제 후 불변, pomo-baseline R10·R11) |
| 주 | `['week', weekKey, 'review']` | 그 주의 정산 요약 |
| 월 | `['month', monthKey, 'milestones' \| 'calendar']` | 마일스톤 카드 / 월 그리드 |

### 사건 → 무효화 표

소유자: `src/renderer/shared/query/invalidate.ts` (초크포인트). 입력은 **renderer mutation 의 onSuccess + main 발 push 이벤트 전부**.

| # | 사건 (발원) | 지우는 키 |
|---|---|---|
| 1 | **세션 기록됨** (main push `session:recorded`, payload: `localDate`·`localWeek`) | `['today', localDate]` — 단 `localDate ≠ 현재 dayKey` 면 `['today']` 전체 · `['day', localDate]` · `['week', localWeek, 'items']` · `['month', monthKey(localDate), 'calendar']` · `['month', *, 'milestones']` 광역 |
| 2 | **사후 캡처 기록** (renderer mutation, 키는 세션 저장값 — timer R8) | `['week', 세션 localWeek, 'items']` · `['day', 세션 localDate]` · `['month', *, 'milestones']` |
| 3 | **pull / 목록에서 치움** | `['today', 오늘]` · `['day', 오늘]` · `['week', 항목의 주, 'items']` · `['month', 이번달, 'calendar']` (pull 행이 캘린더 "기록 있음" 술어에 들어간다 — calendar R5) |
| 4 | **직접 입력** (task+기타 항목+pull 생성 — today-tasks R9) | 사건 3 과 동일, 단 `['week', 기타 항목의 주, 'items']` |
| 5 | **할 일 완료 토글** | `['today', 오늘]` · `['day']` 전체 (과거 소급 — calendar R19) · `['week', 부모 항목의 주, 'items']` · `['month', *, 'milestones']` |
| 6 | **주간 항목 편집·완료·해제·폐기·예산 확정** | `['week', 그주]` prefix (스냅샷 포함) · `['month', *, 'milestones']` |
| 7 | **정산 확정** (키는 **응답 payload**: 바뀐 주 키 목록 + 달 집합 — renderer 재계산 금지) | payload 의 각 `['week', *]` prefix · 각 `['month', *]` prefix · `['today', 오늘]` · `['review','pending']` |
| 8 | **마일스톤 편집·완료·보관·복사** | `['month', 그달, 'milestones']` |
| 9 | **마일스톤 삭제** (ON DELETE SET NULL 로 주간 항목 연결이 끊긴다) | `['month', 그달, 'milestones']` · `['week']` 전체 |
| 10 | **주간 항목↔마일스톤 연결 변경** | `['week', 항목의 주, 'items']` · `['month', *, 'milestones']` |
| 11 | **설정 변경** (renderer mutation 또는 main push `settings:changed` — 트레이 테마, app-shell R42) | `['settings']` · `['week']` 전체 (스냅샷 없는 주의 폴백이 전역값 — pomo-baseline R10) · `['review','pending']` |
| 12 | **경계 전이** (main push `clock:boundary`, payload: 새 키 3종) | `['clock']` 에 setQueryData · `['today']` 전체 · `['review','pending']` · 주 경계면 추가로 `['week']` 전체, 달 경계면 `['month']` 전체 |

**광역(`*` 또는 도메인 전체) 허용 조건** — 다음 둘 중 하나일 때만:
- ⓐ 영향 집합을 renderer 가 특정할 수 없다 (마일스톤 삭제·설정 폴백·이월 승계된 타월 연결)
- ⓑ 활성 구독이 구조적으로 1개뿐이라 비용이 0 (마일스톤 카드·날짜 패널)

마일스톤 카드를 광역으로 지우는 이유: 이월 승계(ADR-012 §3, milestones R15)로 항목의 주와 다른 달의 마일스톤에 소진이 올라가는 경로가 정상 존재한다. 달을 특정하면 이 경로에서 카드가 낡는다.

### 동작 전제와 강제

- **staleTime**: `['timer']`·`['clock']` 만 `Infinity`(push 가 유일한 쓰기), 나머지 0. `staleTime: 'static'` 금지 — refetchQueries 필터에서 제외돼 invalidate 로 복구 불가.
- **폭발 반경**: 무효화는 떠 있는 쿼리만 즉시 재조회하고(기본 refetchType 'active'), staleTime 0 이 안 떠 있는 화면을 다음 마운트에서 자동으로 덮는다. 표 누락이 만드는 버그는 "두 화면이 동시에 떠 있을 때"로 한정된다.
- **QueryClient 에 `refetchOnReconnect: false` 추가** (ADR-024 실행분 보강 — 포커스와 마찬가지로 재연결도 로컬 앱의 갱신 신호가 아니다).
- **편집 폼은 마운트 시 스냅샷을 로컬 state 로** — 쿼리 data 를 controlled 입력값으로 직접 쓰지 않는다 (main 발 invalidate 가 입력 중 리셋을 만든다).
- **ESLint 강제**: import 차단은 무력하다 (`useQueryClient()` 훅은 import 그래프에 안 나타난다). `no-restricted-syntax` 메서드명 셀렉터로 `invalidateQueries, refetchQueries, resetQueries, removeQueries, setQueryData, setQueriesData, clear, cancelQueries` 를 renderer 전역 금지. 예외 파일: 초크포인트·타이머 리스너·clock 리스너. 기존 flat config 의 renderer 블록은 겹치지 않는 2개로 재편 (같은 규칙명은 뒤 블록이 앞을 통째로 덮는다). 구조분해·계산 접근 우회 셀렉터 병행. `useQuery().refetch()` 는 자기 재조회라 허용.

## ADR-026: main → renderer 이벤트 채널

### 이벤트 목록 (v1 전체, 4종)

| 채널 | payload | 역할 |
|---|---|---|
| `timer:transition` | 타이머 스냅샷 `{phase, startedAt, durationSec, taskId}` | ADR-005 의 전이 push. `['timer']` 캐시 갱신 전용 — 무효화를 일으키지 않는다 |
| `session:recorded` | `{localDate, localWeek}` (저장값) | 세션 INSERT **커밋 후** 발송. 무효화 표 사건 1의 입력. timer:done 과 분리하는 이유: 기록 여부·귀속은 main 의 정책(짧은 세션 폐기 등)이고 renderer 가 추론하면 정책이 두 곳에 산다 |
| `settings:changed` | 바뀐 설정 스냅샷 | main 이 직접 settings 를 쓰는 경로(트레이 테마) 전용. 사건 11의 입력 |
| `clock:boundary` | `{dayKey, weekKey, monthKey}` (전이 후 값) | 자정 정각 알람 + `powerMonitor` resume 시 놓친 경계 보정 발사. 사건 12의 입력 |

**불변식: main 은 DB 커밋 후에만 발송한다.** better-sqlite3 가 동기이므로 "INSERT → send" 코드 순서만으로 보장된다. 어기면 renderer 가 커밋 전 데이터를 재조회하고, refetchOnWindowFocus:false 환경에서 다음 사건까지 영구 stale 이 된다.

23시 이후 힌트(H1/H2, today-tasks R19)는 이 채널과 무관 — 표시 전용이므로 renderer 로컬 1분 인터벌로 판정한다 (타이머의 "표시는 renderer, 사실은 main" 분업과 같은 구도).

### 계약과 검증 — invoke 와 대칭

- `src/shared/ipc/contracts.ts` 에 이벤트도 payload zod 스키마를 갖는다. 채널 이름은 `channels.ts` 상수.
- **양쪽 parse**: main 은 발송 직전, renderer 는 수신 직후 같은 스키마로. `handleIpc` 와 대칭인 `sendEvent(win, channel, contract, payload)` / `subscribe(channel, contract, handler)` 헬퍼를 만들고, raw `webContents.send`·`ipcRenderer.on` 직접 호출은 헬퍼 밖에서 금지.

### preload 구독 표면

- 채널마다 `onX(callback): () => void` — **구독 해제 함수를 반환**하는 형태만 노출. raw `ipcRenderer` 비노출(ADR-007 §3) 유지.
- 콜백에 Electron `event` 객체를 넘기지 않고 **payload 만** 넘긴다.

### 구독 지점과 복구

- 구독은 앱 최상단 한 곳(QueryClientProvider 안쪽 단일 이펙트)에서만. 화면은 이벤트를 직접 구독하지 않고 캐시를 읽는다. 해제 함수로 핫 리로드·재마운트 시 리스너 누적 차단.
- **타이머 리스너 순서 고정**: `cancelQueries(['timer'])` → `setQueryData(['timer'], snapshot)`. 새로고침 직후 in-flight pull 이 새 push 를 덮는 역전 레이스 차단 (v5 는 fetch 성공이 시각 비교 없이 캐시를 덮는다).
- **복구 경로**: `['timer']`·`['clock']` 모두 queryFn(`timer.getState` / `clock.now` invoke)을 가진다. 창 재열림·캐시 GC 시 pull 로 복원 — 이벤트 유실이 영구 상태가 되지 않는다.
- ADR-005 §4 의 "재마운트 시 pull" 서술은 절반만 참(캐시 생존 중 재마운트는 pull 하지 않는다) — ADR-026 에 정정 상태 줄을 단다.

## 후속 작업 (ADR 작성 시 함께)

- `docs/architecture/overview.md` 미결정 표에서 "Query invalidation 키 계층" 행 제거.
- ADR-005 에 실행분 보강 표기 추가 (§4 서술 정정 → ADR-026 참조).
