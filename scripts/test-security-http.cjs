// Integration tests against an EMPTY, disposable SQLite database; never uses a user database.
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

const {spawn}=require('node:child_process');
const auth=load(path.join(root,'src/lib/auth.ts'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const users=await Promise.all([1,2,3].map(i=>auth.registerUser({name:'HTTP audit '+i,username:'httpaudit'+i,email:'httpaudit'+i+'@example.test',password:'Audit-only-pass-123'})));
 const admin=users.find(u=>u.role==='admin'),[a,b]=users.filter(u=>u.role==='user');
 const tokens=Object.fromEntries(await Promise.all(users.map(async u=>[u.id,await auth.createSession(u.id)])));
 const board=await repo.createBoard(b.id,'HTTP-B-PRIVATE-BOARD'),boardA=await repo.createBoard(a.id,'HTTP-A-BOARD');
 const detail=await repo.getBoard(board.id,b.id),detailA=await repo.getBoard(boardA.id,a.id),list=detail.lists[0],listA=detailA.lists[0];
 const card=await repo.createCard(b.id,{listId:list.id,title:'HTTP-B-PRIVATE-CARD'}),cardA=await repo.createCard(a.id,{listId:listA.id,title:'HTTP-A-CARD'});
 await repo.addCardImage(b.id,card.id,'data:image/png;base64,iVBORw0KGgo=');const image=(await repo.getCard(card.id,b.id)).imageIds[0];
 const map=await repo.createBoard(b.id,'HTTP-B-MAP','mindmap'),mapA=await repo.createBoard(a.id,'HTTP-A-MAP','mindmap');const node=(await repo.getBoard(map.id,b.id)).mindNodes[0];
 const rec=await repo.createRecurring(b.id,{listId:list.id,title:'HTTP-B-RECURRING',weekdays:[0,1,2,3,4,5,6]});
 const reminder=await prisma.reminder.create({data:{userId:b.id,title:'HTTP-B-PRIVATE-REMINDER',at:new Date(Date.now()+3600000)}});
 const project=await prisma.project.create({data:{userId:b.id,name:'HTTP-B-PRIVATE-PROJECT',startDate:'2026-11-14',days:5}});
 const training=await prisma.project.create({data:{userId:b.id,name:'HTTP-B-PRIVATE-TRAINING',workout:'running',startDate:'2026-11-14',days:0}});
 const leisure=await prisma.leisureLog.create({data:{userId:b.id,dayKey:'2026-11-10',startAt:new Date('2026-11-10T10:00:00Z'),endAt:new Date('2026-11-10T11:00:00Z')}});
 const sleepLog=await prisma.sleepLog.create({data:{userId:b.id,dayKey:'2026-11-10',bedAt:new Date('2026-11-09T23:00:00Z'),sleepAt:new Date('2026-11-10T00:00:00Z'),wakeAt:new Date('2026-11-10T08:00:00Z')}});
 const work=await prisma.workSession.create({data:{userId:b.id,startedAt:new Date('2026-11-10T10:00:00Z'),endedAt:new Date('2026-11-10T11:00:00Z')}});
 const port=Number(process.env.SECURITY_TEST_PORT||3244),base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production',OPENAI_API_KEY:'',VAPID_PRIVATE_KEY:'',VAPID_PUBLIC_KEY:'',CRON_SECRET:'',DISABLE_NOTIFICATION_SCHEDULER:'1'},stdio:['ignore','ignore','ignore']});
 let checks=0;const check=(value,message)=>{assert(value,message);checks++};
 const request=async(method,url,body,user=a,extra={})=>fetch(base+url,{method,redirect:'manual',headers:{...(user?{cookie:'onerundred_session='+tokens[user.id]}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/login')).ok)break;}catch{}if(server.exitCode!==null)throw Error('Isolated server exited');if(i===99)throw Error('Server unavailable');await sleep(100);}
  const files=[];function walk(d){for(const n of fs.readdirSync(d)){const f=path.join(d,n);if(fs.statSync(f).isDirectory())walk(f);else if(n==='route.ts')files.push(f);}}walk(path.join(root,'src/app/api'));
  let denied=0;
  for(const f of files){const source=fs.readFileSync(f,'utf8');for(const match of source.matchAll(/export const (GET|POST|PATCH|PUT|DELETE) = (withUser|withAccess|withAdmin|handle)/g)){
   const [,method,guard]=match;if(guard==='handle'&&!f.includes('/imagens/'))continue;
   const url='/api/'+path.relative(path.join(root,'src/app/api'),f).split(path.sep).join('/').replace('/route.ts','').replace(/\[[^\]]+\]/g,'not-authorized');
   for(const forged of [false,true]){const r=await request(method,url,method==='GET'?undefined:{},null,forged?{cookie:'onerundred_session='+'0'.repeat(64)}:{});check(r.status===401,method+' '+url+' should reject anonymous/forged, got '+r.status);denied++;}
  }}
  console.log('Anonymous/forged HTTP guards:',denied,'checks');
  const cases=[
   ['GET',`/api/boards/${board.id}`],['PATCH',`/api/boards/${board.id}`,{name:'bad'}],['DELETE',`/api/boards/${board.id}`],
   ['POST','/api/lists',{boardId:board.id,name:'bad'}],['PATCH',`/api/lists/${list.id}`,{name:'bad'}],['DELETE',`/api/lists/${list.id}`],
   ['POST',`/api/lists/${list.id}/acoes`,{action:'copy'}],['POST',`/api/lists/${listA.id}/acoes`,{action:'moveCards',toListId:list.id}],
   ['POST','/api/cards',{listId:list.id,title:'bad'}],['GET',`/api/cards/${card.id}`],['PATCH',`/api/cards/${card.id}`,{title:'bad'}],['DELETE',`/api/cards/${card.id}`],
   ['POST','/api/cards/move',{cardId:cardA.id,toListId:list.id,toIndex:0}],['POST',`/api/cards/${card.id}/acoes`,{action:'copy'}],
   ['POST',`/api/cards/${card.id}/checklist`,{text:'bad'}],['POST',`/api/cards/${card.id}/imagens`,{image:'data:image/png;base64,iVBORw0KGgo='}],
   ['POST',`/api/cards/${card.id}/timer`,{action:'start'}],['GET',`/api/imagens/${image}`],
   ['PUT','/api/boards/favoritos',{ids:[board.id]}],['GET',`/api/boards/${board.id}/etiquetas`],
   ['POST',`/api/boards/${board.id}/compartilhar`,{username:admin.username}],
   ['POST',`/api/boards/${board.id}/importar`,{images:['data:image/png;base64,iVBORw0KGgo=']}],
   ['PUT',`/api/boards/${board.id}/importar`,{plan:{boardId:board.id,lists:[]}}],
   ['POST',`/api/boards/${map.id}/mapa`,{detached:true,title:'bad',x:0,y:0}],['PATCH',`/api/boards/${map.id}/mapa`,{id:node.id,title:'bad'}],['DELETE',`/api/boards/${map.id}/mapa`,{id:node.id}],
   ['POST',`/api/boards/${map.id}/mapa/selecao`,{ids:[node.id],action:'delete'}],['POST',`/api/boards/${map.id}/mapa/estrutura`,{action:'organize'}],
   ['POST',`/api/boards/${map.id}/mapa/desfazer`,{actionId:1}],['POST',`/api/boards/${map.id}/mapa/refazer`,{actionId:1}],
   ['PATCH',`/api/boards/${mapA.id}/mapa`,{id:node.id,title:'cross-map'}],
   ['PATCH',`/api/recorrentes/${rec.recurring.id}`,{active:false}],['DELETE',`/api/recorrentes/${rec.recurring.id}`],
   ['PATCH',`/api/lembretes/${reminder.id}`,{title:'bad'}],['DELETE',`/api/lembretes/${reminder.id}`],
   ['GET',`/api/projetos/${project.id}`],['PATCH',`/api/projetos/${project.id}`,{name:'bad'}],['DELETE',`/api/projetos/${project.id}`],['POST',`/api/projetos/${project.id}/dias`,{dayKey:'2026-11-13',done:true}],
   ['PATCH',`/api/treinos/${training.id}`,{name:'bad'}],['DELETE',`/api/treinos/${training.id}`],['PUT',`/api/treinos/${training.id}/plano`,{weekday:0,exercises:[]}],
   ['POST',`/api/treinos/${training.id}/registros`,{id:require('node:crypto').randomUUID(),dayKey:'2026-11-13',sport:'running',durationSeconds:60,distanceMeters:100}],
   ['DELETE',`/api/sono/${sleepLog.id}`],['DELETE',`/api/lazer/${leisure.id}`],['DELETE',`/api/work/${work.id}`],['POST',`/api/work/${work.id}/analise`,{}],
  ];
  for(const [method,url,body]of cases){const r=await request(method,url,body);check(r.status===403||r.status===404,method+' '+url+' cross-user expected denial, got '+r.status+' '+await r.text());}
  for(const [method,url,body]of [['GET','/api/admin/users'],['GET','/api/admin/settings'],['PATCH','/api/admin/settings',{allowRegistration:false}],['PATCH',`/api/admin/users/${a.id}`,{role:'admin'}],['DELETE',`/api/admin/users/${b.id}`]]){const r=await request(method,url,body);check(r.status===403,'Admin function denial '+url);}
  check((await request('GET','/api/admin/users',undefined,admin)).ok,'Legitimate admin overview');
  for(const url of ['/api/boards','/api/boards?listas=1','/api/dashboard','/api/performance','/api/settings','/api/lembretes','/api/lembretes?tarefas=1','/api/projetos','/api/sono','/api/lazer','/api/arquivadas','/api/undo','/api/ai/insight','/api/notificacoes']){const r=await request('GET',url);check(r.ok,'Own list '+url+' '+r.status);check(!(await r.text()).includes('HTTP-B-PRIVATE'),'Private marker leaked '+url);}
  let r=await request('PATCH','/api/auth/me',{name:'A renamed',userId:b.id,role:'admin'});check(r.ok,'Profile update');let current=await r.json();check(current.id===a.id&&current.role==='user','Mass assignment profile');
  r=await request('POST','/api/boards',{name:'Mass assignment board',userId:b.id});check(r.ok,'Board creation');const made=await r.json();check((await prisma.board.findUnique({where:{id:made.id}})).userId===a.id,'Mass assignment owner');
  r=await request('PATCH','/api/settings',{theme:'light',userId:b.id});check(r.ok,'Own settings');check((await repo.getSettings(b.id)).theme!=='light','Settings ownership');
  r=await request('PATCH','/api/auth/me',{name:'CSRF changed'},a,{origin:'https://evil.example'});check(r.status===403,'Foreign Origin');
  r=await request('POST','/api/auth/login',{identifier:a.username,password:'Audit-only-pass-123'},null,{origin:'https://evil.example'});check(r.status===403&&!r.headers.get('set-cookie'),'Login CSRF');
  r=await request('POST','/api/work',{action:'start'},a,{'sec-fetch-site':'cross-site'});check(r.status===403,'Fetch Metadata CSRF');
  r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({identifier:a.username,password:'Audit-only-pass-123'})});check(r.status===415,'Simple form JSON rejected');
  r=await request('PATCH','/api/auth/me',null);check(r.status===400,'null JSON rejected');
  r=await request('PATCH','/api/auth/me',{name:'x'.repeat(2*1024*1024+1)});check(r.status===413,'Oversized JSON rejected');
  r=await request('POST','/api/auth/login',{identifier:{$ne:''},password:{$ne:''}},null);check(r.status===400,'NoSQL-style objects rejected');
  r=await request('POST','/api/auth/login',{identifier:a.username,password:'Audit-only-pass-123'},null,{origin:base});check(r.ok,'Legitimate login');const cookies=r.headers.get('set-cookie');check(/HttpOnly/i.test(cookies)&&/Secure/i.test(cookies)&&/SameSite=lax/i.test(cookies),'Cookie flags');
  const login=await r.json();check(!('passwordHash'in login),'No password hash in response');
  r=await request('GET',`/api/imagens/${image}`,undefined,b);check(r.ok&&r.headers.get('cache-control')==='private, no-store','Private image not reusable from HTTP cache');
  r=await fetch(base+'/login');check(r.headers.get('x-frame-options')==='DENY'&&r.headers.get('x-content-type-options')==='nosniff','Browser headers');
  check(!r.headers.get('x-powered-by'),'Framework banner removed');check(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"),'CSP framing restriction');
  check((await request('GET',`/api/cards/${card.id}`,undefined,b)).ok,'Owner still reads private card');
  for(const url of ['/admin','/quadros/'+board.id,'/metas/'+project.id]){r=await request('GET',url,undefined,a);check(r.status===404||[302,303,307,308].includes(r.status),'Page authorization '+url+' '+r.status);}
  // Reading or prefetching a shared board must never change either account's last visit.
  const shared=await repo.createBoard(a.id,'SHARED-REMEMBER-TEST');
  await prisma.boardMember.create({data:{boardId:shared.id,userId:b.id}});
  check((await request('POST',`/api/boards/${boardA.id}/abrir`,{viewerId:a.id})).ok,'Remember own board visit');
  check((await request('POST',`/api/boards/${shared.id}/abrir`,{viewerId:b.id},b)).ok,'Remember member visit');
  check((await request('GET','/api/boards/ultimo')).headers.get('cache-control')==='no-store','Last destination is never cached');
  check((await (await request('GET','/api/boards/ultimo')).json()).id===boardA.id,'Member visit preserves owner history');
  check((await (await request('GET','/api/boards/ultimo',undefined,b)).json()).id===shared.id,'Member has own last board');
  await request('GET',`/api/boards/${shared.id}`);
  await request('GET',`/quadros/${shared.id}`,undefined,a,{'next-router-prefetch':'1'});
  check(await repo.lastBoardId(a.id)===boardA.id,'API reads and page prefetch do not count as visits');
  check((await request('POST',`/api/boards/${shared.id}/abrir`,{viewerId:b.id})).status===403,'Stale tab from different account cannot record a visit');
  check((await request('POST',`/api/boards/${board.id}/abrir`,{viewerId:a.id})).status===404,'Cannot remember inaccessible board');
  await prisma.boardMember.deleteMany({where:{boardId:shared.id,userId:b.id}});
  check(await repo.lastBoardId(b.id)===null,'Revoked board is not returned as last destination');
  // Favorites are personal, idempotent, and do not overwrite unrelated concurrent favorites.
  const trainingA=await prisma.project.create({data:{userId:a.id,name:'Favorite training',workout:'strength',startDate:'2026-11-17',days:0}});
  const dietA=await prisma.dietProject.create({data:{userId:a.id,name:'Favorite diet'}});
  const saved=await Promise.all([
    request('PATCH','/api/projetos/favoritos',{id:trainingA.id,kind:'training',favorite:true}),
    request('PATCH','/api/projetos/favoritos',{id:dietA.id,kind:'diet',favorite:true}),
  ]);
  check(saved.every(r=>r.ok),'Concurrent favorites both saved');
  check((await (await request('GET','/api/projetos/favoritos')).json()).length===2,'Concurrent additions preserved');
  check((await (await request('GET','/api/projetos/favoritos',undefined,b)).json()).length===0,'Favorites isolated by account');
  check((await request('PATCH','/api/projetos/favoritos',{id:training.id,kind:'training',favorite:true})).status===404,'Cannot favorite another account project');
  await request('PATCH','/api/projetos/favoritos',{id:trainingA.id,kind:'training',favorite:true});
  check((await (await request('GET','/api/projetos/favoritos')).json()).length===2,'Favorite operation is idempotent');
  await prisma.project.update({where:{id:trainingA.id},data:{name:'Renamed favorite'}});
  check((await (await request('GET','/api/projetos/favoritos')).json()).some(p=>p.name==='Renamed favorite'),'Favorite name stays current');
  await prisma.project.update({where:{id:trainingA.id},data:{archivedAt:new Date()}});
  check((await (await request('GET','/api/projetos/favoritos')).json()).length===1,'Archived project omitted');
  await request('PATCH','/api/projetos/favoritos',{id:trainingA.id,kind:'training',favorite:false});
  await prisma.dietProject.delete({where:{id:dietA.id}});
  check((await (await request('GET','/api/projetos/favoritos')).json()).length===0,'Deleted project omitted');
  // A browser may send an Origin/Host matching its public HTTPS name behind the reverse proxy.
  const loginSession=await request('POST','/api/auth/login',{identifier:a.username,password:'Audit-only-pass-123'},null);
  const freshCookie=loginSession.headers.get('set-cookie').split(';')[0];
  r=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie:freshCookie}});check(r.ok,'Logout succeeds');
  r=await fetch(base+'/api/auth/me',{headers:{cookie:freshCookie}});check((await r.json()).user===null,'Logged-out token cannot be reused');
  // Expired tokens are rejected through real HTTP, not just the backend helper.
  const expired=await auth.createSession(a.id);await prisma.authSession.update({where:{id:expired},data:{expiresAt:new Date(0)}});
  r=await fetch(base+'/api/boards',{headers:{cookie:'onerundred_session='+expired}});check(r.status===401,'Expired HTTP session rejected');
  const vulnerableOrigin=new URL(base);vulnerableOrigin.protocol='https:';
  r=await request('PATCH','/api/auth/me',{name:'wrong protocol'},a,{origin:vulnerableOrigin.origin});check(r.status===403,'Origin protocol mismatch rejected');
  for(const url of ['/.env','/.git/config','/prisma/dev.db','/api/debug']){r=await fetch(base+url,{redirect:'manual'});check(r.status===404||[302,303,307,308,401].includes(r.status),'Internal path not exposed '+url);}
  const crypto=require('node:crypto'),device=crypto.createECDH('prime256v1');device.generateKeys();
  const sub={endpoint:'https://push.example.test/http-device',keys:{p256dh:device.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  r=await request('POST','/api/notificacoes/inscricao',{subscription:sub});check(r.status===201,'Legitimate subscription');
  const attacker=crypto.createECDH('prime256v1');attacker.generateKeys();
  r=await request('POST','/api/notificacoes/inscricao',{subscription:{...sub,keys:{p256dh:attacker.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}}},b);check(r.status===409,'Endpoint-only takeover rejected');
  r=await request('POST','/api/notificacoes/inscricao',{subscription:sub},b);check(r.status===201,'Same browser can switch notification account');
  r=await request('POST','/api/notificacoes/inscricao',{subscription:{...sub,endpoint:'https://127.0.0.1/x'}});check(r.status===400,'Private push destination rejected');
  r=await request('DELETE','/api/notificacoes/inscricao',{endpoint:sub.endpoint});check(r.ok&&(await prisma.pushSubscription.findUnique({where:{endpoint:sub.endpoint}})).userId===b.id,'Former account cannot unsubscribe device now bound to B');
  r=await request('POST','/api/notificacoes/tick',{},null);check(r.status===401,'Cron requires a configured server secret');
  console.log('HTTP security checks passed:',checks);
  console.log('Cross-account valid-request denials:',cases.length,'; all data remains in disposable SQLite');
  if(process.env.SECURITY_KEEP_FIXTURE==='1'){fs.writeFileSync(path.join(os.tmpdir(),'onerundred-security-http-fixture.json'),JSON.stringify({dbFile,port,users:users.map(u=>({id:u.id,role:u.role,token:tokens[u.id]})),boardA:boardA.id,cardA:cardA.id}));console.log('QA fixture saved locally; no secrets printed');}
 }finally{server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await prisma.$disconnect();if(process.env.SECURITY_KEEP_FIXTURE!=='1')fs.rmSync(dir,{recursive:true,force:true});});
