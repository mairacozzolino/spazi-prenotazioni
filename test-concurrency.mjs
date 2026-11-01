import assert from 'node:assert/strict';
import {harness,accounts,password,credentials} from './tests/harness.mjs';
import {addDays,todayRome} from './dist/domain.js';
const h=await harness();
try{
  await accounts(h);
  const date=addDays(todayRome(),2),booking={resource:'meeting-3',date,start:'10:00',end:'11:00',name:'Referente 漢字 è',purpose:'Riunione <script> & caratteri Unicode'};
  const attempts=await Promise.all(Array.from({length:40},(_,i)=>h.request(i%2?'one':'two','/bookings',booking)));
  assert.equal(attempts.filter(r=>r.status===201).length,1);assert.equal(attempts.filter(r=>r.status===409).length,39);assert.equal(h.app.db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count,1);
  assert.equal(attempts.find(r=>r.status===201).data.booking.name,booking.name);
  const lunch={...booking,resource:'table-5-all',start:'12:30',end:'13:00'};
  const seats=await Promise.all([h.request('one','/bookings',lunch),h.request('two','/bookings',{...lunch,resource:'table-5-seat-4'})]);assert.deepEqual(seats.map(r=>r.status).sort(),[201,409]);
  const seat2=await h.request('two','/bookings',{...lunch,resource:'table-6-seat-2'});assert.equal(seat2.status,201);
  assert.equal((await h.request('one','/bookings',{...lunch,resource:'table-6-all'})).status,409);
  const duplicateUsers=await Promise.all([h.request('admin','/admin/users',{name:'QA duplicated',surname:'Collaudo',email:'same@example.test',doorCode:password,role:'USER'}),h.request('admin','/admin/users',{name:'QA duplicated',surname:'Collaudo',email:'same@example.test',doorCode:password,role:'USER'})]);assert.equal(duplicateUsers.filter(r=>r.status===201).length,1);assert.equal(duplicateUsers.filter(r=>r.status===409).length,1);
  const id=h.app.db.prepare("SELECT id FROM users WHERE email='two@example.test'").get().id;assert.equal((await h.request('admin',`/admin/users/${id}/active`,{active:false})).status,200);assert.equal((await h.request('two','/state')).status,401);assert.equal((await h.request('two','/login',credentials('two'))).status,401);
  console.log('Concorrenza verificata: 40 richieste sulla stessa sala, tavolo intero contro posto, Unicode, account duplicati concorrenti e disattivazione con revoca sessioni.');
}finally{await h.close();}
