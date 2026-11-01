import assert from 'node:assert/strict';
import {usageReport} from './server/usage.mjs';
import {DEFAULT_SETTINGS} from './dist/domain.js';
const booking={resource:'meeting-1',date:'2026-10-26',start:'10:00',end:'11:00',status:'confirmed'};
const report=usageReport([
  {...booking,checkedInAt:'2026-10-26T09:00:00Z',endedAt:'2026-10-26T09:15:00Z'},
  {...booking,status:'cancelled'},
  {...booking,date:'2026-10-25'},
  {...booking,resource:'table-6-all'},
  {...booking,resource:'table-1-seat-2'},
  {...booking,resource:'call',checkedInAt:'2026-10-26T09:00:00Z'}
],DEFAULT_SETTINGS,'2026-10-26','2026-10-26');
assert.deepEqual(report.rows[0],{resource:'meeting-1',label:DEFAULT_SETTINGS.names[0],confirmed:1,cancelled:1,started:1,ended:1,plannedMinutes:60,actualMinutes:15,seats:0});
assert.equal(report.rows[3].started,1);assert.equal(report.rows[3].actualMinutes,0);
assert.equal(report.rows[4].seats,3);assert.equal(report.rows[4].confirmed,2);
assert.equal(usageReport([],DEFAULT_SETTINGS,'2026-01-01','2026-12-31').rows.every(r=>r.confirmed===0),true);
for(const [from,to]of [['2026-02-30','2026-03-01'],['2026-10-27','2026-10-26'],['2025-01-01','2026-12-31'],[null,'2026-10-26']])assert.throws(()=>usageReport([],DEFAULT_SETTINGS,from,to));
console.log('Statistiche verificate: filtri inclusivi, date invalide, annullamenti, durata prenotata/effettiva, riunioni in corso, posti/tavoli e periodo vuoto.');
