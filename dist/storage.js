import {STORAGE_KEY,DEFAULT_SETTINGS,createInitialState} from './domain.js';

// Adattatore locale della demo. Un repository HTTP potrà sostituirlo senza cambiare le regole.
export function readDemo(fallback) {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(!saved||saved.version!==1||!Array.isArray(saved.bookings)||!Array.isArray(saved.seeds))return fallback||createInitialState();
    const state={...saved,settings:{...DEFAULT_SETTINGS,...saved.settings,maxUpcoming:10},blocks:Array.isArray(saved.blocks)?saved.blocks:[],audit:Array.isArray(saved.audit)?saved.audit:[]};
    if(!Array.isArray(state.settings.names)||state.settings.names.length!==4)return fallback||createInitialState();
    if(!state.demoCleanupV1){for(const b of state.bookings){if(['48271639','48271640','87654321'].includes(b.checkInToken)&&['Prova tablet','Prova pulsante','Collaudo timer'].includes(b.name)&&b.status==='confirmed'){b.status='cancelled';b.cancelledAt=new Date().toISOString();b.cancelReason='Pulizia delle prenotazioni usate per il collaudo del tablet';}}state.demoCleanupV1=true;}
    return state;
  } catch { return fallback||createInitialState(); }
}
export function writeDemo(state) {
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}
  catch {return false;}
}
export function auditEvent(state,action,bookingId) {
  state.audit??=[];
  state.audit.push({action,bookingId,actor:'profilo-demo',at:new Date().toISOString()});
  state.audit=state.audit.slice(-200);
}
