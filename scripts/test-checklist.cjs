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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onerundred-checklist-test-'));
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
const { splitChecklistInput } = load(path.join(root, 'src/lib/checklist-input.ts'));
const { randomUUID } = require('node:crypto');
let seq = 0;
async function fixture() {
 const id='checklist-'+ ++seq;
 await prisma.user.create({data:{id,name:id,username:id,email:id+'@example.test',passwordHash:'not-a-login-hash'}});
 const board=await prisma.board.create({data:{userId:id,name:'Checklist'}});
 const list=await prisma.list.create({data:{boardId:board.id,name:'Lista',position:0}});
 const card=await prisma.card.create({data:{listId:list.id,title:'Tarefa',position:0,scheduledFor:'2026-11-24'}});
 return {userId:id,cardId:card.id};
}
const item=text=>({id:randomUUID(),text});
const rows=f=>prisma.checklistItem.findMany({where:{cardId:f.cardId},orderBy:{position:'asc'}});
test('typing leaves the unfinished item; paste submits the last name and ignores empty separators',()=>{
 assert.deepEqual(splitChecklistInput(' Um, Dois, rascunho'),{texts:['Um','Dois'],remainder:' rascunho'});
 assert.deepEqual(splitChecklistInput(' Um, , Dois, Três ',true),{texts:['Um','Dois','Três'],remainder:''});
 assert.deepEqual(splitChecklistInput(' ,,, ',true),{texts:[],remainder:''});
 assert.deepEqual(splitChecklistInput('Um só'),{texts:[],remainder:'Um só'});
});
test('batch saves ordered unchecked items, preserves duplicate names, and retry is idempotent',async()=>{
 const f=await fixture(),items=[item(' Um '),item('Dois'),item('Um')];
 await repo.addChecklistItems(f.userId,f.cardId,items);
 await repo.addChecklistItems(f.userId,f.cardId,items);
 const saved=await rows(f);assert.deepEqual(saved.map(i=>i.text),['Um','Dois','Um']);assert.deepEqual(saved.map(i=>i.position),[0,1,2]);assert(saved.every(i=>!i.done));
 assert.equal(await prisma.taskSession.count({where:{cardId:f.cardId}}),0);assert.equal(await prisma.workSession.count({where:{userId:f.userId}}),0);
});
test('limits reject the whole batch without partial additions or text truncation',async()=>{
 const f=await fixture();await repo.addChecklistItems(f.userId,f.cardId,Array.from({length:49},(_,i)=>item('Item '+i)));
 await assert.rejects(repo.addChecklistItems(f.userId,f.cardId,[item('50'),item('51')]),e=>e.status===400);assert.equal((await rows(f)).length,49);
 await assert.rejects(repo.addChecklistItems(f.userId,f.cardId,[item('x'.repeat(201))]),e=>e.status===400);assert.equal((await rows(f)).length,49);
 await repo.addChecklistItems(f.userId,f.cardId,[item('x'.repeat(200))]);assert.equal((await rows(f)).length,50);
 for(const raw of [null,{},[],[{}],[item('')],Array.from({length:51},()=>item('a'))]) await assert.rejects(repo.addChecklistItems(f.userId,f.cardId,raw),e=>e.status===400);
});
test('account boundaries and mismatched retry IDs are rejected',async()=>{
 const a=await fixture(),b=await fixture(),entry=item('Original');
 await assert.rejects(repo.addChecklistItems(b.userId,a.cardId,[entry]),e=>e.status===404);
 await repo.addChecklistItems(a.userId,a.cardId,[entry]);
 await assert.rejects(repo.addChecklistItems(a.userId,a.cardId,[{...entry,text:'Modificado'}]),e=>e.status===409);
 await assert.rejects(repo.addChecklistItems(b.userId,b.cardId,[entry]),e=>e.status===409);
 assert.deepEqual((await rows(a)).map(i=>i.text),['Original']);assert.equal((await rows(b)).length,0);
});
test('single item API and editing an existing item keep commas as literal text',async()=>{
 const f=await fixture();await repo.addChecklistItem(f.userId,f.cardId,'Um, dois');
 const row=(await rows(f))[0];assert.equal(row.text,'Um, dois');
 await repo.updateChecklistItem(f.userId,f.cardId,row.id,{text:'Novo, texto'});
 assert.deepEqual((await rows(f)).map(i=>i.text),['Novo, texto']);
});
after(async()=>{await prisma.$disconnect();fs.rmSync(dir,{recursive:true,force:true});});
