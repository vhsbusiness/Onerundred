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

const auth = load(path.join(root,'src/lib/auth.ts'));
const reminders=load(path.join(root,'src/lib/reminders.ts'));
const push=load(path.join(root,'src/lib/notifications.ts'));
const security=load(path.join(root,'src/lib/push-security.ts'));
const rate=load(path.join(root,'src/lib/security-rate.ts'));
const {safeLoginRedirect}=load(path.join(root,'src/lib/safe-redirect.ts'));
const sharing=load(path.join(root,'src/lib/sharing.ts'));
const collab=load(path.join(root,'src/lib/collaborators.ts'));
const collabBoards=load(path.join(root,'src/lib/collaboration-boards.ts'));
const {writeMap}=load(path.join(root,'src/lib/mind-undo.ts'));
const projects=load(path.join(root,'src/lib/projects.ts'));
const training=load(path.join(root,'src/lib/training.ts'));
const sleep=load(path.join(root,'src/lib/sleep.ts'));
const leisure=load(path.join(root,'src/lib/leisure.ts'));
const pass='Only-test-password-123';
let admin,a,b,board,list,card,image,recurring;
const forbidden = promise => assert.rejects(promise,e=>e.status===404||e.status===403);
const crypto=require('node:crypto');
const ec=crypto.createECDH('prime256v1');ec.generateKeys();
const sub={endpoint:'https://push.example.test/device-token',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};

test('concurrent bootstrap elects exactly one admin, all other registrations stay common',async()=>{
 const users=await Promise.all([1,2,3].map(i=>auth.registerUser({name:'Audit '+i,username:'audit'+i,email:'audit'+i+'@example.test',password:pass})));
 assert.equal(users.filter(u=>u.role==='admin').length,1);
 admin=users.find(u=>u.role==='admin');[a,b]=users.filter(u=>u.role==='user');
 board=await repo.createBoard(b.id,'Private B');const detail=await repo.getBoard(board.id,b.id);list=detail.lists[0];
 card=await repo.createCard(b.id,{listId:list.id,title:'B private card'});
 await repo.addCardImage(b.id,card.id,'data:image/png;base64,iVBORw0KGgo=');image=(await repo.getCard(card.id,b.id)).imageIds[0];
 recurring=await repo.createRecurring(b.id,{listId:list.id,title:'B recurring',weekdays:[0,1,2,3,4,5,6]});
});
test('private board/card/list/image/favorites APIs in backend reject another user and global admin',async()=>{
 for(const u of [a,admin]){
  await forbidden(repo.getBoard(board.id,u.id));await forbidden(repo.getCard(card.id,u.id));
  await forbidden(repo.updateBoard(board.id,u.id,{name:'tampered'}));await forbidden(repo.updateCard(card.id,u.id,{title:'tampered'}));
  await forbidden(repo.createCard(u.id,{listId:list.id,title:'tampered'}));await forbidden(repo.createList(u.id,{boardId:board.id,name:'tampered'}));
  await forbidden(repo.deleteCard(card.id,u.id));await forbidden(repo.deleteList(list.id,u.id));await forbidden(repo.deleteBoard(board.id,u.id));
  assert.equal(await repo.getCardImage(u.id,image),null);await forbidden(repo.setFavoriteBoards(u.id,[board.id]));
 }
 assert.equal((await repo.getCard(card.id,b.id)).title,'B private card');
 assert(!(await repo.listBoards(a.id)).some(x=>x.id===board.id));
});
test('checklist, image deletion, moves, list bulk actions and undo cannot cross board boundaries',async()=>{
 const own=await repo.createBoard(a.id,'A board'),d=await repo.getBoard(own.id,a.id),ownList=d.lists[0];
 const ownCard=await repo.createCard(a.id,{listId:ownList.id,title:'A card'});
 await forbidden(repo.moveCard(a.id,ownCard.id,list.id,0));await forbidden(repo.moveAllCards(ownList.id,list.id,a.id));
 await forbidden(repo.copyCard(a.id,card.id));await forbidden(repo.copyList(list.id,a.id));await forbidden(repo.archiveAllCards(list.id,a.id));
 await forbidden(repo.addChecklistItem(a.id,card.id,'bad'));await forbidden(repo.removeCardImage(a.id,card.id,image));
 await forbidden(repo.updateRecurring(a.id,recurring.recurring.id,{active:false}));await forbidden(repo.deleteRecurring(a.id,recurring.recurring.id));
 assert.equal((await repo.getCard(ownCard.id,a.id)).listId,ownList.id);
 // Undo records are server-side and scoped; a different user's history cannot be invoked.
 await repo.undoLast(a.id);assert(await repo.getCard(card.id,b.id));
});
test('shared member loses all task, image, recurring and reminder-linked data on revocation',async()=>{
 await sharing.inviteToBoard(b.id,board.id,a.username);const invite=(await sharing.listMyInvites(a.id))[0];
 await forbidden(sharing.respondInvite(b.id,invite.id,true));await sharing.respondInvite(a.id,invite.id,true);
 assert.equal((await repo.getCard(card.id,a.id)).id,card.id);
 await forbidden(sharing.inviteToBoard(a.id,board.id,admin.username));await forbidden(repo.deleteBoard(board.id,a.id));
 const reminder=await reminders.createReminder(a.id,{title:'Own reminder',at:new Date(Date.now()+3600000).toISOString(),cardId:card.id});
 const recurrence=await repo.createRecurring(a.id,{listId:list.id,title:'A shared recurrence',weekdays:[0,1,2,3,4,5,6]});
 await sharing.removeMember(b.id,board.id,a.id);await repo.updateCard(card.id,b.id,{title:'AFTER REVOKE'});
 assert.equal((await reminders.listReminders(a.id)).find(r=>r.id===reminder.id).card,null);
 assert.equal((await reminders.updateReminder(a.id,reminder.id,{note:'Still own reminder'})).card,null);
 await forbidden(reminders.updateReminder(a.id,reminder.id,{cardId:card.id}));
 await forbidden(repo.updateRecurring(a.id,recurrence.recurring.id,{active:false}));await forbidden(repo.deleteRecurring(a.id,recurrence.recurring.id));
 await forbidden(repo.getCard(card.id,a.id));assert.equal(await repo.getCardImage(a.id,image),null);
 await prisma.recurringTask.update({where:{id:recurrence.recurring.id},data:{lastSpawnedKey:null}});
 const before=await prisma.card.count({where:{recurringId:recurrence.recurring.id}});
 await repo.endWork(a.id);
 assert.equal(await prisma.card.count({where:{recurringId:recurrence.recurring.id}}),before,'revoked creator cannot spawn another occurrence');

});
test('collaboration is opt-in, read-only until explicitly approved, and revoked by owner',async()=>{
 const link=await collab.inviteCollaborator(a,b.username);await forbidden(collab.changeCollaboration(admin.id,link.id,'accept'));
 assert.equal((await collabBoards.collaborationBoards(a.id,b.id,link.id)).length,0);
 await collab.changeCollaboration(b.id,link.id,'accept');
 assert((await collabBoards.collaborationBoards(a.id,b.id,link.id)).some(x=>x.id===board.id&&!x.editable));
 await forbidden(repo.updateBoard(board.id,a.id,{name:'read-only bypass'}));
 const map=await repo.createBoard(b.id,'Private map','mindmap');await forbidden(writeMap(map.id,a.id,async()=>true));
 await collabBoards.requestBoardEdit(a.id,link.id,board.id);const request=(await collabBoards.pendingBoardRequests(b.id))[0];
 await forbidden(collabBoards.respondBoardRequest(a.id,request.id,true));await collabBoards.respondBoardRequest(b.id,request.id,true);
 await repo.updateBoard(board.id,a.id,{name:'Legitimate shared edit'});await sharing.removeMember(b.id,board.id,a.id);
 await collab.changeCollaboration(b.id,link.id,'remove');assert.equal((await collabBoards.collaborationBoards(a.id,b.id,link.id)).length,0);
});
test('personal projects/training/sleep/leisure/reminders/work sessions stay owner-scoped',async()=>{
 const project=await projects.createProject(b.id,{name:'Private project',description:'',obligations:'',startDate:'2026-11-14',days:5});
 await forbidden(projects.getProject(a.id,project.id));await forbidden(projects.updateProject(a.id,project.id,{name:'bad'}));await forbidden(projects.deleteProject(a.id,project.id));
 const t=await training.createTraining(b.id,{name:'Private training',workout:'running'});
 assert.equal(await training.readTraining(a.id,t.id),null);await forbidden(training.editTraining(a.id,t.id,{name:'bad'}));await forbidden(training.removeTraining(a.id,t.id));await forbidden(training.saveTrainingDay(a.id,t.id,{weekday:0,exercises:[]}));
 const r=await reminders.createReminder(b.id,{title:'B secret reminder',at:new Date(Date.now()+3600000).toISOString()});await forbidden(reminders.updateReminder(a.id,r.id,{note:'bad'}));await forbidden(reminders.deleteReminder(a.id,r.id));
 const s=await prisma.sleepLog.create({data:{userId:b.id,dayKey:'2026-11-10',bedAt:new Date('2026-11-09T23:00:00Z'),sleepAt:new Date('2026-11-10T00:00:00Z'),wakeAt:new Date('2026-11-10T08:00:00Z')}});await forbidden(sleep.deleteSleep(a.id,s.id));
 const l=await prisma.leisureLog.create({data:{userId:b.id,dayKey:'2026-11-10',startAt:new Date('2026-11-10T10:00:00Z'),endAt:new Date('2026-11-10T11:00:00Z'),activity:'Private'}});await forbidden(leisure.deleteLeisure(a.id,l.id));
 const w=await prisma.workSession.create({data:{userId:b.id,startedAt:new Date('2026-11-10T10:00:00Z'),endedAt:new Date('2026-11-10T11:00:00Z')}});await forbidden(repo.deleteWorkSession(a.id,w.id));
});
test('push rejects endpoint-only takeover and preserves legitimate automatic account switching',async()=>{
 assert.equal(security.validatePushSubscription(sub).endpoint,sub.endpoint);
 for(const endpoint of ['http://push.example.test/x','https://localhost/x','https://127.1/x','https://2130706433/x','https://[::1]/x','https://[::ffff:127.0.0.1]/x','https://169.254.169.254/x','https://10.0.0.1/x','https://a:b@push.example.test/x']) assert.throws(()=>security.pushEndpoint(endpoint));
 for(const ip of ['127.0.0.1','0.0.0.0','10.1.2.3','100.64.0.1','172.16.0.1','192.168.1.1','169.254.1.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:8.8.8.8','2001:db8::1','2002::1']) assert.equal(security.publicPushAddress(ip),false,ip);
 assert(security.publicPushAddress('8.8.8.8'));assert(security.publicPushAddress('2606:4700:4700::1111'));
 assert.throws(()=>security.validatePushSubscription({...sub,keys:{p256dh:'bad',auth:'bad'}}));
 await push.subscribe(a.id,sub,'QA A');await push.subscribe(a.id,sub,'QA updated');
 const attacker=crypto.createECDH('prime256v1');attacker.generateKeys();
 const forged={...sub,keys:{p256dh:attacker.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
 await assert.rejects(push.subscribe(b.id,forged,'Forged device'),e=>e.status===409);
 assert.equal((await prisma.pushSubscription.findUnique({where:{endpoint:sub.endpoint}})).userId,a.id);
 await push.unsubscribe(b.id,sub.endpoint);assert.equal(await prisma.pushSubscription.count({where:{endpoint:sub.endpoint}}),1);
 await push.subscribe(b.id,sub,'Same browser, switched account');assert.equal((await prisma.pushSubscription.findUnique({where:{endpoint:sub.endpoint}})).userId,b.id);
 await push.unsubscribe(a.id,sub.endpoint);assert.equal(await prisma.pushSubscription.count({where:{endpoint:sub.endpoint}}),1);
});
test('push transport rejects private or mixed DNS and pins exact checked address without live requests',async()=>{
 const dns=require('node:dns/promises'),real=dns.lookup;
 // pushAgent captures the promise API object; changing lookup tests resolution at the actual transport callback.
 const check=(addresses,options={})=>new Promise(resolve=>{
  dns.lookup=async()=>addresses;security.pushAgent.options.lookup('rebinding.example.test',options,(error,address,family)=>resolve({error,address,family}));
 });
 try{
  assert((await check([{address:'127.0.0.1',family:4}])).error);
  assert((await check([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}])).error);
  const valid=await check([{address:'8.8.8.8',family:4}]);assert.equal(valid.error,null);assert.equal(valid.address,'8.8.8.8');
  const all=await check([{address:'8.8.8.8',family:4}],{all:true});assert.deepEqual(all.address,[{address:'8.8.8.8',family:4}]);
 }finally{dns.lookup=real;}
});
test('sessions reject arbitrary/expired/revoked tokens, password change invalidates other sessions',async()=>{
 assert.equal(await auth.userFromSession('forged'),null);const token=await auth.createSession(a.id),other=await auth.createSession(a.id);
 assert.equal((await auth.userFromSession(token)).id,a.id);await auth.changePassword(a.id,pass,'New-test-password-123',token);assert.equal(await auth.userFromSession(other),null);assert(await auth.userFromSession(token));
 await prisma.authSession.update({where:{id:token},data:{expiresAt:new Date(0)}});assert.equal(await auth.userFromSession(token),null);
 const dead=await auth.createSession(b.id);await auth.destroySession(dead);assert.equal(await auth.userFromSession(dead),null);
 const disabled=await auth.createSession(b.id);await prisma.user.update({where:{id:b.id},data:{active:false}});assert.equal(await auth.userFromSession(disabled),null);await prisma.user.update({where:{id:b.id},data:{active:true}});
});
test('login aliases share the ten-attempt limit and database counters enforce concurrent requests',async()=>{
 const previous=process.env.RAILWAY_ENVIRONMENT_ID;
 try {
  delete process.env.RAILWAY_ENVIRONMENT_ID;
  assert.equal(rate.registrationNetwork(new Request('http://localhost',{headers:{'x-real-ip':'8.8.8.8'}})),'unknown-network');
  process.env.RAILWAY_ENVIRONMENT_ID='test-only';
  assert.equal(rate.registrationNetwork(new Request('http://localhost',{headers:{'x-real-ip':'8.8.8.8','x-forwarded-for':'1.2.3.4'}})),'8.8.8.8');
 } finally { if(previous===undefined)delete process.env.RAILWAY_ENVIRONMENT_ID;else process.env.RAILWAY_ENVIRONMENT_ID=previous; }
 for(let i=0;i<10;i++)await assert.rejects(auth.authenticate(i%2?b.email:b.username,'wrong'),e=>e.status===401);
 await assert.rejects(auth.authenticate(b.username,pass),e=>e.status===429);
 const successes=await Promise.allSettled(Array.from({length:15},()=>rate.consumeAuthAttempt('register','concurrency-test',20)));
 assert.equal(successes.filter(x=>x.status==='fulfilled').length,15);
 for(let i=0;i<5;i++)await rate.consumeAuthAttempt('register','concurrency-test',20);
 await assert.rejects(rate.consumeAuthAttempt('register','concurrency-test',20),e=>e.status===429);
});
test('redirect validation preserves legitimate local links, rejects authority changes and control characters',()=>{
 for(const v of ['//evil.example','/\\evil.example','/ /evil.example','/\n/evil.example','https://evil.example','javascript:alert(1)',null])assert.equal(safeLoginRedirect(v),'/');
 assert.equal(safeLoginRedirect('/quadros/abc?card=id'),'/quadros/abc?card=id');
});
test('configuration errors do not echo a credential-bearing database URL',()=>{
 let error;
 try { execFileSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'validate'],{cwd:root,env:{...process.env,DATABASE_URL:'wrong://audit:ONLY_FAKE_SECRET_VALUE@example.test/db'},stdio:['ignore','pipe','pipe']}); }
 catch(e){error=e;}
 assert(error);assert(!String(error.stderr).includes('ONLY_FAKE_SECRET_VALUE'));
});
test('streamed JSON is bounded even without Content-Length and preserves the maximum-size status',async()=>{
 const api=load(path.join(root,'src/lib/api.ts'));
 const bytes=new TextEncoder().encode(JSON.stringify({data:'x'.repeat(200)}));
 const req=new Request('http://localhost/api/test',{method:'POST',headers:{'content-type':'application/json'},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),duplex:'half'});
 await assert.rejects(api.readBody(req,100),e=>e.status===413);
 for(const value of [null,[],123,'string'])await assert.rejects(api.readBody(new Request('http://localhost/api/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)})),e=>e.status===400);
 const originReq=new Request('http://localhost/api/test',{method:'POST',headers:{host:'localhost',origin:'https://localhost','x-forwarded-proto':'https'}});
 assert.doesNotThrow(()=>api.assertSameOrigin(originReq));
});
after(async()=>{await prisma.$disconnect();fs.rmSync(dir,{recursive:true,force:true});});
