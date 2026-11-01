import {overlaps,resourceSeats} from './domain.js';
import {occupiesCapacity} from './payments.js';
export function diningReservations(state,resource,request){
  const seats=resourceSeats(resource);
  return [...state.bookings,...state.seeds].filter(b=>b.resource?.startsWith('table-')&&occupiesCapacity(b)&&overlaps(b,request)&&resourceSeats(b.resource).some(id=>seats.includes(id)));
}
