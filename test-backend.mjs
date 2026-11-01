import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplication} from './server/server.mjs';
import {todayRome,addDays,romeInstant} from './dist/domain.js';
import {mkdirSync} from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url));mkdirSync(path.join(root,'.qa'),{recursive:true});
const directory=mkdtempSync(path.join(root,'.qa','backend-'));
let clock=Date.now();const app=createApplication({database:path.join(directory,'test.sqlite'),now:()=>clock});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
const actors={};
async function request(actor,endpoint,body,extra={}){
  const r=await fetch(base+'/api'+endpoint,{method:body===undefined?'GET':'POST',headers:{'X-Spazi-Request':'1',...(body===undefined?{}:{'Content-Type':'application/json'}),...(actors[actor]?{Cookie:actors[actor]}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))actors[actor]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};
}
const initialPassword='Synthetic-test-only-2026';
try{
  assert.equal((await request('guest','/state')).status,401);
  const foreignHostStatus=await new Promise((resolve,reject)=>{const req=http.request(base+'/api/setup',{method:'POST',headers:{Host:'intranet.example','X-Spazi-Request':'1','Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify({name:'Test',email:'test@example.test',doorCode:initialPassword}));});
  assert.equal(foreignHostStatus,403);
  assert.equal((await request('admin','/setup',{name:'Amministratore test',surname:'Collaudo',email:'admin@example.test',doorCode:initialPassword})).status,201);
  for(const [email,role]of[['one@example.test','USER'],['two@example.test','USER'],['operator@example.test','OPERATOR']])assert.equal((await request('admin','/admin/users',{name:email.split('@')[0],surname:'Collaudo',email,doorCode:initialPassword,role})).status,201);
  for(const actor of ['one','two','operator']){
    assert.equal((await request(actor,'/login',{firstName:actor,surname:'Collaudo',email:actor+'@example.test',doorCode:initialPassword})).status,200);
    assert.equal((await request(actor,'/state')).status,200);
  }
  assert.equal((await request('one','/admin/users')).status,403);const config=(await request('admin','/state')).data.settings;assert.equal((await request('admin','/admin/settings',config)).status,200);assert.equal((await request('admin','/admin/settings',config)).status,409);
  const date=addDays(todayRome(),1),body={resource:'meeting-1',date,start:'10:00',end:'10:30',name:'Referente uno',purpose:'Riunione di collaudo'};
  const created=await request('one','/bookings',body);assert.equal(created.status,201);const id=created.data.booking.id;
  assert.equal((await request('two','/bookings',body)).status,409);
  assert.equal((await request('two',`/bookings/${id}/code`,{})).status,404);
  const otherState=(await request('two','/state')).data;assert.equal(otherState.bookings.length,0);assert.ok(otherState.seeds.length);assert.equal(otherState.seeds[0].name,body.name);assert.equal(otherState.seeds[0].purpose,body.purpose);assert.equal(otherState.seeds[0].userId,undefined);assert.equal(otherState.seeds[0].meetingCode,undefined);
  const parallel=await Promise.all(['one','two'].map(actor=>request(actor,'/bookings',{...body,resource:'call',start:'11:00',end:'11:30'})));assert.deepEqual(parallel.map(r=>r.status).sort(),[201,409]);
  const firstCode=(await request('one',`/bookings/${id}/code`,{})).data.code;
  const latestCode=(await request('one',`/bookings/${id}/code`,{})).data.code;
  assert.equal(firstCode,latestCode);assert.match(latestCode,/^\d{8}$/);
  assert.equal((await request('operator','/meetings/verify',{code:'0000000'})).status,400);
  assert.equal((await request('operator','/meetings/end',{code:latestCode})).status,409);
  assert.equal((await request('one','/meetings/verify',{code:latestCode})).status,403);
  assert.equal((await request('operator','/meetings/verify',{code:latestCode})).status,200);
  assert.equal((await request('operator','/meetings/start',{code:latestCode})).status,422);
  clock=romeInstant(date,'10:00').getTime();
  await request('operator','/login',{firstName:'operator',surname:'Collaudo',email:'operator@example.test',doorCode:initialPassword});
  const checks=await Promise.all([request('operator','/meetings/start',{code:latestCode}),request('operator','/meetings/start',{code:latestCode})]);
  assert.ok(checks.every(r=>r.status===200));assert.equal(checks.filter(r=>r.data.already===false).length,1);
  await request('admin','/login',{firstName:'Amministratore test',surname:'Collaudo',email:'admin@example.test',doorCode:initialPassword});
  const audit=(await request('admin','/admin/audit')).data.events;assert.equal(audit.filter(e=>e.action==='MEETING_STARTED').length,1);
  assert.equal((await request('admin','/admin/blocks',{date,resource:'meeting-1',reason:'Manutenzione'})).status,409);
  assert.equal((await request('admin','/admin/blocks',{date:addDays(date,1),resource:'meeting-3',reason:'Manutenzione'})).status,200);
  assert.equal((await request('admin','/admin/settings',{}, {Origin:'https://evil.example'})).status,403);
  const dbRow=app.db.prepare('SELECT data,token_hash FROM bookings WHERE id=?').get(id);assert.ok(dbRow.token_hash);assert.equal(JSON.parse(dbRow.data).meetingCode,latestCode);
  const ends=await Promise.all([request('operator','/meetings/end',{code:latestCode}),request('operator','/meetings/end',{code:latestCode})]);assert.ok(ends.every(r=>r.status===200));assert.equal(ends[0].data.booking.endedAt,ends[1].data.booking.endedAt);
  assert.equal((await request('operator','/meetings/start',{code:latestCode})).status,409);
  await request('one','/login',{firstName:'one',surname:'Collaudo',email:'one@example.test',doorCode:initialPassword});
  assert.equal((await request('one','/meetings/end',{code:latestCode})).status,403);
  const finalAudit=(await request('admin','/admin/audit')).data.events;assert.equal(finalAudit.filter(e=>e.action==='MEETING_ENDED').length,1);
  const attendance=(await request('operator','/attendance')).data.bookings;assert.ok(attendance[0].endedAt);
  console.log('Backend verificato: accessi e ruoli, isolamento dati, richieste concorrenti, codici stabili, finestre di inizio, termine riunione, idempotenza, audit, chiusure e origine richieste.');
}finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.db.close();}
