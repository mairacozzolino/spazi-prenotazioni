import {validateRequest,romeInstant} from './domain.js';
import {freePriceSnapshot} from './payments.js';
import {newCheckInToken} from './attendance.js';
import {auditEvent} from './storage.js';

export function createBooking(state,resource,request,title='',purpose='') {
  const lunch=resource.startsWith('table-');
  if(typeof title!=='string'||title.trim().length<2||title.trim().length>80)return {error:lunch?'Inserisci nome e cognome (da 2 a 80 caratteri).':'Inserisci il nome del referente (da 2 a 80 caratteri).'};
  if(!lunch&&(typeof purpose!=='string'||purpose.trim().length<3||purpose.trim().length>500))return {error:'Inserisci per cosa serve lo spazio (da 3 a 500 caratteri).'};
  title=title.trim();purpose=lunch?'':purpose.trim();
  const error=validateRequest(state,resource,request);
  if(error)return {error};
  const booking={id:crypto.randomUUID(),resource,...request,title:title.slice(0,80),name:title.slice(0,80),purpose:purpose.slice(0,500),status:'confirmed',createdAt:new Date().toISOString(),checkInToken:newCheckInToken(),attendanceStatus:'NOT_CHECKED_IN',...freePriceSnapshot()};
  state.bookings.push(booking);auditEvent(state,'BOOKING_CONFIRMED',booking.id);
  return {booking};
}
export function cancellationError(state,booking,now=Date.now()) {
  if(!booking||booking.status!=='confirmed')return 'Questa prenotazione non è più attiva.';
  if(booking.checkedInAt)return 'Il check-in è già registrato. Chiedi all’amministratore di gestire eventuali correzioni.';
  const cutoff=(state.settings.cancellationCutoff??60)*60000;
  if(now>romeInstant(booking.date,booking.start).getTime()-cutoff)return `Puoi annullare fino a ${state.settings.cancellationCutoff??60} minuti prima dell’inizio.`;
  return null;
}
export function cancelBooking(state,id) {
  const booking=state.bookings.find(b=>b.id===id);
  if(booking?.status==='cancelled')return {booking};
  const error=cancellationError(state,booking);if(error)return {error};
  booking.status='cancelled';booking.cancelledAt=new Date().toISOString();
  auditEvent(state,'BOOKING_CANCELLED',id);return {booking};
}
