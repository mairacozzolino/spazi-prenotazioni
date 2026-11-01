// Il modulo pagamenti è separato dalle prenotazioni; il checkout non è attivo nella demo.
export const BOOKING_STATES=Object.freeze(['CONFIRMED','PENDING_PAYMENT','CANCELLED','EXPIRED','COMPLETED']);
export function freePriceSnapshot() { return {priceSnapshotCents:0,currency:'EUR',paymentStatus:'NOT_REQUIRED'}; }
export function occupiesCapacity(booking,now=Date.now()) {
  return (booking.status==='confirmed'&&!booking.endedAt)||(booking.status==='pending_payment'&&Date.parse(booking.holdExpiresAt)>now);
}
