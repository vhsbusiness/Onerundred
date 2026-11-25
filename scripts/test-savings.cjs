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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onerundred-savings-test-'));
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
const { savingsPlan, savingsEnd, savingsDuration, savingsDefinition } = load(path.join(root, 'src/lib/savings-plan.ts'));
const { writeSavings, listSavings, sendSavingsReminders } = load(path.join(root, 'src/lib/savings.ts'));
const { financeOverview } = load(path.join(root, 'src/lib/finance.ts'));
const { todayKey } = load(path.join(root, 'src/lib/time.ts'));
let seq=0;
async function user(){const id='savings'+ ++seq;await prisma.user.create({data:{id,name:id,username:id,email:id+'@example.test',passwordHash:'not-a-login-hash'}});return id;}
const input=(more={})=>({name:'Reserva',frequency:'daily',mode:'period',amount:'10,00',startDay:'2026-01-01',endDay:'2026-01-03',reminderTime:'20:00',...more});
async function goal(userId,space='personal',more={}){await writeSavings(userId,space,'metas','POST',input(more));return (await listSavings(userId,space))[0];}
const record=(userId,id,periodStart,amount,space='personal')=>writeSavings(userId,space,'registros-meta','POST',{id,periodStart,amount});
test('daily, weekly and monthly plans count periods and preserve the exact total',()=>{
 let p=savingsPlan({frequency:'daily',mode:'total',amountCents:10000,startDay:'2026-01-01',endDay:'2026-01-03'});
 assert.deepEqual(p.periods.map(p=>p.targetCents),[3334,3333,3333]);assert.equal(p.totalCents,10000);
 p=savingsPlan({frequency:'weekly',mode:'period',amountCents:5000,startDay:'2026-01-01',endDay:'2026-01-16'});
 assert.equal(p.totalCents,15000);assert.deepEqual(p.periods.map(p=>[p.start,p.end]),[['2026-01-01','2026-01-07'],['2026-01-08','2026-01-14'],['2026-01-15','2026-01-16']]);
 p=savingsPlan({frequency:'monthly',mode:'total',amountCents:10000,startDay:'2024-01-31',endDay:'2024-04-29'});
 assert.deepEqual(p.periods.map(p=>p.start),['2024-01-31','2024-02-29','2024-03-31']);assert.equal(p.periods.reduce((s,p)=>s+p.targetCents,0),10000);
 assert.equal(savingsEnd('2024-01-31',1,'months'),'2024-02-28');assert.equal(savingsEnd('2026-12-30',1,'weeks'),'2027-01-05');
});
test('invalid dates, periods, values and amounts too small or too large are rejected',async()=>{
 for(const more of [{frequency:'x'},{mode:'x'},{amount:'-1'},{amount:'1.2345'},{endDay:'2025-01-01'},{startDay:'2026-02-30'},{amount:'0,01',mode:'total'},{amount:'21474836,47'},{endDay:'2040-01-01'},{reminderTime:'25:00'}]) {
  const u=await user();await assert.rejects(goal(u,'personal',more),e=>e.status===400);assert.equal(await prisma.savingsGoal.count({where:{userId:u}}),0);
 }
});
test('records persist, distinguish unmarked from zero, replace earlier values and do not affect balances',async()=>{
 const u=await user(),g=await goal(u);const a=await prisma.financeAccount.create({data:{userId:u,space:'personal',name:'Conta',openingCents:120000}});
 await record(u,g.id,'2026-01-01','10');await record(u,g.id,'2026-01-02','0');await record(u,g.id,'2026-01-01','8,50');
 const saved=(await listSavings(u,'personal'))[0];assert.equal(saved.savedCents,850);assert.deepEqual(saved.periods.map(p=>p.savedCents),[850,0,null]);
 await record(u,g.id,'2026-01-01','8,50');assert.equal(await prisma.savingsCheckin.count({where:{goalId:g.id}}),2);
 const overview=await financeOverview(u,'personal','2026-01');assert.equal(overview.accounts.find(x=>x.id===a.id).balance,120000);assert.equal(overview.entries.length,0);
});
test('goals, records, deletion and overview isolate accounts and personal/business spaces',async()=>{
 const a=await user(),b=await user(),g=await goal(a);assert.equal((await listSavings(b,'personal')).length,0);assert.equal((await listSavings(a,'business')).length,0);
 for(const [u,s] of [[b,'personal'],[a,'business']]) {
  await assert.rejects(record(u,g.id,'2026-01-01','10',s),e=>e.status===404);
  await assert.rejects(writeSavings(u,s,'metas','DELETE',{id:g.id}),e=>e.status===404);
 }
 await record(a,g.id,'2026-01-01','0');await writeSavings(a,'personal','metas','DELETE',{id:g.id});assert.equal(await prisma.savingsCheckin.count({where:{goalId:g.id}}),0);
});
test('future or non-boundary records cannot be marked, but past periods can be corrected',async()=>{
 const u=await user(),g=await goal(u,'personal',{frequency:'weekly',startDay:'2026-01-01',endDay:'2026-01-14'});
 await assert.rejects(record(u,g.id,'2026-01-02','10'),e=>e.status===400);
 const future=await goal(u,'business',{startDay:'2030-01-01',endDay:'2030-01-03'});await assert.rejects(record(u,future.id,'2030-01-01','10','business'),e=>e.status===400);
 await assert.rejects(record(u,g.id,'2026-01-01','-1'),e=>e.status===400);await record(u,g.id,'2026-01-01','10');
});
test('reminders fire at period end, use the correct space, skip marked periods and deduplicate concurrent ticks',async()=>{
 const u=await user(),g=await goal(u,'business',{frequency:'weekly',startDay:'2026-01-01',endDay:'2026-01-14'});let messages=[];
 const send=async message=>{messages.push(message);return 1;};
 assert.equal(await sendSavingsReminders(u,new Date('2026-01-07T19:59:00-03:00'),send),0);
 const counts=await Promise.all([sendSavingsReminders(u,new Date('2026-01-07T20:00:00-03:00'),send),sendSavingsReminders(u,new Date('2026-01-07T20:01:00-03:00'),send)]);
 assert.equal(counts.reduce((a,b)=>a+b,0),1);assert.equal(messages.length,1);assert(messages[0].url.includes('empresa'));assert(messages[0].body.includes('quanto guardou'));
 await record(u,g.id,'2026-01-08','0','business');assert.equal(await sendSavingsReminders(u,new Date('2026-01-14T20:10:00-03:00'),send),0);
});
test('failed pushes retry, missed schedules catch up, and monthly/final reminders respect the end date',async()=>{
 const u=await user();await goal(u,'personal',{frequency:'monthly',startDay:'2024-01-31',endDay:'2024-04-29'});
 assert.equal(await sendSavingsReminders(u,new Date('2024-02-28T19:59:00-03:00'),async()=>1),0);
 assert.equal(await sendSavingsReminders(u,new Date('2024-02-28T20:00:00-03:00'),async()=>0),0);
 assert.equal(await sendSavingsReminders(u,new Date('2024-02-29T09:00:00-03:00'),async()=>1),1);
 assert.equal(await sendSavingsReminders(u,new Date('2024-03-30T20:00:00-03:00'),async()=>1),1);
 assert.equal(await sendSavingsReminders(u,new Date('2024-04-29T20:00:00-03:00'),async()=>1),1);
 assert.equal(await sendSavingsReminders(u,new Date('2024-05-30T20:00:00-03:00'),async()=>1),0);
 const disabled=await user();await goal(disabled,'personal',{reminderTime:null});assert.equal(await sendSavingsReminders(disabled,new Date('2026-01-02T21:00:00-03:00'),async()=>1),0);
});

const edit=(userId, goal, more={}, space='personal')=>writeSavings(userId,space,'metas','PATCH',{
 id:goal.id,original:savingsDefinition(goal),name:goal.name,frequency:goal.frequency,mode:goal.mode,
 amount:(goal.amountCents/100).toFixed(2),startDay:goal.startDay,endDay:goal.endDay,reminderTime:goal.reminderTime,...more,
});
test('editing an unrecorded goal changes all fields without creating another goal',async()=>{
 const u=await user(),g=await goal(u);await edit(u,g,{name:'Viagem',frequency:'weekly',mode:'total',amount:'100',startDay:'2026-02-01',endDay:'2026-02-21',reminderTime:'19:30'});
 const goals=await listSavings(u,'personal');assert.equal(goals.length,1);const saved=goals[0];assert.equal(saved.id,g.id);assert.equal(saved.name,'Viagem');assert.equal(saved.periods.length,3);assert.equal(saved.totalCents,10000);assert.equal(saved.reminderTime,'19:30');
 await edit(u,saved,{reminderTime:null});assert.equal((await listSavings(u,'personal'))[0].reminderTime,null);
});
test('editing values and unrecorded deadline preserves saved and zero records and recalculates the preview',async()=>{
 const u=await user(),g=await goal(u);await record(u,g.id,'2026-01-01','12');await record(u,g.id,'2026-01-02','0');
 await edit(u,g,{amount:'20',endDay:'2026-01-04'});let saved=(await listSavings(u,'personal'))[0];assert.equal(saved.savedCents,1200);assert.equal(saved.totalCents,8000);assert.deepEqual(saved.periods.map(p=>p.savedCents),[1200,0,null,null]);
 await edit(u,saved,{endDay:'2026-01-02'});saved=(await listSavings(u,'personal'))[0];assert.equal(saved.periods.length,2);assert.equal(saved.savedCents,1200);assert.equal(saved.totalCents,4000);
});
test('editing cannot remove or change dates of a recorded period, including zero records',async()=>{
 const u=await user(),g=await goal(u);await record(u,g.id,'2026-01-02','0');
 for(const more of [{frequency:'weekly'},{startDay:'2026-01-03'},{endDay:'2026-01-01'}]) await assert.rejects(edit(u,g,more),e=>e.status===400);
 const saved=(await listSavings(u,'personal'))[0];assert.equal(saved.endDay,g.endDay);assert.equal(saved.periods[1].savedCents,0);
});
test('edits respect account/space isolation, reject outdated drafts, and accept identical retries',async()=>{
 const u=await user(),v=await user(),g=await goal(u);
 await assert.rejects(edit(v,g,{name:'Wrong'}),e=>e.status===404);await assert.rejects(edit(u,g,{name:'Wrong'},'business'),e=>e.status===404);
 await edit(u,g,{name:'Atual'});await edit(u,g,{name:'Atual'});await assert.rejects(edit(u,g,{amount:'50'}),e=>e.status===409);
 assert.equal((await listSavings(u,'personal'))[0].name,'Atual');assert.equal((await listSavings(u,'personal'))[0].amountCents,1000);
});
test('edited reminders use the new time or are disabled, while unchanged period logs keep deduplication',async()=>{
 const u=await user(),g=await goal(u);await edit(u,g,{reminderTime:'21:00'});let sends=0;const send=async()=>{sends++;return 1;};
 assert.equal(await sendSavingsReminders(u,new Date('2026-01-01T20:30:00-03:00'),send),0);assert.equal(await sendSavingsReminders(u,new Date('2026-01-01T21:00:00-03:00'),send),1);
 let saved=(await listSavings(u,'personal'))[0];await edit(u,saved,{name:'Novo nome'});assert.equal(await sendSavingsReminders(u,new Date('2026-01-01T21:10:00-03:00'),send),0);
 saved=(await listSavings(u,'personal'))[0];await edit(u,saved,{reminderTime:null});assert.equal(await sendSavingsReminders(u,new Date('2026-01-02T22:00:00-03:00'),send),0);assert.equal(sends,1);
});
test('changed unrecorded period boundaries can notify again at their new ending',async()=>{
 const u=await user(),g=await goal(u);const send=async()=>1;
 assert.equal(await sendSavingsReminders(u,new Date('2026-01-01T20:00:00-03:00'),send),1);
 await edit(u,g,{frequency:'weekly',endDay:'2026-01-07'});assert.equal(await sendSavingsReminders(u,new Date('2026-01-01T20:01:00-03:00'),send),0);assert.equal(await sendSavingsReminders(u,new Date('2026-01-07T20:00:00-03:00'),send),1);
});
test('opening the editor round-trips end dates across clamped months, leap days, weeks and days',()=>{
 for(const [start,n,unit] of [['2024-01-31',1,'months'],['2024-01-31',3,'months'],['2026-11-25',3,'months'],['2026-01-01',2,'weeks'],['2026-01-01',5,'days'],['2026-01-01',3660,'days']]){
  const end=savingsEnd(start,n,unit),inferred=savingsDuration(start,end);assert.equal(savingsEnd(start,inferred.value,inferred.unit),end);
 }
});
after(async()=>{await prisma.$disconnect();fs.rmSync(dir,{recursive:true,force:true});});
