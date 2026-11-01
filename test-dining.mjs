import assert from 'node:assert/strict';
import {harness,accounts} from './tests/harness.mjs';
import {createInitialState,todayRome,addDays,isFree} from './dist/domain.js';
import {createBooking} from './dist/booking-service.js';
import {diningReservations} from './dist/dining.js';
import {openDatabase} from './server/database.mjs';
import {randomUUID} from 'node:crypto';
const date=addDays(todayRome(),1),range={date,start:'12:30',end:'13:00'},state=createInitialState();state.seeds=[];
const demo=createBooking(state,'table-1-seat-1',range,'Mario Rossi');assert.ok(demo.booking);assert.equal(demo.booking.purpose,'');assert.equal(isFree(state,'table-1-seat-1',range),false);assert.equal(diningReservations(state,'table-1-seat-1',range)[0].name,'Mario Rossi');
assert.ok(createBooking(state,'table-2-seat-1',{...range,start:'13:30',end:'14:00'},'').error);
assert.ok(createBooking(state,'meeting-1',{...range,start:'10:00',end:'10:30'},'Mario Rossi').error);
const h=await harness();let savedId;
try{
  await accounts(h);const body={resource:'table-1-seat-1',...range,name:'Mario Rossi',requestId:randomUUID()};
  const saved=await h.request('one','/bookings',body);assert.equal(saved.status,201);savedId=saved.data.booking.id;assert.equal(saved.data.booking.purpose,'');
  assert.equal((await h.request('one','/bookings',body)).data.booking.id,savedId);
  assert.equal((await h.request('two','/bookings',{...body,requestId:randomUUID(),name:'Anna Bianchi'})).status,409);
  const shared=(await h.request('two','/state')).data,booking=shared.seeds.find(b=>b.resource===body.resource);assert.equal(booking.name,'Mario Rossi');assert.equal(booking.purpose,undefined);assert.equal(booking.userId,undefined);assert.equal(booking.meetingCode,undefined);assert.equal(diningReservations(shared,body.resource,range)[0].name,'Mario Rossi');
  assert.equal(isFree(shared,body.resource,range),false);
  const whole=await h.request('two','/bookings',{...range,resource:'table-6-all',name:'Anna Bianchi'});assert.equal(whole.status,201);
  const ownerState=(await h.request('one','/state')).data;assert.equal(diningReservations(ownerState,'table-6-seat-2',range)[0].name,'Anna Bianchi');assert.equal(isFree(ownerState,'table-6-seat-1',range),false);
  assert.equal((await h.request('one','/bookings',{resource:'meeting-1',date,start:'15:00',end:'15:30',name:'Mario Rossi'})).status,400);
  assert.equal((await h.request('one','/bookings',{...range,resource:'table-3-seat-1',name:''})).status,400);
  const room=await h.request('one','/bookings',{resource:'meeting-1',date,start:'15:00',end:'15:30',name:'Mario Rossi',purpose:'Riunione privata'});assert.equal(room.status,201);
  const privateRoom=(await h.request('two','/state')).data.seeds.find(b=>b.resource==='meeting-1');assert.equal(privateRoom.name,'Mario Rossi');assert.equal(privateRoom.purpose,'Riunione privata');assert.equal(privateRoom.userId,undefined);assert.equal(privateRoom.meetingCode,undefined);
}finally{await h.close();}
const db=openDatabase(h.database);try{const persisted=JSON.parse(db.prepare('SELECT data FROM bookings WHERE id=?').get(savedId).data);assert.equal(persisted.name,'Mario Rossi');assert.equal(persisted.purpose,'');}finally{db.close();}
console.log('Pranzo verificato: solo nome e cognome, salvataggio persistente, rilettura dopo riavvio, nome visibile a un altro account, posto/tavolo occupati, duplicati, campi obbligatori e dettagli condivisi delle sale.');
