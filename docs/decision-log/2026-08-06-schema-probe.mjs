// DB constraint empirical probe for dongmodoro drizzle/0000_*.sql
// Run: node probe_constraints.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 저장소 루트는 이 스크립트 위치(docs/decision-log/)에서 거슬러 올라가 찾는다.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');

// 파일명을 박지 않는다 — 마이그레이션 이름이 바뀌어도 프로브가 따라간다.
const MIGRATIONS = path.join(REPO, 'drizzle');
const first = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()[0];
if (!first) throw new Error(`마이그레이션 SQL 이 없다: ${MIGRATIONS}`);
const DDL = readFileSync(path.join(MIGRATIONS, first), 'utf8');
console.log(`대상: drizzle/${first}\n`);

function newDb(fk = true) {
  const db = new Database(':memory:');
  db.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`);
  const on = db.pragma('foreign_keys', { simple: true });
  if (fk && on !== 1) throw new Error('FK not ON');
  for (const stmt of DDL.split('--> statement-breakpoint')) {
    const s = stmt.trim();
    if (s) db.exec(s);
  }
  return db;
}

let PASS = 0;
const FAILURES = [];
let COUNT = 0;

function check(name, constraintName, value, expect, fn) {
  COUNT++;
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  const actual = err ? 'reject' : 'accept';
  if (actual === expect) PASS++;
  else
    FAILURES.push({
      name,
      constraintName,
      value,
      expect,
      actual,
      err: err ? String(err.message) : null,
    });
  return actual;
}

const I = '2026-08-03T09:00:00.000Z';
const MON = '2026-08-03';
const MON2 = '2026-08-10';

let seq = 0;
const uid = (p) => `${p}-${++seq}`;

const T = {
  weeks: () => ({
    week: MON,
    budget: 10,
    capacity: '[0,0,0,0,0,0,0]',
    focus_min: 25,
    short_break_min: 5,
    long_break_min: 15,
    planned_at: I,
    settled_at: null,
  }),
  milestones: () => ({
    id: uid('ms'),
    month: '2026-08',
    title: 't',
    completed_at: null,
    sort_order: 1,
    archived_at: null,
    created_at: I,
    updated_at: I,
  }),
  week_items: () => ({
    id: uid('wi'),
    week: MON,
    title: 't',
    est_pomos: 3,
    milestone_id: null,
    days: '[]',
    carry_from_id: null,
    origin_week: MON,
    is_system: 0,
    completed_at: null,
    dropped_at: null,
    created_at: I,
    updated_at: I,
    deleted_at: null,
  }),
  tasks: () => ({
    id: uid('tk'),
    week_item_id: 'WI_BASE',
    title: 't',
    est_pomos: null,
    completed_at: null,
    created_at: I,
    updated_at: I,
    deleted_at: null,
  }),
  sessions: () => ({
    id: uid('se'),
    started_at: I,
    ended_at: I,
    duration_sec: 60,
    kind: 'focus',
    task_id: null,
    note: null,
    local_date: MON,
    local_week: MON,
    updated_at: I,
  }),
  task_pulls: () => ({
    task_id: 'TK_BASE',
    pull_date: MON,
    removed_at: null,
    created_at: I,
    updated_at: I,
  }),
  settings: () => ({ key: uid('k'), value: '{}', updated_at: I }),
};

function insert(db, table, overrides = {}) {
  const row = { ...T[table](), ...overrides };
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols
    .map(() => '?')
    .join(',')})`;
  db.prepare(sql).run(cols.map((c) => row[c]));
}

const db = newDb();
insert(db, 'weeks', {});
insert(db, 'weeks', { week: MON2 });
insert(db, 'week_items', { id: 'WI_BASE' });
insert(db, 'tasks', { id: 'TK_BASE' });

const t = (label, cname, table, overrides, expect) =>
  check(label, cname, JSON.stringify(overrides), expect, () => insert(db, table, overrides));

// ---------- 0. JSON1 ----------
console.log('--- JSON1 extension ---');
for (const [fn, expr] of [
  ['json_valid', "json_valid('{}')"],
  ['json_array_length', "json_array_length('[1,2]')"],
  ['json_type', "json_type('[]')"],
]) {
  COUNT++;
  try {
    const v = db.prepare(`SELECT ${expr} AS v`).get().v;
    PASS++;
    console.log(`  ${fn} available -> ${JSON.stringify(v)}`);
  } catch (e) {
    FAILURES.push({ name: `JSON1 ${fn}`, constraintName: 'n/a', value: expr, expect: 'available', actual: 'missing', err: e.message });
  }
}

// ---------- 1. calendar keys ----------
const BAD_DATES = [
  'garbage', '', '2026-8-3', '2026-02-30', '0000-00-00', '9999-99-99',
  '2026-08-03T09:00:00Z', '2026-08-03 00:00:00', 'now', '2460000.5',
  '2026-08-03Z', '+2026-08-03',
];
const dateCols = [
  ['sessions', 'local_date', 'sessions_local_date_format', false],
  ['task_pulls', 'pull_date', 'task_pulls_pull_date_format', false],
  ['weeks', 'week', 'weeks_week_monday', true],
  ['week_items', 'week', 'week_items_week_monday', true],
  ['week_items', 'origin_week', 'week_items_origin_week_monday', true],
  ['sessions', 'local_week', 'sessions_local_week_monday', true],
];
for (const [table, col, cname, isWeek] of dateCols) {
  for (const bad of BAD_DATES)
    t(`${table}.${col} = ${JSON.stringify(bad)}`, cname, table, { [col]: bad }, 'reject');
  t(`${table}.${col} = '2026-08-04' (Tuesday)`, cname, table, { [col]: '2026-08-04' }, isWeek ? 'reject' : 'accept');
  const okVal = table === 'weeks' && col === 'week' ? '2028-03-06' : MON;
  t(`${table}.${col} = '${okVal}' (Monday, valid)`, cname, table, { [col]: okVal }, 'accept');
}
for (const bad of ['garbage', '', '2026-8', '2026-13', '0000-00', '2026-08-03', '2026-08-03T09:00:00.000Z', 'now'])
  t(`milestones.month = ${JSON.stringify(bad)}`, 'milestones_month_format', 'milestones', { month: bad }, 'reject');
t(`milestones.month = '2026-08' (valid)`, 'milestones_month_format', 'milestones', { month: '2026-08' }, 'accept');

// ---------- 2. instant columns ----------
const INSTANT_COLS = [
  ['milestones', 'completed_at'], ['milestones', 'archived_at'], ['milestones', 'created_at'], ['milestones', 'updated_at'],
  ['sessions', 'started_at'], ['sessions', 'ended_at'], ['sessions', 'updated_at'],
  ['settings', 'updated_at'],
  ['task_pulls', 'removed_at'], ['task_pulls', 'created_at'], ['task_pulls', 'updated_at'],
  ['tasks', 'completed_at'], ['tasks', 'created_at'], ['tasks', 'updated_at'], ['tasks', 'deleted_at'],
  ['week_items', 'completed_at'], ['week_items', 'dropped_at'], ['week_items', 'created_at'], ['week_items', 'updated_at'], ['week_items', 'deleted_at'],
  ['weeks', 'planned_at'], ['weeks', 'settled_at'],
];
const BAD_INSTANTS = [
  'Z', '2026-08-03', '2026-08-03T09:00:00Z', '2026-08-03 09:00:00.000Z', 'garbage', '',
  '2026-08-03T09:00:00.000z', '2026-08-03T09:00:00.000+09:00', '2026-08-03T09:00:00.0000Z',
  ' 2026-08-03T09:00:00.000Z',
];
console.log(`--- instant columns: ${INSTANT_COLS.length} ---`);
let wkSeq = 0;
const WEEK_POOL = ['2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19','2026-11-02','2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07','2026-12-14','2026-12-21','2026-12-28','2027-01-04','2027-01-11','2027-01-18','2027-01-25','2027-02-01','2027-02-08','2027-02-15','2027-02-22','2027-03-01','2027-03-08','2027-03-15'];
let pullSeq = 0;
function instantOverrides(table, col, val) {
  const o = { [col]: val };
  if (table === 'weeks') o.week = WEEK_POOL[wkSeq++ % WEEK_POOL.length];
  if (table === 'task_pulls') {
    pullSeq++;
    o.pull_date = `2026-${String(1 + (pullSeq % 12)).padStart(2, '0')}-${String(1 + (pullSeq % 28)).padStart(2, '0')}`;
  }
  return o;
}
for (const [table, col] of INSTANT_COLS) {
  for (const bad of BAD_INSTANTS)
    t(`${table}.${col} = ${JSON.stringify(bad)}`, `${table}_${col}_format`, table, instantOverrides(table, col, bad), 'reject');
  t(`${table}.${col} = valid instant`, `${table}_${col}_format`, table, instantOverrides(table, col, I), 'accept');
  t(`${table}.${col} = '2026-13-45T99:99:99.999Z' (digit-shaped but impossible)`, `${table}_${col}_format`, table, instantOverrides(table, col, '2026-13-45T99:99:99.999Z'), 'reject');
}

// ---------- 3. value ranges ----------
console.log('--- value ranges ---');
for (const v of [7, -1, 'a', '1', 2, 0.5, null])
  t(`week_items.is_system = ${JSON.stringify(v)}`, 'week_items_is_system_bool', 'week_items',
    { is_system: v, est_pomos: v === 1 || v === '1' ? 0 : 3 },
    v === 0 || v === 1 || v === '1' ? 'accept' : 'reject');
t('week_items is_system=0 est_pomos=0', 'week_items_est_by_kind', 'week_items', { is_system: 0, est_pomos: 0 }, 'reject');
t('week_items is_system=1 est_pomos=3', 'week_items_est_by_kind', 'week_items', { is_system: 1, est_pomos: 3, week: MON2 }, 'reject');
t('week_items est_pomos=-3', 'week_items_est_by_kind', 'week_items', { is_system: 0, est_pomos: -3 }, 'reject');
t("week_items est_pomos='abc' (text in INTEGER col)", 'week_items_est_by_kind', 'week_items', { is_system: 0, est_pomos: 'abc' }, 'reject');
t('week_items est_pomos=1.5 (fraction)', 'week_items_est_by_kind', 'week_items', { is_system: 0, est_pomos: 1.5 }, 'reject');
t('week_items est_pomos=1 (valid)', 'week_items_est_by_kind', 'week_items', { is_system: 0, est_pomos: 1 }, 'accept');

t('tasks.est_pomos = 0', 'tasks_est_pomos_range', 'tasks', { est_pomos: 0 }, 'reject');
t('tasks.est_pomos = -1', 'tasks_est_pomos_range', 'tasks', { est_pomos: -1 }, 'reject');
t("tasks.est_pomos = 'abc'", 'tasks_est_pomos_range', 'tasks', { est_pomos: 'abc' }, 'reject');
t('tasks.est_pomos = 1.5', 'tasks_est_pomos_range', 'tasks', { est_pomos: 1.5 }, 'reject');
t("tasks.est_pomos = '5' (numeric text, affinity converts)", 'tasks_est_pomos_range', 'tasks', { est_pomos: '5' }, 'accept');
t('tasks.est_pomos = NULL (valid)', 'tasks_est_pomos_range', 'tasks', { est_pomos: null }, 'accept');
t('tasks.est_pomos = 1 (valid)', 'tasks_est_pomos_range', 'tasks', { est_pomos: 1 }, 'accept');

t('sessions.duration_sec = -100', 'sessions_duration_range', 'sessions', { duration_sec: -100 }, 'reject');
t("sessions.duration_sec = 'abc'", 'sessions_duration_range', 'sessions', { duration_sec: 'abc' }, 'reject');
t('sessions.duration_sec = 1.5', 'sessions_duration_range', 'sessions', { duration_sec: 1.5 }, 'reject');
t('sessions.duration_sec = blob', 'sessions_duration_range', 'sessions', { duration_sec: Buffer.from('x') }, 'reject');
t('sessions.duration_sec = 0 (valid)', 'sessions_duration_range', 'sessions', { duration_sec: 0 }, 'accept');
t('sessions ended_at < started_at', 'sessions_ended_after_started', 'sessions', { started_at: '2026-08-03T10:00:00.000Z', ended_at: '2026-08-03T09:00:00.000Z' }, 'reject');
t('sessions ended_at == started_at (valid)', 'sessions_ended_after_started', 'sessions', { started_at: I, ended_at: I }, 'accept');
for (const k of ['nope', 'FOCUS', '', 'Focus', null])
  t(`sessions.kind = ${JSON.stringify(k)}`, 'sessions_kind_enum', 'sessions', { kind: k }, 'reject');
for (const k of ['focus', 'short', 'long'])
  t(`sessions.kind = ${JSON.stringify(k)} (valid)`, 'sessions_kind_enum', 'sessions', { kind: k }, 'accept');

let wseq = 0;
const wk = () => new Date(Date.UTC(2029, 0, 1) + wseq++ * 7 * 86400000).toISOString().slice(0, 10);
// 2029-01-01 is a Monday
for (const [col, v, exp] of [
  ['focus_min', 0, 'reject'], ['focus_min', -1, 'reject'], ['focus_min', 'abc', 'reject'],
  ['focus_min', 1.5, 'reject'], ['focus_min', 1, 'accept'],
  ['short_break_min', 0, 'reject'], ['long_break_min', 0, 'reject'],
])
  t(`weeks.${col} = ${JSON.stringify(v)}`, 'weeks_baseline_range', 'weeks', { [col]: v, week: wk() }, exp);
for (const [v, exp] of [
  ['nope', 'reject'], ['[1,2,3]', 'reject'], ['{}', 'reject'],
  ['{"a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7}', 'reject'],
  ['7', 'reject'], ['"[0,0,0,0,0,0,0]"', 'reject'],
  ['[0,0,0,0,0,0,0]', 'accept'], [null, 'accept'],
  ['["a","b","c","d","e","f","g"]', 'reject'],
  ['[-1,0,0,0,0,0,0]', 'reject'],
  ['[null,null,null,null,null,null,null]', 'reject'],
])
  t(`weeks.capacity = ${JSON.stringify(v)}`, 'weeks_capacity_shape', 'weeks', { capacity: v, week: wk() }, exp);
for (const [v, exp] of [[-1, 'reject'], ['abc', 'reject'], [1.5, 'reject'], [0, 'accept'], [null, 'accept']])
  t(`weeks.budget = ${JSON.stringify(v)}`, 'weeks_budget_range', 'weeks', { budget: v, week: wk() }, exp);
for (const [v, exp] of [['nope', 'reject'], ['{}', 'reject'], ['5', 'reject'], ['"x"', 'reject'], ['[]', 'accept'], ['[1,2]', 'accept']])
  t(`week_items.days = ${JSON.stringify(v)}`, 'week_items_days_json', 'week_items', { days: v }, exp);
for (const [v, exp] of [['nope', 'reject'], ['', 'reject'], ['null', 'accept'], ['{}', 'accept'], ['5', 'accept']])
  t(`settings.value = ${JSON.stringify(v)}`, 'settings_value_json', 'settings', { value: v }, exp);

// ---------- 3b. sessions.local_week CHECK isolated from FK ----------
console.log('--- sessions.local_week CHECK isolated (FK OFF) ---');
{
  const dNoFk = newDb(false);
  const tf = (v, expect) =>
    check(`[FK OFF] sessions.local_week = ${JSON.stringify(v)}`, 'sessions_local_week_monday', String(v), expect, () =>
      insert(dNoFk, 'sessions', { local_week: v }));
  for (const bad of [...BAD_DATES, '2026-08-04']) tf(bad, 'reject');
  tf(MON, 'accept');
  dNoFk.close();
}

// ---------- 4. FK ----------
console.log('--- foreign keys ---');
t('sessions.local_week -> missing weeks row', 'FK sessions.local_week', 'sessions', { local_week: '2030-01-07', local_date: '2030-01-07' }, 'reject');
t('week_items.week -> missing weeks row (MUST SUCCEED: no FK by design)', 'no FK on week_items.week', 'week_items', { week: '2030-01-07', origin_week: '2030-01-07' }, 'accept');
t('week_items.carry_from_id -> missing id', 'FK week_items.carry_from_id', 'week_items', { carry_from_id: 'NOPE' }, 'reject');
t('week_items.carry_from_id -> existing id (valid)', 'FK week_items.carry_from_id', 'week_items', { carry_from_id: 'WI_BASE' }, 'accept');
t('week_items.milestone_id -> missing id', 'FK week_items.milestone_id', 'week_items', { milestone_id: 'NOPE' }, 'reject');
t('sessions.task_id -> missing id', 'FK sessions.task_id', 'sessions', { task_id: 'NOPE' }, 'reject');
t('tasks.week_item_id -> missing id', 'FK tasks.week_item_id', 'tasks', { week_item_id: 'NOPE' }, 'reject');
t('task_pulls.task_id -> missing id', 'FK task_pulls.task_id', 'task_pulls', { task_id: 'NOPE' }, 'reject');
{
  COUNT++;
  const d2 = newDb();
  insert(d2, 'weeks', {});
  insert(d2, 'milestones', { id: 'MS1' });
  insert(d2, 'week_items', { id: 'WI1', milestone_id: 'MS1' });
  d2.prepare(`DELETE FROM milestones WHERE id='MS1'`).run();
  const got = d2.prepare(`SELECT milestone_id FROM week_items WHERE id='WI1'`).get();
  if (got && got.milestone_id === null) { PASS++; console.log('  ON DELETE SET NULL works'); }
  else FAILURES.push({ name: 'milestones DELETE -> week_items.milestone_id SET NULL', constraintName: 'FK ON DELETE set null', value: 'DELETE milestone', expect: 'milestone_id NULL', actual: JSON.stringify(got), err: null });
  d2.close();
}

// ---------- 5. partial unique index ----------
console.log('--- partial unique index ---');
{
  const d3 = newDb();
  insert(d3, 'weeks', {});
  insert(d3, 'weeks', { week: MON2 });
  const t3 = (label, ov, expect) => check(label, 'idx_week_items_one_system', JSON.stringify(ov), expect, () => insert(d3, 'week_items', ov));
  t3('1st system item wk1', { is_system: 1, est_pomos: 0, week: MON }, 'accept');
  t3('2nd system item wk1 (dup)', { is_system: 1, est_pomos: 0, week: MON }, 'reject');
  t3('system item wk2 (different week)', { is_system: 1, est_pomos: 0, week: MON2 }, 'accept');
  t3('normal item #1 wk1', { is_system: 0, est_pomos: 1, week: MON }, 'accept');
  t3('normal item #2 wk1', { is_system: 0, est_pomos: 1, week: MON }, 'accept');
  t3('normal item #3 wk1', { is_system: 0, est_pomos: 2, week: MON }, 'accept');
  COUNT++;
  try {
    d3.prepare(`UPDATE week_items SET deleted_at=? WHERE week=? AND is_system=1`).run(I, MON);
    insert(d3, 'week_items', { is_system: 1, est_pomos: 0, week: MON });
    console.log('  INFO: soft-deleted system item FREES the slot (index ignores deleted_at, insert succeeded)');
    PASS++;
  } catch (e) {
    PASS++;
    console.log('  INFO: soft-deleted system item STILL blocks a new one (index ignores deleted_at): ' + e.message);
  }
  d3.close();
}

// ---------- 6. gaps found by reading the DDL ----------
console.log('--- extra / self-directed ---');
t("week_items.title = '' (no length constraint)", 'none', 'week_items', { title: '' }, 'accept');
t("tasks.id = '' (no id constraint)", 'none', 'tasks', { id: '' }, 'accept');
t('week_items week < origin_week (origin in the future)', 'none', 'week_items', { week: MON, origin_week: '2027-06-07' }, 'accept');
t('sessions local_date outside local_week', 'none', 'sessions', { local_date: '2027-03-01', local_week: MON }, 'accept');
// ADR-021 §1 이 정수 강제를 추가하기 전에는 통과했다 (정렬 키가 TEXT 로 오염됨).
t(
  "milestones.sort_order = 'abc'",
  'milestones_sort_order_int',
  'milestones',
  { sort_order: 'abc' },
  'reject',
);
t('week_items.carry_from_id = own id-ish self ref chain', 'none', 'week_items', { carry_from_id: 'WI_BASE' }, 'accept');

console.log('\n================ RESULT ================');
console.log(`total cases: ${COUNT}, pass: ${PASS}, fail: ${FAILURES.length}`);
const grouped = new Map();
for (const f of FAILURES) {
  const key = `${f.expect === 'reject' ? 'BAD VALUE ACCEPTED' : 'GOOD VALUE REJECTED'} :: ${f.value.includes('13-45') ? 'digit-shaped impossible instant' : f.name}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(f);
}
for (const f of FAILURES) {
  console.log(`\n[FAIL] ${f.name}`);
  console.log(`  constraint: ${f.constraintName}`);
  console.log(`  value: ${f.value}`);
  console.log(`  expected: ${f.expect} / actual: ${f.actual}`);
  if (f.err) console.log(`  err: ${f.err}`);
}
