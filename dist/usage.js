import {ROOM_IDS,resourceLabel,resourceSeats,minutes,addDays} from './domain.js';
function fail(message){throw Object.assign(new Error(message),{status:400});}

export function usageReport(bookings,settings,from,to){
  for(const date of [from,to])if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)fail('Scegli date valide.');
  if(from>to||to>addDays(from,365))fail('Scegli un periodo ordinato di massimo 366 giorni.');
  const rows=[...ROOM_IDS,'lunch'].map(resource=>({resource,label:resource==='lunch'?'Sala pranzo':resourceLabel(resource,settings),confirmed:0,cancelled:0,started:0,ended:0,plannedMinutes:0,actualMinutes:0,seats:0}));
  for(const b of bookings){
    if(b.date<from||b.date>to)continue;
    const lunch=b.resource.startsWith('table-'),row=rows.find(r=>r.resource===(lunch?'lunch':b.resource));
    if(!row)continue;
    if(b.status==='cancelled'){row.cancelled++;continue;}
    if(b.status!=='confirmed')continue;
    row.confirmed++;
    if(lunch){row.seats+=resourceSeats(b.resource).length;continue;}
    row.plannedMinutes+=minutes(b.end)-minutes(b.start);
    if(b.checkedInAt)row.started++;
    if(b.checkedInAt&&b.endedAt){row.ended++;row.actualMinutes+=Math.max(0,(Date.parse(b.endedAt)-Date.parse(b.checkedInAt))/60000);}
  }
  return {from,to,rows};
}
