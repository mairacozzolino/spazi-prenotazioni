import {occupiesCapacity} from './payments.js';
export const STORAGE_KEY = 'spazi-demo-v1';
export const DEFAULT_SETTINGS = { open:'08:00', close:'19:00', lunchOpen:'12:00', lunchClose:'15:00', maxDuration:120, maxUpcoming:10, cancellationCutoff:60, checkInBefore:15, checkInAfter:15, names:['Sala riunioni 1','Sala riunioni 2','Sala riunioni 3','Sala call'] };
export const ROOM_IDS = ['meeting-1','meeting-2','meeting-3','call'];
export const minutes = time => Number(time.split(':')[0])*60 + Number(time.split(':')[1]);
export const timeString = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export const overlaps = (a,b) => a.date===b.date && minutes(a.start)<minutes(b.end) && minutes(b.start)<minutes(a.end);
export const LUNCH_SHIFTS=[{start:'12:30',end:'13:00'},{start:'13:30',end:'14:00'}];
export const DINING_TABLES = [{id:1,label:'T1',seats:4},{id:2,label:'T2',seats:4},{id:3,label:'T3',seats:4},{id:4,label:'T4',seats:4},{id:5,label:'B1',seats:4},{id:6,label:'B2',seats:2}];
export const DINING_SEATS = DINING_TABLES.flatMap(t=>Array.from({length:t.seats},(_,i)=>`table-${t.id}-seat-${i+1}`));
export const seatId = (table,seat) => `table-${table}-seat-${seat}`;
export function todayRome(now=Date.now()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
export function addDays(date,days) { const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
export function weekStart(date){const day=new Date(`${date}T12:00:00Z`).getUTCDay();return addDays(date,-((day+6)%7));}
export function weeklyLimitError(state,date,now=Date.now()){const first=weekStart(date),last=addDays(first,7);return state.bookings.filter(b=>ROOM_IDS.includes(b.resource)&&(b.status==='confirmed'||b.status==='pending_payment'&&Date.parse(b.holdExpiresAt)>now)&&b.date>=first&&b.date<last).length>=10?'Puoi avere al massimo 10 prenotazioni di sale riunioni e sala call per settimana (da lunedì a domenica).':null;}
export function createInitialState(date=todayRome()) {
  return {version:1,settings:structuredClone(DEFAULT_SETTINGS),bookings:[],blocks:[],audit:[],seeds:[
    {id:'example-room',resource:'meeting-2',date,start:'12:00',end:'14:00',title:'Riunione di esempio',status:'confirmed',demo:true},
    {id:'example-call',resource:'call',date,start:'14:00',end:'14:30',title:'Call di esempio',status:'confirmed',demo:true},
    ...[[1,1],[2,2],[2,4],[3,3],[4,1]].map(([table,seat],i)=>({id:`example-seat-${i}`,resource:seatId(table,seat),date,start:'12:30',end:'13:30',title:'Posto di esempio',status:'confirmed',demo:true}))
  ]};
}
export function resourceSeats(resource){const m=/^table-([1-6])-all$/.exec(resource);return m?DINING_SEATS.filter(id=>id.startsWith(`table-${m[1]}-`)):[resource];}
export function isFree(state,resource,request,now=Date.now()) { return !closedReason(state,resource,request)&&![...state.seeds,...state.bookings].some(b=>occupiesCapacity(b,now)&&resourceSeats(b.resource).some(id=>resourceSeats(resource).includes(id))&&overlaps(b,request)); }
export function validateRequest(state,resource,request,today=todayRome(),now=Date.now()) {
  if(!request||typeof request.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(request.date)||Number.isNaN(Date.parse(`${request.date}T12:00:00Z`))||new Date(`${request.date}T12:00:00Z`).toISOString().slice(0,10)!==request.date) return 'Scegli una data valida.';
  if(request.date<today) return 'Scegli oggi o un giorno futuro.';
  if(request.date>addDays(today,30)) return 'Puoi prenotare entro i prossimi 30 giorni.';
  if(typeof request.start!=='string'||typeof request.end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(request.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(request.end))return 'Scegli orari validi.';
  const start=minutes(request.start),end=minutes(request.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return 'L’orario di fine deve essere successivo all’inizio.';
  if(start%30||end%30) return 'Scegli orari con intervalli di 30 minuti.';
  if(end-start>state.settings.maxDuration) return `La durata massima è ${state.settings.maxDuration/60} ore.`;
  if(typeof resource!=='string')return 'Spazio non valido.';
  const lunch=resource.startsWith('table-'),s=state.settings;
  if(lunch&&!LUNCH_SHIFTS.some(t=>t.start===request.start&&t.end===request.end))return 'Scegli un turno pranzo: 12:30–13:00 oppure 13:30–14:00.';
  if(start<minutes(lunch?s.lunchOpen:s.open)||end>minutes(lunch?s.lunchClose:s.close)) return lunch?`Il pranzo è prenotabile dalle ${s.lunchOpen} alle ${s.lunchClose}.`:`Le sale sono prenotabili dalle ${s.open} alle ${s.close}.`;
  if(!ROOM_IDS.includes(resource)&&!DINING_SEATS.includes(resource)&&!/^table-[1-6]-all$/.test(resource)) return 'Spazio non valido.';
  if(request.date===todayRome(now)&&romeInstant(request.date,request.start).getTime()<=now)return 'Questa fascia è già iniziata. Scegli un orario futuro.';
  const closure=closedReason(state,resource,request);if(closure)return closure;
  const weeklyError=ROOM_IDS.includes(resource)?weeklyLimitError(state,request.date,now):null;if(weeklyError)return weeklyError;
  if(!isFree(state,resource,request,now)) return 'Questo spazio è già occupato nell’orario scelto. Scegli un’altra fascia.';
  if(state.bookings.some(b=>occupiesCapacity(b,now)&&overlaps(b,request))) return 'Hai già una prenotazione in questa fascia. Scegli un altro orario o cancella quella esistente.';
  return null;
}
export function resourceLabel(resource,settings) {
  const i=ROOM_IDS.indexOf(resource);if(i>=0)return settings.names[i];
  const whole=/^table-([1-6])-all$/.exec(resource);if(whole){const table=DINING_TABLES.find(t=>t.id===Number(whole[1]));return `Tavolo ${table.label} intero · ${table.seats} posti`;}
  const match=/^table-(\d)-seat-(\d)$/.exec(resource);return match?`Tavolo ${DINING_TABLES.find(t=>t.id===Number(match[1]))?.label||match[1]} · Posto ${match[2]}`:'Spazio';
}
export function romeInstant(date,time) {
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const parts=Object.fromEntries(formatter.formatToParts(guess).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));const local=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);guess+=target-local;}
  return new Date(guess);
}
export function calendarText(booking,settings) {
  const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const escape=t=>t.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Spazi//Demo prenotazioni//IT','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${booking.id}@spazi-demo.local`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(romeInstant(booking.date,booking.start))}`,`DTEND:${stamp(romeInstant(booking.date,booking.end))}`,`SUMMARY:${escape(booking.title||resourceLabel(booking.resource,settings))}`,`LOCATION:${escape(resourceLabel(booking.resource,settings))}`,'DESCRIPTION:Prenotazione di uno spazio. Le modifiche nella piattaforma non aggiornano questa copia.','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}

export function closedReason(state,resource,request) {
  const block=(state.blocks||[]).find(b=>b.date===request.date&&(b.resource==='all'||b.resource===resource||b.resource==='lunch'&&resource.startsWith('table-')));
  return block?`Spazio chiuso: ${block.reason}. Scegli un altro giorno o spazio.`:null;
}
export function isUpcoming(booking,now=Date.now()) {
  return booking.status==='confirmed'&&!booking.endedAt&&(!!booking.checkedInAt||romeInstant(booking.date,booking.end).getTime()>now);
}
export function googleCalendarUrl(booking,settings) {
  const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const url=new URL('https://calendar.google.com/calendar/render');
  url.search=new URLSearchParams({action:'TEMPLATE',text:booking.title||resourceLabel(booking.resource,settings),dates:`${stamp(romeInstant(booking.date,booking.start))}/${stamp(romeInstant(booking.date,booking.end))}`,ctz:'Europe/Rome',location:resourceLabel(booking.resource,settings),details:'Prenotazione di uno spazio. Le modifiche nella piattaforma non aggiornano questa copia.'});
  return url.href;
}
