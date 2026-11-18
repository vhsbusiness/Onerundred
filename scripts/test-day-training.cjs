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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onerundred-day-training-test-'));
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
    if (p === 'openai') return FakeOpenAI;
    return req(p);
  }, module, file, path.dirname(file));
  return module.exports;
}

let sent;
class FakeOpenAI { chat = { completions: { create: async input => {
  sent = input;
  return {choices:[{message:{content:JSON.stringify({score:75, headline:'Treino e rotina registrados', assessment:'Resumo simulado para testar o fluxo.', suggestions:[], nextTasks:[], schedule:{startWork:'',stopWork:'',breakAt:[],sleepAt:'',wakeAt:'',note:''}, memorySummary:'Histórico de teste', activitySummary:[{label:'injetado',value:'não aceitar'}]})}}]};
}}}; }
const { prisma } = load(path.join(root, 'src/lib/db.ts'));
const ai = load(path.join(root, 'src/lib/ai.ts'));
const { getDayActivities } = load(path.join(root, 'src/lib/ai-day-activities.ts'));
const training = load(path.join(root, 'src/lib/training.ts'));
const { restoreTrainingSession, emptyTrainingSession } = load(path.join(root, 'src/lib/training-session.ts'));
const { trainingPlanLabel, TRAINING_ORDER } = load(path.join(root, 'src/lib/training-types.ts'));
const { randomUUID } = require('node:crypto');
const RealDate = Date;
const clock = new RealDate('2026-11-18T15:00:00-03:00').getTime();
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const day='2026-11-18', old='2026-10-01';
let seq=0;
async function user() { const id='qa-day-'+ ++seq; return prisma.user.create({data:{id,name:id,username:id,email:id+'@example.test',passwordHash:'not-a-login-hash'}}); }
const exercise=(name='Supino')=>({name,sets:3,reps:'10–12',weightKg:20});
async function project(userId) { return training.createTraining(userId,{name:'Academia',workout:'strength'}); }

test('full-day evidence respects account and activity date, including archived projects and late goal marks',async()=>{
 const a=await user(),b=await user(), p=await project(a.id), other=await project(b.id);
 await training.saveTrainingDay(a.id,p.id,{weekday:1,exercises:[exercise('Somente planejado')]});
 const body={id:randomUUID(),dayKey:old,sport:'strength',planSlot:2,durationSeconds:2700,exercises:[exercise()]};
 await training.recordTraining(a.id,p.id,body);
 await training.recordTraining(b.id,other.id,{...body,id:randomUUID(),exercises:[exercise('OUTRA CONTA')]});
 await training.recordTraining(a.id,p.id,{...body,id:randomUUID(),dayKey:day,exercises:[exercise('HOJE')]});
 await training.editTraining(a.id,p.id,{archived:true});
 const goal=await prisma.project.create({data:{userId:a.id,name:'Leitura',workout:null,startDate:old,days:1,archivedAt:new Date(),checks:{create:{dayKey:old,done:true,markedAt:new Date()}}}});
 await prisma.dietProject.create({data:{userId:a.id,name:'Dieta',days:{create:{dayKey:old,meals:{create:[{name:'Almoço',time:'12:00',foods:'Arroz',eaten:true,calories:500},{name:'Jantar',time:'19:00',foods:'Feijão',eaten:false}]}}}}});
 for(const space of ['personal','business']) {
  const account=await prisma.financeAccount.create({data:{userId:a.id,space,name:space}});
  await prisma.financeEntry.createMany({data:[{accountId:account.id,dayKey:old,kind:'income',title:'Entrada',category:'renda',cents:10000,settled:true},{accountId:account.id,dayKey:old,kind:'transfer',title:'Transferência',category:'',cents:5000,settled:true},{accountId:account.id,dayKey:old,kind:'expense',title:'Prevista',category:'outros',cents:2500,settled:false}]});
 }
 const c=await getDayActivities(a.id,old);
 assert.equal(c.payload.treinos.length,1);assert.equal(c.payload.treinos[0].treino,'Treino B');
 assert.equal(c.payload.treinos[0].duracaoSegundos,2700);assert.equal(c.payload.treinos[0].exerciciosRealizados[0].name,'Supino');
 assert.equal(c.payload.metas[0].estado,'cumprida'); assert.equal(c.payload.dietas[0].refeicoes.filter(m=>m.consumida).length,1);
 assert.equal(c.payload.financeiro.length,2);for(const f of c.payload.financeiro){assert.equal(f.receitasRecebidasCentavos,10000);assert.equal(f.despesasPagasCentavos,0);assert.equal(f.transferencias,1);}
 const current=await getDayActivities(a.id,day);assert.equal(current.payload.treinos[0].exerciciosRealizados[0].name,'HOJE');assert.equal(current.payload.metas.length,0);assert.equal(current.payload.dietas.length,0);
 assert.equal((await getDayActivities(b.id,old)).payload.metas.length,0);
 await prisma.projectDay.update({where:{projectId_dayKey:{projectId:goal.id,dayKey:old}},data:{done:false,auto:true}});
 assert.equal((await getDayActivities(a.id,old)).payload.metas[0].estado,'nao_registrada');
});

test('plans and unchecked meals are not completed activities; today goals remain pending',async()=>{
 const a=await user(),p=await project(a.id);
 await training.saveTrainingDay(a.id,p.id,{weekday:3,exercises:[exercise()]});
 await prisma.project.create({data:{userId:a.id,name:'Meta',startDate:day,days:30}});
 await prisma.dietProject.create({data:{userId:a.id,name:'Planejado',days:{create:{dayKey:day,meals:{create:{name:'Jantar',time:'20:00',foods:'Sopa'}}}}}});
 const c=await getDayActivities(a.id,day);assert.equal(c.hasActivity,false);assert.equal(c.payload.treinos.length,0);assert.equal(c.payload.metas[0].estado,'aguardando_registro');assert.equal(c.payload.dietas[0].refeicoes[0].consumida,false);
});

test('analysis receives activity evidence and stores trusted summary, without changing task scores',async()=>{
 process.env.OPENAI_API_KEY='local-mock-not-a-secret';
 for(const key of ['aiMinDaysTasks','aiMinDaysWork','aiMinNightsSleep','aiMinDaysLeisure']) await prisma.appSetting.upsert({where:{key},create:{key,value:'0'},update:{value:'0'}});
 const a=await user(),p=await project(a.id);
 await training.recordTraining(a.id,p.id,{id:randomUUID(),dayKey:day,sport:'strength',planSlot:1,durationSeconds:1800,exercises:[exercise()]});
 const status=await ai.getAiStatus(a.id,day);assert.equal(status.hasDayActivity,true);assert.equal(status.observation.coreReady,true);
 const observation=await ai.getObservation(a.id),context=await ai.buildContext(a.id,observation,day);
 assert.equal(context.payload.trabalhadoHojeMin,0);assert.equal(context.payload.tarefasDeHoje.length,0);assert.equal(context.payload.atividadesDoDia.treinos.length,1);
 const result=await ai.generateInsight(a.id,day);
 assert(sent.messages[1].content.includes('exerciciosRealizados'));assert(sent.messages[0].content.includes('Não diga que o usuário não fez nada'));
 assert(result.activitySummary.some(s=>s.label==='Treinos'));assert(!result.activitySummary.some(s=>s.label==='injetado'));
 assert.deepEqual((await ai.getAiStatus(a.id,day)).insight.activitySummary,result.activitySummary);
});

test('retrospective uses the selected day for sleep, leisure, workouts and overnight work',async()=>{
 const a=await user(),p=await project(a.id);
 await training.recordTraining(a.id,p.id,{id:randomUUID(),dayKey:old,sport:'running',durationSeconds:1800,distanceMeters:5000});
 for(const [key,hours] of [[old,8],[day,5]]) {
  await prisma.sleepLog.create({data:{userId:a.id,dayKey:key,bedAt:new Date(key+'T00:00:00-03:00'),sleepAt:new Date(key+'T00:00:00-03:00'),wakeAt:new Date(key+'T0'+hours+':00:00-03:00')}});
  await prisma.leisureLog.create({data:{userId:a.id,dayKey:key,activity:key===old?'Leitura':'NOVO',startAt:new Date(key+'T10:00:00-03:00'),endAt:new Date(key+'T10:30:00-03:00')}});
 }
 await prisma.workSession.create({data:{userId:a.id,startedAt:new Date(old+'T23:00:00-03:00'),endedAt:new Date('2026-10-02T01:00:00-03:00')}});
 const c=await ai.buildContext(a.id,await ai.getObservation(a.id),old);
 assert.equal(c.payload.trabalhadoHojeMin,120);assert.equal(c.payload.sono.mediaDormidoMin7Dias,480);assert.equal(c.payload.sono.ultimasNoites.length,1);
 assert.equal(c.payload.lazer.hojeMin,30);assert.equal(c.payload.lazer.porAtividade7Dias[0].activity,'Leitura');assert.equal(c.payload.atividadesDoDia.treinos[0].distanciaMetros,5000);
 assert.equal(c.payload.notaSemana,null);assert.deepEqual(c.payload.tarefasFuturas,[]);
});

test('A–G keeps legacy plans and draft, selected training stays independent of date',async()=>{
 assert.deepEqual(TRAINING_ORDER.map(trainingPlanLabel),['Treino A','Treino B','Treino C','Treino D','Treino E','Treino F','Treino G']);
 const plans=[{weekday:2,exercises:[exercise('Remada')]}];
 const oldDraft={...emptyTrainingSession('2026-11-17'),version:1,planSlot:undefined,checked:[0],startedAt:123,elapsedMs:100};
 const restored=restoreTrainingSession(JSON.stringify(oldDraft),day,plans);assert.equal(restored.planSlot,2);assert.equal(restored.draft[0].name,'Remada');assert.deepEqual(restored.checked,[0]);assert.equal(restored.startedAt,123);
 assert.equal(restoreTrainingSession(JSON.stringify({...restored,date:day}),day,plans).planSlot,2);
});

test('saved log remembers division, keeps snapshot and rejects invalid slots/other accounts',async()=>{
 const a=await user(),b=await user(),p=await project(a.id);
 const body={id:randomUUID(),dayKey:day,sport:'strength',planSlot:2,durationSeconds:300,exercises:[exercise()]};
 await training.recordTraining(a.id,p.id,body); await training.recordTraining(a.id,p.id,body);
 assert.equal((await training.readTraining(a.id,p.id)).logs.length,1);
 await training.saveTrainingDay(a.id,p.id,{weekday:2,exercises:[exercise('Alterado')]});
 assert.equal((await training.readTraining(a.id,p.id)).logs[0].exercises[0].name,'Supino');
 assert.equal((await training.readTraining(a.id,p.id)).logs[0].planSlot,2);
 await assert.rejects(training.recordTraining(a.id,p.id,{...body,planSlot:7}),e=>e.status===400);
 await assert.rejects(training.recordTraining(a.id,p.id,{...body,planSlot:1}),e=>e.status===409);
 await assert.rejects(training.recordTraining(b.id,p.id,{...body,id:randomUUID()}),e=>e.status===404);
});

after(async()=>{global.Date=RealDate;await prisma.$disconnect();fs.rmSync(dir,{recursive:true,force:true});});
