// 결정 1~3 이 반영된 제약 전체를 실제로 만들고, 통과/거부가 의도대로인지 확인한다.
import Database from 'better-sqlite3'
const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

const INSTANT = "GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'"

db.exec(`
CREATE TABLE weeks (
  week TEXT PRIMARY KEY,
  budget INTEGER,                                  -- 결정 1: nullable
  capacity TEXT,                                   -- 결정 1: nullable
  focus_min INTEGER NOT NULL, short_break_min INTEGER NOT NULL, long_break_min INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (week IS date(week) AND strftime('%w', week) = '1'),
  CHECK (budget IS NULL OR budget >= 0),
  CHECK (capacity IS NULL OR (json_valid(capacity) AND json_array_length(capacity) = 7)),
  CHECK (focus_min >= 1 AND short_break_min >= 1 AND long_break_min >= 1),
  CHECK (created_at ${INSTANT} AND updated_at ${INSTANT})
);
CREATE TABLE week_items (
  id TEXT PRIMARY KEY, week TEXT NOT NULL, title TEXT NOT NULL,
  est_pomos INTEGER NOT NULL, days TEXT NOT NULL, origin_week TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (week IS date(week) AND strftime('%w', week) = '1'),
  CHECK (origin_week IS date(origin_week) AND strftime('%w', origin_week) = '1'),
  CHECK (is_system IN (0,1)),
  CHECK ((is_system = 0 AND est_pomos >= 1) OR (is_system = 1 AND est_pomos = 0)),
  CHECK (json_valid(days) AND json_type(days) = 'array'),
  CHECK (deleted_at IS NULL OR deleted_at ${INSTANT})
);
CREATE UNIQUE INDEX idx_week_items_one_system ON week_items(week) WHERE is_system = 1;
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, week_item_id TEXT NOT NULL REFERENCES week_items(id),
  title TEXT NOT NULL, est_pomos INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (est_pomos IS NULL OR est_pomos >= 1)
);
CREATE TABLE task_pulls (
  task_id TEXT NOT NULL REFERENCES tasks(id), pull_date TEXT NOT NULL,
  removed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,   -- 결정 3
  PRIMARY KEY (task_id, pull_date),
  CHECK (pull_date IS date(pull_date)),
  CHECK (removed_at IS NULL OR removed_at ${INSTANT})
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL, kind TEXT NOT NULL, task_id TEXT REFERENCES tasks(id),
  local_date TEXT NOT NULL,
  local_week TEXT NOT NULL REFERENCES weeks(week),                       -- 누락됐던 FK
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (kind IN ('focus','short','long')),
  CHECK (started_at ${INSTANT} AND ended_at ${INSTANT}),
  CHECK (ended_at >= started_at),
  CHECK (local_date IS date(local_date)),
  CHECK (local_week IS date(local_week) AND strftime('%w', local_week) = '1'),
  CHECK (duration_sec >= 0)
);
CREATE TABLE milestones (
  id TEXT PRIMARY KEY, month TEXT NOT NULL, title TEXT NOT NULL, sort_order INTEGER NOT NULL,
  CHECK (month IS strftime('%Y-%m', month || '-01'))
);
`)

const T = '2026-08-03T09:00:00.000Z'
const probe = (label, sql, expect) => {
  let got = '통과'
  try { db.prepare(sql).run() } catch (e) { got = '거부' }
  const ok = got === expect
  console.log(`${ok ? ' ' : '✗'} ${got.padEnd(4)} ${label}`)
  if (!ok) process.exitCode = 1
}

// 준비 — 정상 행
db.prepare(`INSERT INTO weeks VALUES ('2026-08-03',24,'[4,4,4,4,4,4,0]',25,5,15,'${T}','${T}')`).run()
db.prepare(`INSERT INTO week_items VALUES ('wi1','2026-08-03','항목',3,'[]','2026-08-03',0,'${T}','${T}',NULL)`).run()
db.prepare(`INSERT INTO tasks VALUES ('t1','wi1','조각',2,'${T}','${T}')`).run()

console.log('\n── 결정 1: capacity·budget 이 NULL 인 주 ──')
probe('온보딩 건너뛴 사용자의 첫 세션 주 (둘 다 NULL)',
  `INSERT INTO weeks VALUES ('2026-08-10',NULL,NULL,25,5,15,'${T}','${T}')`, '통과')
probe('음수 예산은 여전히 거부',
  `INSERT INTO weeks VALUES ('2026-08-17',-99,NULL,25,5,15,'${T}','${T}')`, '거부')
probe('길이 0분 거부',
  `INSERT INTO weeks VALUES ('2026-08-24',24,NULL,0,5,15,'${T}','${T}')`, '거부')
probe('capacity 가 JSON 아님 → 거부',
  `INSERT INTO weeks VALUES ('2026-08-31',24,'not json',25,5,15,'${T}','${T}')`, '거부')
probe('capacity 배열 길이 6 → 거부',
  `INSERT INTO weeks VALUES ('2026-09-07',24,'[1,1,1,1,1,1]',25,5,15,'${T}','${T}')`, '거부')

console.log('\n── 달력 키 fail-open 이 닫혔는가 ──')
// 2026-09-14 도 월요일이다 — 위에서 안 쓴 값이라야 PK 충돌과 구분된다
for (const [v, exp] of [['2026-09-14','통과'],['2026-08-04','거부'],['garbage','거부'],['','거부'],['2026-8-3','거부'],['2026-02-30','거부'],['2026-08-03T09:00:00Z','거부']])
  probe(`weeks.week = ${JSON.stringify(v)}`, `INSERT INTO weeks VALUES ('${v}',NULL,NULL,25,5,15,'${T}','${T}')`, exp)

console.log('\n── 결정 2: 이월 est 하한이 CHECK 과 맞는가 ──')
probe('이월 est = 1 (남은 몫 0 이었던 항목)',
  `INSERT INTO week_items VALUES ('wi2','2026-08-03','이월',1,'[]','2026-07-27',0,'${T}','${T}',NULL)`, '통과')
probe('일반 항목 est = 0 → 거부',
  `INSERT INTO week_items VALUES ('wi3','2026-08-03','x',0,'[]','2026-08-03',0,'${T}','${T}',NULL)`, '거부')
probe('기타 항목 est = 0 → 통과',
  `INSERT INTO week_items VALUES ('wi4','2026-08-03','기타',0,'[]','2026-08-03',1,'${T}','${T}',NULL)`, '통과')
probe('기타 항목인데 est = 3 → 거부',
  `INSERT INTO week_items VALUES ('wi5','2026-08-03','x',3,'[]','2026-08-03',1,'${T}','${T}',NULL)`, '거부')
probe('is_system = 7 → 거부 (ADR-012 차액 정의 보호)',
  `INSERT INTO week_items VALUES ('wi6','2026-08-03','x',3,'[]','2026-08-03',7,'${T}','${T}',NULL)`, '거부')
probe('est 음수 → 거부',
  `INSERT INTO week_items VALUES ('wi7','2026-08-03','x',-3,'[]','2026-08-03',0,'${T}','${T}',NULL)`, '거부')
probe('한 주에 기타 항목 두 개 → 거부 (부분 UNIQUE)',
  `INSERT INTO week_items VALUES ('wi8','2026-08-03','기타2',0,'[]','2026-08-03',1,'${T}','${T}',NULL)`, '거부')

console.log('\n── 결정 3: task_pulls ──')
probe('정상 pull',
  `INSERT INTO task_pulls VALUES ('t1','2026-08-03',NULL,'${T}','${T}')`, '통과')
probe('pull_date 가 날짜 아님 → 거부',
  `INSERT INTO task_pulls VALUES ('t1','garbage',NULL,'${T}','${T}')`, '거부')
probe('removed_at 이 순간 형식 아님 → 거부',
  `INSERT INTO task_pulls VALUES ('t1','2026-08-05','Z','${T}','${T}')`, '거부')

console.log('\n── sessions: 순간 형식·순서·FK ──')
const S = `'2026-08-03T09:00:00.000Z'`, E = `'2026-08-03T09:25:00.000Z'`
probe('정상 세션',
  `INSERT INTO sessions VALUES ('s1',${S},${E},1500,'focus','t1','2026-08-03','2026-08-03','${T}','${T}')`, '통과')
probe("started_at = 'Z' → 거부 (기존 GLOB '*Z' 는 통과시켰음)",
  `INSERT INTO sessions VALUES ('s2','Z',${E},1500,'focus',NULL,'2026-08-03','2026-08-03','${T}','${T}')`, '거부')
probe('ended_at < started_at → 거부',
  `INSERT INTO sessions VALUES ('s3',${E},${S},1500,'focus',NULL,'2026-08-03','2026-08-03','${T}','${T}')`, '거부')
probe('duration 음수 → 거부',
  `INSERT INTO sessions VALUES ('s4',${S},${E},-100,'focus',NULL,'2026-08-03','2026-08-03','${T}','${T}')`, '거부')
probe('미지의 kind → 거부',
  `INSERT INTO sessions VALUES ('s5',${S},${E},1500,'nap',NULL,'2026-08-03','2026-08-03','${T}','${T}')`, '거부')
probe('weeks 행이 없는 주에 세션 → 거부 (R17 을 FK 가 지킨다)',
  `INSERT INTO sessions VALUES ('s6',${S},${E},1500,'focus',NULL,'2026-12-07','2026-12-07','${T}','${T}')`, '거부')

console.log('\n── milestones.month ──')
for (const [v, exp] of [['2026-08','통과'],['2026-99','거부'],['2026-00','거부'],['0000-13','거부'],['garbage','거부']])
  probe(`month = ${JSON.stringify(v)}`, `INSERT INTO milestones VALUES ('m-${v}','${v}','x',1)`, exp)

console.log(process.exitCode ? '\n실패한 케이스가 있다' : '\n전부 의도대로')
