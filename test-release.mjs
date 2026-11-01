import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {harness,accounts,password,credentials} from './tests/harness.mjs';
import {addDays,todayRome,romeInstant,weekStart} from './dist/domain.js';
import {createBackup} from './server/backup-service.mjs';
import {openDatabase} from './server/database.mjs';
import path from 'node:path';
const h=await harness();
try{
  await accounts(h,[['one','USER'],['two','USER'],['operator','OPERATOR'],['tablet','OPERATOR','meeting-2']]);
  assert.equal((await h.request('one','/admin/usage')).status,403);
  assert.equal((await h.request('operator','/admin/usage')).status,403);
  assert.equal((await h.request('admin','/admin/usage?to=bad')).status,400);
  const emptyUsage=await h.request('admin','/admin/usage');assert.equal(emptyUsage.status,200);assert.equal(emptyUsage.data.rows.length,5);
  const date=addDays(todayRome(),1),body={resource:'meeting-1',date,start:'10:00',end:'12:00',name:'QA test',purpose:'Verifica rilascio'};
  for(const requestId of [[randomUUID()],{},null])assert.equal((await h.request('one','/bookings',{...body,requestId})).status,400);
  const settings=(await h.request('admin','/state')).data.settings;assert.equal((await h.request('admin','/admin/settings',{...settings,open:['08:00']})).status,400);
  const requestId=randomUUID();const duplicates=await Promise.all([h.request('one','/bookings',{...body,requestId}),h.request('one','/bookings',{...body,requestId})]);assert.ok(duplicates.every(r=>r.status===201));assert.equal(duplicates[0].data.booking.id,duplicates[1].data.booking.id);const id=duplicates[0].data.booking.id;
  assert.equal((await h.request('one','/bookings',{...body,purpose:'Richiesta diversa',requestId})).status,409);
  const usage=await h.request('admin','/admin/usage?from='+date+'&to='+date);assert.equal(usage.status,200);assert.equal(usage.data.rows[0].confirmed,1);assert.equal(usage.data.rows[0].plannedMinutes,120);assert.equal(JSON.stringify(usage.data).includes('example.test'),false);
  for(const value of [null,{},[date]])assert.equal((await h.request('one','/bookings',{...body,date:value})).status,409);
  const code=(await h.request('one',`/bookings/${id}/code`,{})).data.code;
  assert.equal((await h.request('tablet','/meetings/verify',{code})).status,403);
  h.setClock(romeInstant(date,'10:00').getTime());
  for(const actor of ['one','two','operator','tablet','admin'])await h.request(actor,'/login',credentials(actor));
  assert.equal((await h.request('operator','/meetings/start',{code})).status,200);
  h.setClock(romeInstant(date,'10:05').getTime());assert.equal((await h.request('operator','/meetings/end',{code})).status,200);
  const twoState=(await h.request('two','/state')).data;assert.ok(twoState.seeds.find(b=>b.resource==='meeting-1').endedAt);assert.equal(twoState.seeds[0].meetingCode,undefined);
  assert.equal((await h.request('tablet','/attendance')).data.bookings.length,0);
  assert.equal((await h.request('two','/bookings',{...body,start:'10:30',end:'11:00'})).status,201);
  assert.equal((await h.request('one','/bookings',{...body,start:'11:00',end:'11:30'})).status,201);
  assert.equal((await h.request('operator','/meetings/start',{code})).status,409);
  const users=(await h.request('admin','/admin/users')).data.users,oneId=users.find(u=>u.email==='one@example.test').id;
  assert.equal((await h.request('two',`/admin/users/${oneId}/door-code`,{password})).status,403);
  assert.equal((await h.request('admin',`/admin/users/${oneId}/door-code`,{name:'QA one',surname:'Collaudo',doorCode:password+'-reset'})).status,200);
  assert.equal((await h.request('one','/state')).status,401);
  assert.equal((await h.request('one','/login',credentials('one'))).status,401);
  assert.equal((await h.request('one','/login',credentials('one',password+'-reset'))).status,200);
  assert.equal((await h.request('one','/state')).status,200);
  const snapshot=createBackup(h.database,path.join(h.directory,'backups')),restored=openDatabase(snapshot);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.ok(JSON.parse(restored.prepare('SELECT data FROM bookings WHERE id=?').get(id).data).endedAt);assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM users').get().count,5);restored.close();
  const before=h.app.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count;assert.equal((await h.request('two','/bookings',{...body,resource:'non-existent'})).status,409);assert.equal(h.app.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count,before);
  assert.equal((await h.request('one','/logout',{})).status,200);assert.equal((await h.request('one','/state')).status,401);
  const readOnly=new DatabaseSync(snapshot,{readOnly:true});assert.equal(readOnly.prepare('SELECT COUNT(*) AS count FROM bookings').get().count,3);readOnly.close();
  console.log('Rilascio verificato: duplicati concorrenti, conflitto di idempotenza, sala tablet, fine anticipata, disponibilità condivisa, reimpostazione codice porta, revoca sessioni, rollback e ripristino backup.');
}finally{await h.close();}
const weekly=await harness();
try{
  await accounts(weekly,[['one','USER']]);const date=addDays(weekStart(todayRome()),7);
  for(let i=0;i<9;i++){const b={id:randomUUID(),resource:i%2?'meeting-1':'call',date,start:'08:00',end:'08:30',name:'QA storico',purpose:'Quota',status:'confirmed',endedAt:new Date().toISOString()};const userId=weekly.app.db.prepare("SELECT id FROM users WHERE email='one@example.test'").get().id;weekly.app.db.prepare('INSERT INTO bookings(id,user_id,resource,date,start,end,status,data) VALUES(?,?,?,?,?,?,?,?)').run(b.id,userId,b.resource,date,b.start,b.end,b.status,JSON.stringify(b));}
  const body={resource:'meeting-2',date,start:'15:00',end:'15:30',name:'QA quota',purpose:'Decima prenotazione'};
  const attempts=await Promise.all([weekly.request('one','/bookings',body),weekly.request('one','/bookings',{...body,resource:'meeting-3',start:'16:00',end:'16:30'})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  assert.match(attempts.find(r=>r.status===409).data.error,/massimo 10/);
  assert.equal((await weekly.request('one','/bookings',{...body,resource:'table-1-seat-1',start:'12:30',end:'13:00'})).status,201);
  assert.equal((await weekly.request('one','/bookings',{...body,date:addDays(date,7)})).status,201);
  const id=attempts.find(r=>r.status===201).data.booking.id;assert.equal((await weekly.request('one',`/bookings/${id}/cancel`,{})).status,200);
  assert.equal((await weekly.request('one','/bookings',{...body,start:'17:00',end:'17:30'})).status,201);
  console.log('Quota backend verificata: 10 condivise tra riunioni e call, undicesima concorrente bloccata, pranzo escluso, annullamento e nuova settimana.');
}finally{await weekly.close();}

const codes=await harness();
try{
  await accounts(codes,[['owner','USER'],['other','USER'],['tablet','OPERATOR']]);
  const bookings=[];
  for(const [resource,start,end]of [['meeting-1','09:00','09:30'],['meeting-2','10:00','10:30'],['meeting-1','11:00','11:30']]){
    const result=await codes.request('owner','/bookings',{resource,start,end,date:addDays(todayRome(),1),name:'Codici distinti',purpose:'Verifica associazione sala e fascia'});
    assert.equal(result.status,201);assert.match(result.data.booking.meetingCode,/^\d{8}$/);bookings.push(result.data.booking);
  }
  assert.equal(new Set(bookings.map(b=>b.meetingCode)).size,3);
  for(const booking of bookings){
    assert.equal((await codes.request('owner',`/bookings/${booking.id}/code`,{})).data.code,booking.meetingCode);
    const verified=await codes.request('tablet','/meetings/verify',{code:booking.meetingCode});
    assert.equal(verified.status,200);assert.equal(verified.data.booking.id,booking.id);
    assert.equal(verified.data.booking.resource,booking.resource);assert.equal(verified.data.booking.start,booking.start);
    assert.equal((await codes.request('other',`/bookings/${booking.id}/code`,{})).status,404);
  }
  const state=(await codes.request('owner','/state')).data;
  assert.equal(new Set(state.bookings.map(b=>b.meetingCode)).size,3);
  assert.ok((await codes.request('other','/state')).data.seeds.every(b=>b.meetingCode===undefined));
  console.log('Codici distinti verificati: sale diverse, stessa sala in fasce diverse, associazione tablet, persistenza e riservatezza.');
}finally{await codes.close();}
