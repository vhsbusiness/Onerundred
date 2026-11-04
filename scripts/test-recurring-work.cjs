// Integration tests against an EMPTY, disposable SQLite database; never uses a user database.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onerundred-recurring-test-'));
const dbFile = path.join(dir, 'test.db');
process.env.TZ = 'America/Sao_Paulo';
process.env.DATABASE_URL = 'file:' + dbFile;
process.env.DISABLE_NOTIFICATION_SCHEDULER = '1';
const sql = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.sqlite.prisma', '--script'], { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sqlite = new (require('better-sqlite3'))(dbFile);
sqlite.exec(sql);
sqlite.close();

// Load the actual TS backend (including Prisma) without a web server or a new test dependency.
const modules = new Map();
function load(file) {
  if (!path.extname(file)) file += '.ts';
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const req = createRequire(file);
  const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', 'module', '__filename', '__dirname', code)(module.exports, p => {
    if (p.startsWith('@/')) return load(path.join(root, 'src', p.slice(2)));
    if (p.startsWith('.')) return load(path.resolve(path.dirname(file), p));
    return req(p);
  }, module, file, path.dirname(file));
  return module.exports;
}
const { prisma } = load(path.join(root, 'src/lib/db.ts'));
const repo = load(path.join(root, 'src/lib/repo.ts'));
const { todayKey, dayRange, dayKey } = load(path.join(root, 'src/lib/time.ts'));
const RealDate = Date;
let clock = new RealDate('2026-11-04T01:00:00-03:00').getTime();
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const today = todayKey(), yesterday = '2026-11-03';
const oldStart = () => new Date('2026-11-03T22:00:00-03:00');
let seq = 0;
async function fixture(options = {}) {
  const id = 'recurring-qa-' + ++seq;
  const user = await prisma.user.create({ data: { id, name: id, username: id, email: id + '@example.test', passwordHash: 'not-a-login-hash' } });
  const board = await prisma.board.create({ data: { userId: user.id, name: 'Teste', type: options.type ?? 'tasks' } });
  const list = await prisma.list.create({ data: { boardId: board.id, name: 'Hoje', kind: options.kind ?? 'today', position: 0 } });
  return { userId: user.id, board, list };
}
async function running(f, startedAt = oldStart()) {
  const s = await prisma.workSession.create({ data: { userId: f.userId, startedAt } });
  await prisma.setting.upsert({ where: { userId_key: { userId: f.userId, key: 'workEndedDay' } }, create: { userId: f.userId, key: 'workEndedDay', value: '' }, update: { value: '' } });
  return s;
}
async function recurrence(f, options = {}) {
  return prisma.recurringTask.create({ data: { userId: f.userId, listId: f.list.id, title: 'Automática', weekdays: '0,1,2,3,4,5,6', estimatedMinutes: 10, ...options } });
}
async function maintain() { clock += 61_000; await repo.runMaintenance(); }
const count = r => prisma.card.count({ where: { recurringId: r.id } });

test('previous-day work defers maintenance without consuming occurrence; manual end releases immediately and once', async () => {
  const f = await fixture(), other = await fixture();
  await running(f); const r = await recurrence(f); const otherR = await recurrence(other);
  await maintain();
  assert.equal(await count(r), 0);
  assert.equal((await prisma.recurringTask.findUnique({ where: { id: r.id } })).lastSpawnedKey, null);
  assert.equal(await count(otherR), 1, 'other users are unaffected');
  await repo.endWork(f.userId); // no wait for the minute throttle
  assert.equal(await count(r), 1);
  assert.equal((await prisma.card.findFirst({ where: { recurringId: r.id } })).scheduledFor, today);
  await repo.endWork(f.userId); await maintain();
  assert.equal(await count(r), 1);
});

test('today session and no session allow regular generation; create recurrence respects overnight gate', async () => {
  const f = await fixture(); await running(f, new Date());
  const r = await recurrence(f); await maintain(); assert.equal(await count(r), 1);
  const overnight = await fixture(); await running(overnight);
  const created = await repo.createRecurring(overnight.userId, { listId: overnight.list.id, title: 'Criada agora', weekdays: [new Date().getDay()] });
  assert.equal(created.card, null);
  await repo.endWork(overnight.userId); assert.equal(await count(created.recurring), 1);
});

test('pause and resume preserve the persisted overnight hold; explicit end releases', async () => {
  const f = await fixture(); await running(f); const r = await recurrence(f);
  await repo.pauseWork(f.userId); await maintain(); assert.equal(await count(r), 0);
  const cycle = await prisma.setting.findUnique({ where: { userId_key: { userId: f.userId, key: 'workCycleStartedAt' } } });
  assert.equal(cycle.value, oldStart().toISOString());
  assert((await repo.getWorkState(f.userId)).sessions.length > 0, 'paused session remains available to end');
  const { unfinishedWorkStart } = load(path.join(root, 'src/lib/work-cycle.ts'));
  assert.equal((await unfinishedWorkStart(prisma, f.userId)).getTime(), oldStart().getTime());
  await repo.startWork(f.userId); await maintain(); assert.equal(await count(r), 0);
  await repo.endWork(f.userId); assert.equal(await count(r), 1);
});

test('weekday, paused recurrence, organization board and tomorrow target retain their rules', async () => {
  const f = await fixture(), org = await fixture({ type: 'organization' }), tomorrow = await fixture({ kind: 'tomorrow' });
  const offDay = await recurrence(f, { weekdays: String((new Date().getDay() + 1) % 7) });
  const inactive = await recurrence(f, { active: false }); const organization = await recurrence(org); const next = await recurrence(tomorrow);
  await maintain();
  for (const r of [offDay, inactive, organization]) assert.equal(await count(r), 0);
  assert.equal((await prisma.card.findFirst({ where: { recurringId: next.id } })).scheduledFor, dayKey(dayRange(today).end));
});

test('finishing the last old-day task auto-ends work, then creates the new-day tasks', async () => {
  const f = await fixture(); await running(f); const r = await recurrence(f);
  const doneList = await prisma.list.create({ data: { boardId: f.board.id, name: 'Feitas', kind: 'done', position: 1 } });
  const card = await prisma.card.create({ data: { listId: f.list.id, title: 'Última de ontem', scheduledFor: yesterday, position: 0 } });
  await maintain(); assert.equal(await count(r), 0);
  await repo.moveCard(f.userId, card.id, doneList.id, 0);
  assert.equal(await prisma.workSession.count({ where: { userId: f.userId, endedAt: null } }), 0);
  assert.equal(await count(r), 1);
});

test('old session analysis uses start-day work and plan, excluding new recurring tasks', async () => {
  const f = await fixture(); const old = await running(f); const r = await recurrence(f, { estimatedMinutes: 400 });
  await prisma.card.create({ data: { listId: f.list.id, title: 'Trabalho anterior', scheduledFor: yesterday, position: 0, createdAt: oldStart(), estimatedMinutes: 90 } });
  await repo.endWork(f.userId);
  await prisma.workSession.create({ data: { userId: f.userId, startedAt: new Date(), endedAt: new Date(Date.now() + 60_000) } });
  const closed = await prisma.workSession.findUnique({ where: { id: old.id } });
  const context = await repo.getWorkSessionDayContext(f.userId, closed);
  assert.equal(context.dayKey, yesterday); assert.equal(context.plannedMinutes, 90);
  assert.equal(context.workedMs, closed.endedAt - old.startedAt);
  assert.equal(await count(r), 1);
});

test('forgotten timer closure releases recurrence instead of leaving a permanent hold', async () => {
  const f = await fixture(); await running(f, new Date(Date.now() - 17 * 3600000)); const r = await recurrence(f);
  await maintain(); assert.equal(await count(r), 1);
});

test('repeated simultaneous end requests do not duplicate occurrences', async () => {
  const f = await fixture(); await running(f); const r = await recurrence(f);
  await Promise.all([repo.endWork(f.userId), repo.endWork(f.userId)]);
  assert.equal(await count(r), 1);
});

test('an existing occurrence is kept; starting today generates without waiting for maintenance', async () => {
  const f = await fixture(); const r = await recurrence(f);
  await prisma.card.create({ data: { listId: f.list.id, recurringId: r.id, title: 'Já existe', scheduledFor: today, position: 0 } });
  await repo.startWork(f.userId); assert.equal(await count(r), 1);
  const fresh = await fixture(); const next = await recurrence(fresh);
  await repo.startWork(fresh.userId); assert.equal(await count(next), 1);
});

after(async () => { global.Date = RealDate; await prisma.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });
