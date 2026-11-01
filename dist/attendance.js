import {romeInstant} from './domain.js';
import {auditEvent} from './storage.js';

export function accessCode(booking) {if(!/^\d{8}$/.test(booking.checkInToken||''))booking.checkInToken=newCheckInToken();return booking.checkInToken;}
export function newCheckInToken() {
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return String(new DataView(bytes.buffer).getUint32(0)%100000000).padStart(8,'0');
}
export function verifyCheckIn(state,code,now=Date.now()) {
  if(typeof code!=='string'||!/^\d{8}$/.test(code.trim()))return {error:'Inserisci il codice di 8 cifre.'};
  const booking=state.bookings.find(b=>b.checkInToken===code.trim());
  if(!booking)return {error:'Codice non riconosciuto. Controlla la prenotazione.'};
  if(booking.status!=='confirmed')return {error:'La prenotazione è annullata o non è confermata.'};
  if(booking.resource.startsWith('table-'))return {error:'Questa funzione è riservata alle sale riunioni e call.'};
  return {booking,already:!!booking.checkedInAt};
}
export function registerCheckIn(state,code,now=Date.now()) {
  const result=verifyCheckIn(state,code,now);
  if(result.error)return result;
  if(result.booking.endedAt)return {error:'La riunione è già terminata.'};
  if(result.already)return result;
  const start=romeInstant(result.booking.date,result.booking.start).getTime();
  if(now<start-(state.settings.checkInBefore??15)*60000||now>start+(state.settings.checkInAfter??15)*60000)return {error:'Inizio consentito da 15 minuti prima a 15 minuti dopo l’orario prenotato.'};
  if(state.bookings.some(b=>b.id!==result.booking.id&&b.resource===result.booking.resource&&b.status==='confirmed'&&b.checkedInAt&&!b.endedAt))return {error:'Una riunione è già in corso in questa sala.'};
  result.booking.checkedInAt=new Date(now).toISOString();
  result.booking.attendanceStatus='IN_PROGRESS';
  result.booking.checkedInBy='operatore-demo';
  auditEvent(state,'MEETING_STARTED',result.booking.id);
  return result;
}
export function endMeeting(state,code,now=Date.now()){
  const result=verifyCheckIn(state,code);if(result.error)return result;
  const b=result.booking;if(!b.checkedInAt)return {error:'Avvia la riunione prima di terminarla.'};
  if(!b.endedAt){b.endedAt=new Date(now).toISOString();b.endedBy='operatore-demo';b.attendanceStatus='ENDED';auditEvent(state,'MEETING_ENDED',b.id);}return result;
}
