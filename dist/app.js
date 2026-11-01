import {usageReport} from './usage.js';
import {showAdminSection} from './admin-navigation.js';
import {occupiesCapacity} from './payments.js';
import {STORAGE_KEY,DEFAULT_SETTINGS,ROOM_IDS,DINING_TABLES,DINING_SEATS,LUNCH_SHIFTS,minutes,timeString,overlaps,seatId,todayRome,addDays,createInitialState,isFree,validateRequest,resourceLabel,calendarText,romeInstant,closedReason,isUpcoming,googleCalendarUrl} from './domain.js';
import {readDemo,writeDemo,auditEvent} from './storage.js';
import {createBooking,cancelBooking,cancellationError} from './booking-service.js';
import {accessCode,verifyCheckIn,registerCheckIn,endMeeting,newCheckInToken} from './attendance.js';
import {nextOpeningRequest,findNextSlot} from './scheduling.js';
import {diningReservations} from './dining.js';
import {api,sessionInfo,submitAccess} from './transport.js';
function showUnavailable(message){document.body.replaceChildren();const main=document.createElement('main');main.className='service-unavailable';const title=document.createElement('h1');title.textContent='Servizio non disponibile';const p=document.createElement('p');p.textContent=message;const button=document.createElement('button');button.className='primary';button.textContent='Riprova';button.onclick=()=>location.reload();main.append(title,p,button);document.body.append(main);}
const connection=await sessionInfo();
if(!connection.online){showUnavailable('Non riesco a collegarmi al servizio. Controlla la rete e riprova: le prenotazioni non sono state modificate.');await new Promise(()=>{});}
const sessionUser=connection.user;
const sharedMode=!!sessionUser&&!sessionUser.mustChangePassword;
const $=selector=>document.querySelector(selector);
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let initialState;try{initialState=sharedMode?await api('/state'):readDemo();}catch{showUnavailable('La sessione o la connessione non è più disponibile. Premi Riprova per accedere di nuovo.');await new Promise(()=>{});}
let state=initialState,storageAvailable=sharedMode||writeDemo(state);
for(const b of state.bookings)if(!sharedMode&&b.status==='confirmed'&&!b.checkInToken)b.checkInToken=newCheckInToken();
if(!sharedMode)writeDemo(state);
let bookingInFlight=false,lastConfirmedId=null,adminSection='rules',bookingAttempt=null;
let serverOffset=(connection.serverNow||Date.now())-Date.now();
let diningMode='seat',diningInspection=null;
let category='tutti',selection=null,view='prenota',history='attive',cancelId=null,toastTimer;
const icons={room:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m5 11v-2a6 6 0 0 0-3-5.2"/></svg>',call:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z"/></svg>',seat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 13V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8M5 11v6h14v-6M7 17v4m10-4v4M5 13h14"/></svg>'};
function save(){storageAvailable=sharedMode||writeDemo(state);$('#storage-warning').hidden=storageAvailable;}
let refreshing=false;
async function reloadShared(){if(sharedMode){const next=await api('/state'),settingsChanged=JSON.stringify(next.settings)!==JSON.stringify(state.settings);state=next;serverOffset=(next.serverNow||Date.now())-Date.now();storageAvailable=true;if(settingsChanged){setupTimes();updateResourceOptions();}}}
function refreshState(){if(sharedMode){if(refreshing)return;refreshing=true;reloadShared().then(()=>{const tag=document.activeElement?.tagName;if(view!=='prenota'||!['INPUT','TEXTAREA','SELECT'].includes(tag)&&!document.activeElement?.closest('#detail-panel'))renderAll();}).catch(error=>{if(error.status===401)openAccess();else toast('Connessione al server non disponibile. '+error.message);}).finally(()=>refreshing=false);}else if(storageAvailable)state=readDemo(state);}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function request(){return {date:$('#booking-date').value,start:$('#start-time').value,end:$('#end-time').value};}
function prettyDate(date){if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return 'Scegli un giorno';return new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00Z`));}
function intervalError(r=request()){if(!r.date)return 'Scegli un giorno.';if(r.date===todayRome()&&nextOpeningRequest(state.settings).date!==todayRome())return 'Per oggi non ci sono più slot futuri. Scegli Domani per prenotare.';if(r.date===todayRome()&&romeInstant(r.date,r.start).getTime()<=Date.now())return 'La fascia scelta è già iniziata. Scegli un orario futuro.';if(r.date<todayRome())return 'Puoi prenotare da oggi in avanti.';if(r.date>addDays(todayRome(),30))return 'Scegli una data entro i prossimi 30 giorni.';if(minutes(r.end)<=minutes(r.start))return 'Scegli un orario di fine successivo all’inizio.';if(minutes(r.end)-minutes(r.start)>state.settings.maxDuration)return `La durata massima è ${state.settings.maxDuration/60} ore.`;return null;}
function rangeError(resource,r=request()){const lunch=resource.startsWith('table-'),s=state.settings;return minutes(r.start)<minutes(lunch?s.lunchOpen:s.open)||minutes(r.end)>minutes(lunch?s.lunchClose:s.close);}
function options(start,end){let html='';for(let value=start;value<=end;value+=30)html+=`<option value="${timeString(value)}">${timeString(value)}</option>`;return html;}
function setupTimes(){const old=request();$('#start-time').innerHTML=options(minutes(state.settings.open),minutes(state.settings.close)-30);$('#end-time').innerHTML=options(minutes(state.settings.open)+30,minutes(state.settings.close));$('#start-time').value=old.start||'12:30';if(!$('#start-time').value)$('#start-time').selectedIndex=0;$('#end-time').value=old.end||timeString(minutes($('#start-time').value)+30);if(!$('#end-time').value)$('#end-time').value=timeString(minutes($('#start-time').value)+30);$('#max-duration-label').textContent=`${state.settings.maxDuration/60} ${state.settings.maxDuration===60?'ora':'ore'}`;}
function hasRoomSlot(resource,date){
  if(!date||date<todayRome()||date>addDays(todayRome(),30))return false;
  for(let start=minutes(state.settings.open);start+30<=minutes(state.settings.close);start+=30){
    const candidate={date,start:timeString(start),end:timeString(start+30)};
    if(romeInstant(date,candidate.start).getTime()>Date.now()&&isFree(state,resource,candidate))return true;
  }
  return false;
}
function renderRooms(){const r=request(),error=intervalError(r);$('#room-list').innerHTML=ROOM_IDS.map(id=>{const free=isFree(state,id,r),invalid=!!error||rangeError(id,r),dayAvailable=hasRoomSlot(id,r.date);return `<article class="room ${selection===id?'active-room':''}"><div class="room-symbol">${icons[id==='call'?'call':'room']}</div><div class="room-info"><h3>${escapeHtml(resourceLabel(id,state.settings))}</h3><p class="room-type">${id==='call'?'Call':'Riunioni'} · Uso esclusivo</p><p class="status ${invalid?'invalid':free?'':'busy'}"><span class="tiny-dot"></span>${!dayAvailable?'Nessuno slot disponibile nel giorno scelto':invalid?'Scegli una fascia disponibile':free?'Disponibile':'Fascia occupata · altri slot disponibili'}</p></div><button type="button" class="${selection===id?'secondary':'primary'}" data-room="${id}" ${dayAvailable?'':'disabled'}>${selection===id?'Selezionata':'Vedi slot'}</button>${!free&&!invalid?`<button class="next-free-button" data-next-free="${id}">Cerca prossimo slot libero</button>`:''}</article>`;}).join('');
  if(category==='tutti'){
    const outside=rangeError('table-1-seat-1',r),closure=closedReason(state,'table-1-seat-1',r);
    const available=DINING_SEATS.filter(id=>isFree(state,id,r)).length;
    const status=error||outside?'Orario pranzo '+state.settings.lunchOpen+'–'+state.settings.lunchClose:closure?'Chiusura programmata':`${available} posti liberi su 22`;
    $('#room-list').insertAdjacentHTML('beforeend',`<article class="room dining-resource ${category==='pranzo'?'active-room':''}"><div class="room-symbol">${icons.seat}</div><div class="room-info"><h3>Sala pranzo</h3><p class="status"><span class="tiny-dot"></span>${status}</p><p class="resource-capacity">T1–T4 e tavoli alti B1–B2 · 22 posti</p></div><button type="button" class="primary" data-open-lunch="true">Scegli posto</button></article>`);
  }
}

function bookingDetailsForm(lunch=false){return '<div class="booking-details-form"><h3>Dettagli della prenotazione</h3><label>'+(lunch?'Nome e cognome':'Nome del referente')+'<input id="booking-title" maxlength="80" minlength="2" required placeholder="Nome e cognome" autocomplete="name"></label>'+(lunch?'<p>Il nome e cognome saranno visibili a chi consulta questo posto occupato.</p>':'<label>Per cosa serve<textarea id="booking-purpose" maxlength="500" minlength="3" required rows="3" placeholder="Es. Riunione del team, colloquio o call"></textarea></label><p>Nome e finalità sono visibili agli utenti autenticati nel calendario condiviso.</p>')+'</div>';}
function paintDiningOccupants(resource){const box=$('#dining-occupants');if(!box)return;const bookings=diningReservations(state,resource,request());box.hidden=false;box.replaceChildren();const heading=document.createElement('strong');heading.textContent=resourceLabel(resource,state.settings);box.append(heading);if(!bookings.length){const p=document.createElement('p');p.textContent='Questo posto è ora libero. Puoi selezionarlo per prenotare.';box.append(p);return;}for(const b of bookings){const p=document.createElement('p');p.textContent='Prenotato da '+(b.name||(!b.demo&&b.title)||'Persona di esempio (demo)')+' · '+b.start+'–'+b.end;box.append(p);}}
async function showDiningOccupants(resource){try{if(sharedMode)await reloadShared();else refreshState();diningInspection={resource,key:JSON.stringify(request())};selection=null;renderBooking();const box=$('#dining-occupants');box.tabIndex=-1;box.scrollIntoView({behavior:'smooth',block:'nearest'});box.focus({preventScroll:true});}catch(error){toast(error.message);}}
function bookingTerms(rr){
  if(!rr.date||!rr.start)return '';
  const cutoff=state.settings.cancellationCutoff??60;
  const deadline=romeInstant(rr.date,rr.start).getTime()-cutoff*60000;
  const date=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(deadline);
  return `<p class="booking-terms">Prenotazione gratuita · Cancellazione entro ${date}.</p>${Date.now()>deadline?'<p class="booking-terms expired">Per questa fascia il termine di cancellazione è già trascorso.</p>':''}`;
}
function floorplan(resource){
  if(resource==='call')return '';
  const label=resource==='lunch'?'sala pranzo':resourceLabel(resource,state.settings);
  return `<figure class="floorplan"><div class="section-heading"><h3>Piantina ${escapeHtml(label)}</h3><a class="text-button" href="floorplans/${resource}.png" target="_blank" rel="noopener">Apri ingrandita ↗</a></div><a href="floorplans/${resource}.png" target="_blank" rel="noopener" aria-label="Ingrandisci piantina ${escapeHtml(label)}"><img src="floorplans/${resource}.png" alt="Piantina indicativa ${escapeHtml(label)}" loading="lazy"></a><figcaption>Ricostruzione indicativa, non in scala.${resource==='lunch'?' 22 posti prenotabili: 16 ai tavoli T1–T4, 4 a B1 e 2 a B2.':''}</figcaption></figure>`;
}
const diningPositions=[[[56.5,16.8],[49.6,20.8],[63.5,20.8],[56.5,25.7]],[[57,32.7],[64,32.7],[57,40.7],[64,40.7]],[[57,46.3],[64,46.3],[57,54.3],[64,54.3]],[[57,60.3],[64,60.3],[57,68.5],[64,68.5]],[[44.3,76.8],[44.3,82.8],[30.9,87.1],[38.7,87.1]],[[68.1,77.4],[68.1,87.1]]];
function renderDining(){
 if(!LUNCH_SHIFTS.some(t=>t.start===request().start&&t.end===request().end)){const turn=LUNCH_SHIFTS.find(t=>romeInstant(request().date,t.start).getTime()>Date.now())||LUNCH_SHIFTS[1];$('#start-time').value=turn.start;$('#end-time').value=turn.end;selection=null;}
 const r=request(),error=intervalError(r),outside=rangeError('table-1-seat-1',r),available=DINING_SEATS.filter(id=>isFree(state,id,r)).length;
 let markers='';
 for(const table of DINING_TABLES){
   const whole=`table-${table.id}-all`,tableFree=isFree(state,whole,r);
   table.seats&&diningPositions[table.id-1].forEach(([x,y],i)=>{
     const id=seatId(table.id,i+1),target=diningMode==='table'?whole:id,free=diningMode==='table'?tableFree:isFree(state,id,r),chosen=selection===target;
     markers+=`<button type="button" class="plan-seat ${free?'free':'busy'} ${chosen?'chosen':''}" style="left:${x}%;top:${y}%" data-seat="${target}" aria-pressed="${chosen}" aria-label="${escapeHtml(resourceLabel(target,state.settings))}, ${free?'disponibile':'occupato'}" ${!free?'data-inspect-seat="'+target+'"':''} ${free&&(error||outside)?'disabled':''}>${i+1}</button>`;
   });
 }
 const selected=selection?.startsWith('table-'),canBook=selected&&!error&&!outside&&isFree(state,selection,r);
 $('#detail-panel').classList.remove('room-detail');
 $('#detail-panel').innerHTML=`<div class="detail-header"><div><h2>Sala pranzo</h2><p>22 posti · T1–T4, B1 e B2</p></div><span>${available} posti liberi</span></div><div class="lunch-shifts" role="group" aria-label="Turno pranzo">${LUNCH_SHIFTS.map((t,i)=>`<button type="button" data-lunch-shift="${i}" class="${r.start===t.start?'selected':''}" aria-pressed="${r.start===t.start}" ${romeInstant(r.date,t.start).getTime()<=Date.now()?'disabled':''}><strong>Turno ${i+1}</strong><span>${t.start}–${t.end}</span></button>`).join('')}</div><div class="category-tabs dining-modes" role="group" aria-label="Tipo di prenotazione pranzo"><button data-dining-mode="seat" aria-pressed="${diningMode==='seat'}" class="${diningMode==='seat'?'selected':''}">Posto singolo</button><button data-dining-mode="table" aria-pressed="${diningMode==='table'}" class="${diningMode==='table'?'selected':''}">Tavolo intero</button></div><p class="plan-instruction">${diningMode==='seat'?'Clicca un posto sulla piantina per selezionarlo.':'Clicca un posto del tavolo per selezionare tutte le sue sedute. Il tavolo è disponibile solo se tutti i posti sono liberi.'}</p>${outside?`<p class="notice">Pranzo dalle ${state.settings.lunchOpen} alle ${state.settings.lunchClose}. <button class="text-button" id="lunch-time">Vai all’orario pranzo</button></p>`:''}<div class="interactive-floorplan"><img src="floorplans/lunch.png" alt="Piantina sala pranzo con tavoli T1–T4 e tavoli alti B1–B2">${markers}</div><div class="plan-legend"><span>○ Libero</span><span>● Selezionato</span><span>× Occupato</span></div><p class="panel-footnote">Piantina indicativa, non in scala. I numeri identificano i posti prenotabili.</p><div id="dining-occupants" class="notice" role="status" hidden></div>${selected?bookingDetailsForm(true):''}<div class="booking-summary">${selected?`<div class="summary-text"><strong>${resourceLabel(selection,state.settings)}</strong><span>${prettyDate(r.date)} · ${r.start}–${r.end}</span>${bookingTerms(r)}</div><button type="button" class="primary" id="confirm-booking" ${canBook?'':'disabled'}>${diningMode==='table'?'Conferma tavolo':'Conferma posto'}</button>`:'<p>Seleziona sulla piantina un posto o un tavolo libero.</p>'}</div>`;
if(diningInspection?.key===JSON.stringify(request()))paintDiningOccupants(diningInspection.resource);
}
function renderRoomDetail(){const resource=selection,r=request(),error=intervalError(r);let slots='';const duration=minutes(r.end)-minutes(r.start);const chosenDuration=duration>0&&duration<=state.settings.maxDuration?duration:30;for(let time=minutes(state.settings.open);time+chosenDuration<=minutes(state.settings.close);time+=30){const rr={date:r.date,start:timeString(time),end:timeString(time+chosenDuration)},free=isFree(state,resource,rr)&&romeInstant(rr.date,rr.start).getTime()>Date.now();slots+=`<button type="button" class="slot ${r.start===rr.start?'chosen':''}" data-slot="${rr.start}" ${free?'':'disabled'} aria-label="${rr.start}–${rr.end}, ${free?'disponibile':'occupato'}">${rr.start}–${rr.end}</button>`;}
$('#detail-panel').classList.add('room-detail');$('#detail-panel').innerHTML=`<div class="detail-header"><div><h2>${escapeHtml(resourceLabel(resource,state.settings))}</h2><p>Riservata interamente a te e ai tuoi ospiti.</p></div>${category==='tutti'?'<button type="button" class="text-button" data-open-lunch="true">Vedi sala pranzo</button>':''}</div>${resource==='call'?'<div class="room-detail-icon">'+icons.call+'</div>':floorplan(resource)}${bookingDetailsForm()}<h3>Fasce disponibili</h3><button type="button" class="text-button" data-next-free="${resource}">Cerca il prossimo slot libero</button><p>Durata selezionata: ${chosenDuration} minuti. Gli orari occupati non sono selezionabili.</p><div class="slot-grid">${slots}</div><div class="booking-summary"><div class="summary-text"><strong>${prettyDate(r.date)}</strong><span>${r.start}–${r.end} · Uso esclusivo</span>${bookingTerms(r)}</div><button type="button" class="primary" id="confirm-booking" ${error||rangeError(resource,r)||!isFree(state,resource,r)?'disabled':''}>Conferma sala</button></div>`;}
function renderBooking(){const draftTitle=$('#booking-title')?.value,draftPurpose=$('#booking-purpose')?.value;const error=intervalError();$('#filter-error').hidden=!error;$('#filter-error').textContent=error||'';$('#rooms-panel').hidden=category==='pranzo';$('.booking-layout').classList.toggle('full-layout',category==='pranzo');if(selection&&ROOM_IDS.includes(selection))renderRoomDetail();else if(category==='pranzo')renderDining();else{$('#detail-panel').classList.remove('room-detail');$('#detail-panel').innerHTML=`<div class="empty-state"><h2>Scegli lo spazio che ti serve</h2><p>Seleziona una sala per consultarne gli orari e prenotare. Per il pranzo, scegli un posto o un tavolo sulla piantina.</p></div>`;}renderRooms();const finalError=intervalError();$('#filter-error').hidden=!finalError;$('#filter-error').textContent=finalError||'';if($('#booking-title'))$('#booking-title').value=draftTitle||sessionUser?.name||'';if(draftPurpose&&$('#booking-purpose'))$('#booking-purpose').value=draftPurpose;updateBookingCount();updateQuickControls();$('#booking-action-error').hidden=true;}
function bookingRow(b,compact=false){const label=resourceLabel(b.resource,state.settings),lunch=b.resource.startsWith('table-'),active=b.status==='confirmed',past=!!b.endedAt||b.date<todayRome()||(b.date===todayRome()&&Date.now()>=romeInstant(b.date,b.end).getTime());return `<article class="booking-row ${b.id===lastConfirmedId?'new-booking':''}" data-booking-id="${b.id}">${icons[lunch?'seat':b.resource==='call'?'call':'room']}<div class="booking-text">${active&&!lunch&&!past?`<button type="button" class="booking-resource-title" data-code="${b.id}" aria-label="Apri codice di ${escapeHtml(label)}, ${prettyDate(b.date)}, ${b.start}–${b.end}">${escapeHtml(label)}</button>`:`<strong>${escapeHtml(label)}</strong>`}<p>${b.name||b.title?escapeHtml(b.name||b.title)+' · ':''}${prettyDate(b.date)} · ${b.start}–${b.end}${lunch&&!b.resource.endsWith('-all')?' · 1 posto':''}</p>${active&&!past&&cancellationError(state,b)?`<p class="cancellation-note">${escapeHtml(cancellationError(state,b))}</p>`:''}${b.purpose?`<p class="booking-purpose">${escapeHtml(b.purpose)}</p>`:''}${active&&!lunch&&!past?`<button type="button" class="booking-code-button" data-code="${b.id}" aria-label="Codice ${escapeHtml(label)}, ${prettyDate(b.date)}, ${b.start}–${b.end}">Codice</button>`:''}${cancelId===b.id?`<div class="cancel-confirm">Annullare questa prenotazione?<button class="text-button danger" data-confirm-cancel="${b.id}">Sì, annulla</button><button class="text-button" data-abort-cancel="${b.id}">Mantieni</button></div>`:''}</div><span class="booking-tag ${active?'':'cancelled'}">${active?b.endedAt?'Riunione terminata':b.checkedInAt?'Riunione in corso':past?'Conclusa':'Confermata':'Annullata'}</span>${compact?'':`<div class="booking-actions">${active?`<button type="button" class="text-button" data-export="${b.id}">Esporta iCal</button>${!past?`<a class="text-button" href="${escapeHtml(googleCalendarUrl(b,state.settings))}" target="_blank" rel="noopener">Google Calendar</a><button type="button" class="text-button danger" data-cancel="${b.id}" ${cancellationError(state,b)?'disabled title="'+escapeHtml(cancellationError(state,b))+'"':''}>Annulla</button>`:''}`:''}</div>`}</article>`;}
function sortedBookings(){return [...state.bookings].sort((a,b)=>`${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));}
function updateBookingCount(){$('#nav-count').textContent=state.bookings.filter(b=>isUpcoming(b)).length;}
function renderHistory(){
  const query=$('#booking-search').value.trim().toLocaleLowerCase('it');
  const bookings=sortedBookings().filter(b=>history==='tutte'||history==='attive'&&isUpcoming(b)||history==='passate'&&b.status==='confirmed'&&!isUpcoming(b)||history==='annullate'&&b.status==='cancelled').filter(b=>!query||`${b.title||''} ${b.name||''} ${b.purpose||''} ${resourceLabel(b.resource,state.settings)} ${b.date} ${b.start}`.toLocaleLowerCase('it').includes(query));
  $('#history-total').textContent=`${bookings.length} ${bookings.length===1?'prenotazione':'prenotazioni'}`;
  $('#history-list').innerHTML=bookings.length?bookings.map(b=>bookingRow(b)).join(''):`<div class="empty-state"><h2>${query?'Nessun risultato':'Nessuna prenotazione in questa sezione'}</h2><p>${query?'Prova con il nome di un’altra sala o una data.':'Le prenotazioni compariranno qui dopo la conferma.'}</p>${query?'<button class="secondary" id="clear-search">Cancella ricerca</button>':'<button class="primary" data-view="prenota">Prenota uno spazio</button>'}</div>`;
}
function renderCalendar(){
  const previousRegion=$('.slot-calendar');
  const previousScroll={top:previousRegion?.scrollTop||0,left:previousRegion?.scrollLeft||0,focused:document.activeElement===previousRegion};
  const date=$('#calendar-date').value||todayRome(),filter=$('#calendar-resource').value;
  const resources=filter==='all'?[...ROOM_IDS,'lunch']:[filter];
  const s=state.settings;
  let rows='';
  for(let minute=minutes(s.open);minute<minutes(s.close);minute+=30){
    const start=timeString(minute),end=timeString(minute+30),rr={date,start,end};
    let cells='';
    for(const resource of resources){
      const lunch=resource==='lunch',label=lunch?'Sala pranzo':resourceLabel(resource,s);
      const outside=lunch?!LUNCH_SHIFTS.some(t=>t.start===start&&t.end===end):minute<minutes(s.open)||minute+30>minutes(s.close);
      const closure=closedReason(state,lunch?'table-1-seat-1':resource,rr);
      const past=romeInstant(date,start).getTime()<=Date.now();
      let available=lunch?DINING_SEATS.filter(id=>isFree(state,id,rr)).length:(isFree(state,resource,rr)?1:0);
      const occupants=[...state.bookings,...state.seeds].filter(b=>occupiesCapacity(b)&&overlaps(b,rr)&&(lunch?b.resource.startsWith('table-'):b.resource===resource));
      const details=occupants.map(b=>`${b.name||b.title||'Prenotazione di esempio (demo)'}${b.purpose?' · '+b.purpose:''}`).join('; ');
      const mine=state.bookings.some(b=>b.status==='confirmed'&&overlaps(b,rr)&&(lunch?b.resource.startsWith('table-'):b.resource===resource));
      let status=outside?'Chiuso':closure?'Chiusura programmata':past?'Trascorso':available?lunch?`${available} posti liberi`:'Disponibile':mine?'Prenotato da te':'Occupato';
      const kind=outside||closure||past?'closed':available?'free':mine?'mine':'busy';
      const enabled=!outside&&!closure&&!past;
      cells+=`<td><button type="button" class="calendar-slot ${kind}" data-calendar-slot="${start}" data-calendar-space="${resource}" data-calendar-day="${date}" data-calendar-occupied="${available===0}" aria-label="${escapeHtml(label)}, ${prettyDate(date)}, ${start}–${end}, ${status}${details?', '+escapeHtml(details):''}" ${enabled?'':'disabled'}><strong>${status}</strong>${!outside&&details?`<span class="calendar-booking-details">${escapeHtml(details)}</span>`:''}<span>${outside||closure||past?'':available?lunch?'Scegli un posto':'Prenota sala':'Vedi altri orari'}</span></button></td>`;
    }
    rows+=`<tr><th scope="row">${start}<span>${end}</span></th>${cells}</tr>`;
  }
  $('#calendar-content').innerHTML=`<div class="calendar-day-heading"><button type="button" class="secondary" data-calendar-shift="-1" aria-label="Giorno precedente">←</button><h2>${prettyDate(date)}</h2><button type="button" class="secondary" data-calendar-shift="1" aria-label="Giorno successivo">→</button><div class="legend"><span><i></i>Disponibile</span><span><i class="busy"></i>Occupato</span></div></div><p class="calendar-help">Ogni riga è uno slot di 30 minuti. Gli slot prenotati mostrano il nome del referente e il motivo. Clicca Disponibile per prenotare oppure Occupato per vedere gli altri orari. Per il pranzo scegli poi il singolo posto.</p><div class="calendar-table-wrap slot-calendar ${resources.length===1?'single-resource':''}" tabindex="0" role="region" aria-label="Calendario a slot scorribile"><table><caption class="sr-only">Disponibilità degli spazi per ${prettyDate(date)}, slot di 30 minuti</caption><thead><tr><th scope="col">Orario</th>${resources.map(id=>`<th scope="col">${escapeHtml(id==='lunch'?'Sala pranzo':resourceLabel(id,s))}${id==='lunch'?'<small>6 tavoli · 22 posti</small>':'<small>Uso esclusivo</small>'}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const currentRegion=$('.slot-calendar');currentRegion.scrollTop=previousScroll.top;currentRegion.scrollLeft=previousScroll.left;if(previousScroll.focused)currentRegion.focus({preventScroll:true});
}
function renderSettings(){const form=$('#settings-form');form.dataset.revision=state.settings.revision??1;for(const key of ['open','close','lunchOpen','lunchClose','maxDuration','maxUpcoming','cancellationCutoff'])form.elements[key].value=state.settings[key];$('#room-names').innerHTML=state.settings.names.map((name,i)=>`<label>${i===3?'Sala call':`Sala riunioni ${i+1}`}<input name="room-${i}" value="${escapeHtml(name)}" maxlength="50" required></label>`).join('');}
const titles={prenota:['Prenota uno spazio','Scegli giorno e orario, poi una sala o il tuo posto a pranzo.'],prenotazioni:['Le mie prenotazioni','I tuoi appuntamenti, tutti in un posto.'],calendario:['Il calendario degli spazi','Consulta le prenotazioni della giornata e trova la fascia giusta.'],checkin:['Tablet sala','Inserisci il codice per avviare o terminare la riunione.'],gestione:['Gestione della demo','Adatta nomi e orari per provare la tua organizzazione.']};
function switchView(next){if(sharedMode&&(next==='gestione'&&sessionUser.role!=='ADMIN'||next==='checkin'&&!['ADMIN','OPERATOR'].includes(sessionUser.role)))next='prenota';const previousView=view;view=next;cancelId=null;history=history||'attive';$('#page-title').innerHTML=titles[next][0];$('#page-subtitle').textContent=titles[next][1];for(const [id,key]of[['booking-view','prenota'],['my-view','prenotazioni'],['calendar-view','calendario'],['admin-view','gestione'],['checkin-view','checkin']])$(`#${id}`).hidden=next!==key;document.querySelectorAll('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);if(b.dataset.view===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(next==='prenota')renderBooking();if(next==='prenotazioni')renderHistory();if(next==='calendario'){if(previousView==='prenota')$('#calendar-date').value=request().date||todayRome();renderCalendar();}if(next==='gestione'){renderSettings();renderBlocks();renderAdmin();}if(next==='checkin')renderCheckIn();stopCamera();if(sharedMode)refreshState();location.hash=next;window.scrollTo({top:0,behavior:'auto'});}
function renderAll(){updateBookingCount();if(view==='prenota')renderBooking();if(view==='prenotazioni')renderHistory();if(view==='calendario')renderCalendar();if(view==='checkin')renderCheckIn();}
async function confirmBooking(){
  if(!selection||bookingInFlight)return;
  bookingInFlight=true;const resource=selection,rr=request(),title=$('#booking-title')?.value.trim()||'',purpose=$('#booking-purpose')?.value.trim()||'';if(title.length<2||!resource.startsWith('table-')&&purpose.length<3){bookingInFlight=false;showBookingError(resource.startsWith('table-')?'Inserisci nome e cognome della persona.':'Inserisci il nome del referente e per cosa serve lo spazio.');return;}
  const button=$('#confirm-booking');if(button){button.disabled=true;button.textContent='Conferma in corso…';}
  const commit=async()=>{
    if(!sharedMode)refreshState();const payload={resource,...rr,name:title,purpose};const fingerprint=JSON.stringify(payload);if(!bookingAttempt||bookingAttempt.fingerprint!==fingerprint)bookingAttempt={fingerprint,id:crypto.randomUUID()};const result=sharedMode?await api('/bookings',{...payload,requestId:bookingAttempt.id}):createBooking(state,resource,rr,title,purpose);if(sharedMode){if(result.booking&&!state.bookings.some(b=>b.id===result.booking.id))state.bookings.push(result.booking);await reloadShared().catch(()=>{});}
    if(result.error){renderBooking();showBookingError(result.error);return;}
    save();bookingAttempt=null;lastConfirmedId=result.booking.id;selection=null;
    history='attive';$('#booking-search').value='';
    document.querySelectorAll('[data-history]').forEach(b=>{b.classList.toggle('selected',b.dataset.history===history);b.setAttribute('aria-pressed',b.dataset.history===history);});
    renderAll();
    $('#page-title').setAttribute('tabindex','-1');$('#page-title').focus({preventScroll:true});
    $('#booking-success-location').textContent=resource.startsWith('table-')?'Trovi il riepilogo in “Le mie prenotazioni”. Per il pranzo non serve un codice stanza.':'Troverai il codice in “Le mie Prenotazioni”.';
    $('#booking-success-dialog').showModal();

  };
  try{if(navigator.locks)await navigator.locks.request('spazi-demo-booking',commit);else await commit();}
  catch(error){if(sharedMode)await reloadShared().catch(()=>{});renderBooking();showBookingError(error.message||'Non è stato possibile completare la prenotazione. Riprova.');}
  finally{bookingInFlight=false;}
}
function showBookingError(message){const box=$('#booking-action-error');box.hidden=false;box.textContent=message;box.focus({preventScroll:true});}
function updateQuickControls(){
  const rr=request(),duration=minutes(rr.end)-minutes(rr.start);
  document.querySelectorAll('[data-duration]').forEach(b=>{const value=Number(b.dataset.duration);b.disabled=value>state.settings.maxDuration||minutes(rr.start)+value>minutes(state.settings.close);b.setAttribute('aria-pressed',value===duration);});
  $('#selected-range').textContent=rr.date?`${prettyDate(rr.date)} · ${rr.start}–${rr.end} · ${duration} minuti`:'';
}

function exportBooking(id){const booking=state.bookings.find(b=>b.id===id);if(!booking)return;const blob=new Blob([calendarText(booking,state.settings)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`prenotazione-${id.slice(0,8)}.ics`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('File iCal esportato. L’importazione nel calendario è una copia.');}
document.addEventListener('click',async event=>{const target=event.target.closest('button');if(!target)return;if(target.dataset.view){switchView(target.dataset.view);return;}if(target.dataset.duration){
  $('#end-time').value=timeString(minutes(request().start)+Number(target.dataset.duration));renderBooking();return;
}
if(target.id==='tomorrow'){$('#booking-date').value=addDays(todayRome(),1);selection=null;renderBooking();return;}
if(target.id==='clear-search'){$('#booking-search').value='';renderHistory();$('#booking-search').focus();return;}
if(target.dataset.nextFree){
  refreshState();const result=findNextSlot(state,target.dataset.nextFree,request());if(result.error){toast(result.error);showBookingError(result.error);return;}
  $('#booking-date').value=result.request.date;$('#start-time').value=result.request.start;$('#end-time').value=result.request.end;selection=target.dataset.nextFree;renderBooking();$('#booking-title')?.focus({preventScroll:true});toast(`Prima fascia libera: ${prettyDate(result.request.date)}, ${result.request.start}–${result.request.end}.`);return;
}
if(target.dataset.calendarShift){$('#calendar-date').value=addDays($('#calendar-date').value||todayRome(),Number(target.dataset.calendarShift));renderCalendar();return;}
if(target.dataset.calendarSlot){
  $('#booking-date').value=target.dataset.calendarDay;
  $('#start-time').value=target.dataset.calendarSlot;
  $('#end-time').value=timeString(minutes(target.dataset.calendarSlot)+30);
  category=target.dataset.calendarSpace==='lunch'?'pranzo':'riunioni';
  selection=target.dataset.calendarSpace==='lunch'?null:target.dataset.calendarSpace;
  document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b.dataset.category===category);b.setAttribute('aria-pressed',b.dataset.category===category);});
  switchView('prenota');if(target.dataset.calendarOccupied==='true')toast('Questa fascia è occupata. Scegli un altro orario disponibile.');$('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#detail-panel').querySelector('input, [data-seat]:not([disabled])')?.focus({preventScroll:true});return;
}
if(target.dataset.openLunch){
  category='pranzo';selection=null;
  if(rangeError('table-1-seat-1')){$('#start-time').value=state.settings.lunchOpen;$('#end-time').value=timeString(minutes(state.settings.lunchOpen)+30);}
  document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b.dataset.category===category);b.setAttribute('aria-pressed',b.dataset.category===category);});
  renderBooking();$('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'});return;
}
if(target.dataset.lunchShift!==undefined){const turn=LUNCH_SHIFTS[Number(target.dataset.lunchShift)];$('#start-time').value=turn.start;$('#end-time').value=turn.end;selection=null;renderBooking();return;}if(target.dataset.diningMode){diningMode=target.dataset.diningMode;selection=null;renderBooking();return;}if(target.dataset.category){category=target.dataset.category;selection=null;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b===target);b.setAttribute('aria-pressed',b===target);});if(category==='pranzo'&&rangeError('table-1-seat-1')){$('#start-time').value=state.settings.lunchOpen;$('#end-time').value=timeString(minutes(state.settings.lunchOpen)+30);}renderBooking();return;}if(target.dataset.room){selection=target.dataset.room;renderBooking();$('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'});$('#detail-panel').setAttribute('tabindex','-1');$('#detail-panel').focus({preventScroll:true});return;}if(target.dataset.inspectSeat){await showDiningOccupants(target.dataset.inspectSeat);return;}if(target.dataset.seat){diningInspection=null;selection=selection===target.dataset.seat?null:target.dataset.seat;renderBooking();document.querySelector('[data-seat="'+target.dataset.seat+'"]')?.focus({preventScroll:true});return;}if(target.dataset.slot){const duration=Math.max(30,Math.min(state.settings.maxDuration,minutes(request().end)-minutes(request().start)));$('#start-time').value=target.dataset.slot;$('#end-time').value=timeString(minutes(target.dataset.slot)+duration);renderBooking();document.querySelector('[data-slot="'+target.dataset.slot+'"]')?.focus({preventScroll:true});return;}if(target.id==='show-dining'){selection=null;renderBooking();return;}if(target.id==='lunch-time'){$('#start-time').value=state.settings.lunchOpen;$('#end-time').value=timeString(minutes(state.settings.lunchOpen)+30);selection=null;renderBooking();return;}if(target.id==='today'){const rr=nextOpeningRequest(state.settings);$('#booking-date').value=todayRome();$('#start-time').value=rr.date===todayRome()?rr.start:timeString(minutes(state.settings.close)-30);$('#end-time').value=rr.date===todayRome()?rr.end:state.settings.close;selection=null;renderBooking();return;}if(target.id==='confirm-booking'){confirmBooking();return;}if(target.dataset.history){history=target.dataset.history;document.querySelectorAll('[data-history]').forEach(b=>{b.classList.toggle('selected',b===target);b.setAttribute('aria-pressed',b===target);});renderHistory();return;}if(target.dataset.cancel){cancelId=target.dataset.cancel;renderHistory();return;}if(target.dataset.abortCancel){cancelId=null;renderHistory();return;}if(target.dataset.confirmCancel){refreshState();const b=state.bookings.find(b=>b.id===target.dataset.confirmCancel);if(b){let result;try{result=sharedMode?await api(`/bookings/${b.id}/cancel`,{}):cancelBooking(state,b.id);if(sharedMode)await reloadShared();}catch(error){toast(error.message);return;}if(result.error){toast(result.error);return;}save();}cancelId=null;renderAll();toast('Prenotazione annullata. Lo spazio è di nuovo disponibile.');return;}if(target.dataset.code){showCode(target.dataset.code);return;}if(target.dataset.removeBlock){if(sharedMode){try{await api('/admin/blocks/remove',{id:target.dataset.removeBlock});await reloadShared();renderBlocks();toast('Chiusura rimossa.');}catch(error){toast(error.message);}return;}state.blocks=state.blocks.filter(b=>b.id!==target.dataset.removeBlock);save();renderBlocks();toast('Chiusura rimossa.');return;}if(target.dataset.export){exportBooking(target.dataset.export);return;}if(target.dataset.bookCalendar){$('#booking-date').value=target.dataset.bookCalendar;switchView('prenota');return;}if(target.id==='reset-demo'){$('#reset-confirm').hidden=false;target.hidden=true;return;}if(target.id==='abort-reset'){$('#reset-confirm').hidden=true;$('#reset-demo').hidden=false;return;}if(target.id==='confirm-reset'){state=createInitialState();selection=null;save();setupTimes();updateResourceOptions();renderSettings();renderBlocks();renderAll();$('#reset-confirm').hidden=true;$('#reset-demo').hidden=false;toast('Demo ripristinata.');}});
$('#filters').addEventListener('submit',e=>e.preventDefault());$('#booking-date').addEventListener('change',()=>{selection=null;renderBooking();});$('#start-time').addEventListener('change',()=>{if(minutes(request().end)<=minutes(request().start))$('#end-time').value=timeString(minutes(request().start)+30);if(selection?.startsWith('table-'))selection=null;renderBooking();});$('#end-time').addEventListener('change',()=>{if(selection?.startsWith('table-'))selection=null;renderBooking();});
$('#calendar-date').addEventListener('change',renderCalendar);$('#calendar-resource').addEventListener('change',renderCalendar);
$('#settings-form').onsubmit=async event=>{event.preventDefault();const form=event.target,next={...state.settings};if(sharedMode)next.revision=Number(form.dataset.revision);for(const key of ['open','close','lunchOpen','lunchClose'])next[key]=form.elements[key].value;next.maxDuration=Number(form.elements.maxDuration.value);next.maxUpcoming=Number(form.elements.maxUpcoming.value);next.cancellationCutoff=Number(form.elements.cancellationCutoff.value);next.names=state.settings.names.map((_,i)=>form.elements[`room-${i}`].value.trim());let error=null;if(minutes(next.close)<=minutes(next.open)||minutes(next.lunchClose)<=minutes(next.lunchOpen))error='La chiusura deve essere successiva all’apertura.';if(Object.entries(next).some(([k,v])=>['open','close','lunchOpen','lunchClose'].includes(k)&&minutes(v)%30))error='Gli orari devono essere allineati a intervalli di 30 minuti.';if(minutes(next.lunchOpen)<minutes(next.open)||minutes(next.lunchClose)>minutes(next.close))error='L’orario del pranzo deve rientrare negli orari di apertura.';if(next.names.some(n=>!n))error='Inserisci un nome per ogni sala.';if(!error&&state.bookings.some(b=>isUpcoming(b)&&(minutes(b.end)-minutes(b.start)>next.maxDuration||minutes(b.start)<minutes(b.resource.startsWith('table-')?next.lunchOpen:next.open)||minutes(b.end)>minutes(b.resource.startsWith('table-')?next.lunchClose:next.close))))error='Queste regole sono in conflitto con una tua prenotazione attiva. Annullala prima di modificare gli orari.';$('#settings-error').hidden=!error;$('#settings-error').textContent=error||'';if(error)return;if(sharedMode){try{await api('/admin/settings',next);await reloadShared();setupTimes();updateResourceOptions();renderSettings();toast('Impostazioni condivise salvate.');}catch(error){$('#settings-error').hidden=false;$('#settings-error').textContent=error.message;}return;}state.settings=next;auditEvent(state,'SETTINGS_UPDATED');save();setupTimes();updateResourceOptions();updateBookingCount();toast('Impostazioni salvate in questo browser.');};
function updateResourceOptions(){const old=$('#calendar-resource').value;$('#calendar-resource').innerHTML='<option value="all">Tutti gli spazi</option>'+ROOM_IDS.map(id=>`<option value="${id}">${escapeHtml(resourceLabel(id,state.settings))}</option>`).join('')+'<option value="lunch">Sala pranzo</option>';$('#calendar-resource').value=old||'all';}
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY){refreshState();renderAll();}});window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(titles[next]&&next!==view)switchView(next);});


function stopCamera(){}
let codeRequest=0;
async function showCode(id){
  const booking=state.bookings.find(b=>b.id===id);if(!booking)return;
  const attempt=++codeRequest,dialog=$('#code-dialog');
  $('#code-title').textContent=resourceLabel(booking.resource,state.settings);
  $('#code-description').textContent='Caricamento del codice riunione…';
  $('#meeting-code').value='';$('#copy-code').disabled=true;dialog.setAttribute('aria-busy','true');
  if(!dialog.open)dialog.showModal();
  try{const code=sharedMode?(await api(`/bookings/${id}/code`,{})).code:accessCode(booking);
    if(attempt!==codeRequest||!dialog.open)return;
    $('#code-description').textContent=prettyDate(booking.date)+' · '+booking.start+'–'+booking.end+'. Inserisci questo codice sul tablet della sala.';
    if(!sharedMode)save();$('#meeting-code').value=code;$('#copy-code').disabled=false;
  }catch(error){if(attempt===codeRequest&&dialog.open)$('#code-description').textContent=error.message+' Chiudi e riprova.';}
  finally{if(attempt===codeRequest)dialog.removeAttribute('aria-busy');}
}
const meetingTime=value=>value?new Date(value).toLocaleTimeString('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit'}):'—';
async function renderCheckIn(){
  let presences=state.bookings.filter(b=>b.checkedInAt);if(sharedMode){try{presences=(await api('/attendance')).bookings;}catch(error){toast(error.message);return;}}
  $('#presence-list').innerHTML=presences.map(b=>'<div class="booking-row"><div class="booking-text"><strong>'+escapeHtml(resourceLabel(b.resource,state.settings))+'</strong><p>'+prettyDate(b.date)+' · Inizio '+meetingTime(b.checkedInAt)+' · Termine '+meetingTime(b.endedAt)+'</p></div><span class="booking-tag">'+(b.endedAt?'Terminata':'In corso')+'</span></div>').join('')||'<p class="empty-state">Nessuna riunione avviata.</p>';
}
let meetingTicker=null,currentMeeting=null,currentMeetingCode=null,meetingRefreshing=false;
$('#checkin-view h2').textContent='Avvia la riunione';
function meetingResult(result,code){
 clearInterval(meetingTicker);meetingTicker=null;
 const box=$('#checkin-result');box.hidden=false;box.replaceChildren();
 if(result.error){box.textContent=result.error;$('#verify-checkin').hidden=false;$('#checkin-view h2').hidden=false;return;}
 if(result.serverNow)serverOffset=result.serverNow-Date.now();
 currentMeeting=result.booking;currentMeetingCode=code;const b=result.booking,p=document.createElement('p');p.textContent=resourceLabel(b.resource,state.settings)+' · '+prettyDate(b.date)+' · '+b.start+'–'+b.end+' · Referente: '+(b.name||b.title||'—')+' · '+(b.endedAt?'Riunione terminata alle '+meetingTime(b.endedAt):b.checkedInAt?'In corso dalle '+meetingTime(b.checkedInAt):'Pronta per iniziare');box.append(p);
 const running=!!b.checkedInAt&&!b.endedAt;
 $('#verify-checkin').hidden=true;$('#checkin-view .settings-form>p').hidden=true;$('#checkin-view h2').hidden=!b.checkedInAt; p.hidden=!b.checkedInAt;$('#checkin-view h2').textContent=b.endedAt?'Riunione terminata':running?'Riunione in corso':'Avvia la riunione';
 try{if(running)sessionStorage.setItem('spazi-active-meeting',code);else sessionStorage.removeItem('spazi-active-meeting');}catch{}
 if(b.checkedInAt){const label=document.createElement('p');label.className='meeting-duration-label';label.textContent=b.endedAt?'Durata della riunione':'Durata in corso';const timer=document.createElement('div');timer.className='meeting-timer';timer.setAttribute('role','timer');timer.setAttribute('aria-label','Durata della riunione');box.append(label,timer);const tick=()=>{const seconds=Math.max(0,Math.floor(((b.endedAt?Date.parse(b.endedAt):Date.now()+serverOffset)-Date.parse(b.checkedInAt))/1000));timer.textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');};tick();if(running)meetingTicker=setInterval(tick,1000);}
 const controls=document.createElement('div');controls.className='meeting-actions';box.append(controls);
 if(b.endedAt){const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.textContent='Nuova riunione';reset.onclick=()=>{currentMeeting=null;currentMeetingCode=null;$('#checkin-code').value='';$('#checkin-result').hidden=true;$('#verify-checkin').hidden=false;$('#checkin-view .settings-form>p').hidden=false;$('#checkin-view h2').hidden=false;$('#checkin-view h2').textContent='Avvia la riunione';$('#checkin-code').focus();};controls.append(reset);return;}
 for(const [action,label]of[running?['end','Termina riunione']:['start','Inizia riunione']]){const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=label;controls.append(button);
 button.onclick=async()=>{controls.querySelectorAll('button').forEach(el=>el.disabled=true);let next;try{refreshState();next=sharedMode?await api('/meetings/'+action,{code}):action==='start'?registerCheckIn(state,code):endMeeting(state,code);if(!next.error){save();if(sharedMode)await reloadShared().catch(()=>{});renderAll();}}catch(error){next={error:error.message};}if(next.error){meetingResult(result,code);const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=next.error;box.append(error);}else{meetingResult(next,code);toast(action==='start'?'Riunione avviata.':'Riunione terminata.');}};
 }
}
$('#verify-checkin').addEventListener('submit',async e=>{e.preventDefault();const code=$('#checkin-code').value.trim(),button=e.submitter||$('#verify-checkin button[type="submit"]');button.disabled=true;try{refreshState();const result=sharedMode?await api('/meetings/verify',{code}):verifyCheckIn(state,code);meetingResult(result,code);}catch(error){meetingResult({error:error.message},code);}finally{button.disabled=false;}});
$('#checkin-code').addEventListener('input',()=>{clearInterval(meetingTicker);$('#checkin-result').hidden=true;$('#checkin-result').replaceChildren();});
$('#code-close').onclick=()=>$('#code-dialog').close();
$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText($('#meeting-code').value);toast('Codice copiato.');}catch{$('#meeting-code').select();toast('Seleziona e copia il codice manualmente.');}};

function renderBlocks(){
  const select=$('#block-resource');select.innerHTML='<option value="all">Tutti gli spazi</option><option value="lunch">Sala pranzo</option>'+ROOM_IDS.map(id=>`<option value="${id}">${escapeHtml(resourceLabel(id,state.settings))}</option>`).join('');
  $('#blocks-list').innerHTML=(state.blocks||[]).map(b=>`<div class="booking-row"><div class="booking-text"><strong>${escapeHtml(b.resource==='all'?'Tutti gli spazi':b.resource==='lunch'?'Sala pranzo':resourceLabel(b.resource,state.settings))}</strong><p>${prettyDate(b.date)} · ${escapeHtml(b.reason)}</p></div><button type="button" class="text-button danger" data-remove-block="${b.id}">Rimuovi chiusura</button></div>`).join('')||'<p class="empty-state">Nessuna chiusura programmata.</p>';
}
$('#block-form').onsubmit=async e=>{e.preventDefault();refreshState();const date=$('#block-date').value,resource=$('#block-resource').value,reason=$('#block-reason').value.trim();if(date<todayRome()){toast('Scegli oggi o un giorno futuro.');return;}if([...state.bookings,...state.seeds].some(b=>b.date===date&&b.status==='confirmed'&&!b.endedAt&&(resource==='all'||resource===b.resource||resource==='lunch'&&b.resource.startsWith('table-')))){toast('Ci sono prenotazioni confermate per questo spazio e giorno. Gestiscile prima di aggiungere una chiusura.');return;}if(sharedMode){try{await api('/admin/blocks',{date,resource,reason});await reloadShared();renderBlocks();toast('Chiusura salvata per tutti gli utenti.');}catch(error){toast(error.message);}return;}state.blocks.push({id:crypto.randomUUID(),date,resource,reason:reason||'Manutenzione'});auditEvent(state,'SPACE_CLOSED');save();renderBlocks();toast('Chiusura programmata salvata.');};
setInterval(()=>{if(document.hidden)return;const active=document.activeElement;if(active?.tagName==='INPUT'||active?.tagName==='TEXTAREA'||active?.tagName==='SELECT'||$('#code-dialog').open||!$('#booking-action-error').hidden)return;refreshState();renderAll();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshState();renderAll();}else stopCamera();});
window.addEventListener('pagehide',stopCamera);

if(new URLSearchParams(location.search).has('tablet')){document.body.classList.add('tablet-mode');location.hash='checkin';}
configureAccess();
$('#booking-date').value=todayRome();$('#booking-date').min=todayRome();$('#booking-date').max=addDays(todayRome(),30);$('#calendar-date').value=todayRome();setupTimes();const firstRequest=nextOpeningRequest(state.settings);$('#booking-date').value=firstRequest.date;$('#start-time').value=firstRequest.start;$('#end-time').value=firstRequest.end;updateResourceOptions();save();switchView(titles[location.hash.slice(1)]?location.hash.slice(1):'prenota');

$('#booking-search').addEventListener('input',renderHistory);
$('#new-user-role').addEventListener('change',()=>{$('#new-user-tablet').disabled=$('#new-user-role').value!=='OPERATOR';});
$('#new-user-tablet').innerHTML='<option value="">Tutte le sale</option>'+ROOM_IDS.map(id=>'<option value="'+id+'">'+escapeHtml(resourceLabel(id,state.settings))+'</option>').join('');
$('#new-user-tablet').disabled=$('#new-user-role').value!=='OPERATOR';
$('#settings-form').elements.maxUpcoming.parentElement.firstChild.textContent='Sale riunioni e call per utente a settimana';
try{const activeCode=sessionStorage.getItem('spazi-active-meeting');if(activeCode&&view==='checkin'){ $('#checkin-code').value=activeCode;$('#verify-checkin').requestSubmit();}}catch{}

function configureAccess(){
  $('.demo-badge').textContent=sharedMode?'Account aziendale':'Demo locale';if(sharedMode){titles.gestione=['Gestione spazi e utenti','Gestisci account, prenotazioni e regole della struttura.'];titles.checkin=['Tablet sala','Inserisci il codice per avviare o terminare la riunione.'];$('.page-footer span:first-child').textContent='Spazi · Prenotazioni aziendali';}
  if(sharedMode){
    $('.sidebar-bottom strong').textContent=sessionUser.name;
    $('.sidebar-bottom span').textContent={ADMIN:'Amministratore',OPERATOR:'Operatore',USER:'Utente'}[sessionUser.role];
    $('.user-avatar').textContent=sessionUser.name.split(' ').slice(0,2).map(v=>v[0]).join('').toUpperCase();
    $('[data-view="gestione"]').hidden=sessionUser.role!=='ADMIN';$('[data-view="checkin"]').hidden=!['ADMIN','OPERATOR'].includes(sessionUser.role);
    $('.reset-section').hidden=true;$('.demo-caption').textContent='Dati condivisi e accesso protetto';
    $('#admin-notice').textContent='Modifiche condivise tra gli utenti. Le autorizzazioni sono verificate dal server.';
    $('#checkin-notice').textContent='Tablet condiviso: inserisci il codice della prenotazione. Inizio disponibile da 15 minuti prima a 15 minuti dopo l’orario previsto.';
    $('.page-footer span:last-child').textContent='Prenotazioni condivise · Nessun pagamento';$('#account-mobile').textContent='Esci';
    $('#account-action').textContent='Esci';$('.availability-note').textContent='Disponibilità condivisa';document.documentElement.style.setProperty('--nav-count',sessionUser.role==='ADMIN'?'5':sessionUser.role==='OPERATOR'?'4':'3');
  }
  if(connection.online&&!sharedMode)openAccess();
}
function openAccess(){
  const change=sessionUser?.mustChangePassword,setup=connection.setupRequired;
  $('#access-title').textContent=change?'Cambia la password iniziale':setup?'Configura l’amministratore':'Accedi a Spazi';
  $('#access-description').textContent=change?'Scegli una password personale prima di iniziare.':setup?'Crea il primo amministratore dal computer che ospita il servizio. Sarà lui a creare gli account degli altri utenti.':'Usa l’account creato dal tuo amministratore.';
  $('#access-name-label').hidden=false;$('#access-surname-label').hidden=false;$('#access-email-label').hidden=false;$('#access-door-code-label').hidden=false;
  $('#access-submit').textContent=setup?'Crea amministratore':'Accedi';
  $('#access-submit').disabled=setup&&!connection.setupAllowed;
  $('#demo-access').hidden=!!change||!connection.demoEnabled;$('#access-logout').hidden=!change;
  if(!$('#access-dialog').open)$('#access-dialog').showModal();
}
$('#access-dialog').addEventListener('cancel',e=>{if(!connection.demoEnabled||sessionUser?.mustChangePassword)e.preventDefault();});
$('#demo-access').onclick=()=>{if(!connection.demoEnabled)return;$('#access-dialog').close();toast('Modalità dimostrativa: i dati restano in questo browser.');};
$('#access-form').onsubmit=async e=>{e.preventDefault();const button=$('#access-submit');button.disabled=true;$('#access-error').hidden=true;try{const name=$('#access-name').value;const payload={name,firstName:name,surname:$('#access-surname').value,email:$('#access-email').value,doorCode:$('#access-door-code').value};await submitAccess(payload,connection.setupRequired);location.reload();}catch(error){$('#access-error').textContent=error.message;$('#access-error').hidden=false;}finally{button.disabled=false;}};
$('#account-action').onclick=async()=>{if(sessionUser){try{await api('/logout',{});sessionStorage.removeItem('spazi-active-meeting');location.reload();}catch(error){toast(error.message);}}else openAccess();};
async function renderUsage(){
  const form=$('#usage-form');if(form.getAttribute('aria-busy')==='true')return;
  $('#usage-from').value||=addDays(todayRome(),-29);$('#usage-to').value||=todayRome();
  form.setAttribute('aria-busy','true');form.querySelector('button').disabled=true;$('#usage-error').hidden=true;
  try{
    const report=sharedMode?await api('/admin/usage?'+new URLSearchParams({from:$('#usage-from').value,to:$('#usage-to').value})):usageReport(state.bookings,state.settings,$('#usage-from').value,$('#usage-to').value);
    const total=key=>report.rows.reduce((sum,row)=>sum+row[key],0),hours=value=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value/60);
    $('#usage-results').innerHTML=`<dl class="usage-totals"><div><dt>Confermate</dt><dd>${total('confirmed')}</dd></div><div><dt>Annullate</dt><dd>${total('cancelled')}</dd></div><div><dt>Riunioni avviate</dt><dd>${total('started')}</dd></div><div><dt>Posti pranzo riservati</dt><dd>${total('seats')}</dd></div></dl><div class="usage-table" tabindex="0" role="region" aria-label="Statistiche per spazio, tabella scorribile"><table><caption>Utilizzo dal ${prettyDate(report.from)} al ${prettyDate(report.to)}</caption><thead><tr><th scope="col">Spazio</th><th scope="col">Confermate</th><th scope="col">Annullate</th><th scope="col">Concluse</th><th scope="col">Ore prenotate</th><th scope="col">Ore effettive</th></tr></thead><tbody>${report.rows.map(row=>`<tr><th scope="row">${escapeHtml(row.label)}</th><td>${row.confirmed}</td><td>${row.cancelled}</td><td>${row.resource==='lunch'?'—':row.ended}</td><td>${row.resource==='lunch'?'—':hours(row.plannedMinutes)}</td><td>${row.resource==='lunch'?'—':hours(row.actualMinutes)}</td></tr>`).join('')}</tbody></table></div><p class="panel-footnote">I posti pranzo contano ogni utilizzo: un tavolo intero vale il numero delle sue sedute. Le confermate includono riunioni passate e future nel periodo. Le annullate sono escluse da ore e posti.</p>`;
  }catch(error){$('#usage-results').replaceChildren();$('#usage-error').textContent=error.message;$('#usage-error').hidden=false;}
  finally{form.removeAttribute('aria-busy');form.querySelector('button').disabled=false;}
}
$('#usage-form').onsubmit=event=>{event.preventDefault();renderUsage();};
async function renderAdmin(){
  showAdminSection(adminSection);
  $('#new-user-form').hidden=!sharedMode;
  if(adminSection==='rules')return;
  $('#admin-summary').textContent=sharedMode?'Dati aziendali condivisi':'Demo locale · solo dati di questo browser';
  if(adminSection==='usage'){await renderUsage();return;}
  if(!sharedMode){
    if(adminSection==='accounts')$('#admin-users').innerHTML='<p class="notice">Gli account aziendali si gestiscono dopo l’accesso come amministratore. La demo non crea utenti reali.</p><button type="button" class="primary" id="admin-demo-login">Accedi come amministratore</button>';
    if(adminSection==='operations')$('#admin-bookings').innerHTML=state.bookings.length?state.bookings.slice().sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start)).map(b=>`<div class="admin-row"><div><strong>${escapeHtml(resourceLabel(b.resource,state.settings))}</strong><p>${prettyDate(b.date)} · ${b.start}–${b.end} · ${b.status==='cancelled'?'Annullata':b.endedAt?'Conclusa':'Confermata'}</p><p>${escapeHtml(b.name||b.title||'')} · ${escapeHtml(b.purpose||'')}</p></div><button type="button" class="text-button" data-view="prenotazioni">Vedi nelle mie prenotazioni</button></div>`).join(''):'<p class="empty-state">Nessuna prenotazione nella demo. Le prenotazioni create in questo browser compariranno qui.</p><button type="button" class="primary" data-view="prenota">Prenota uno spazio</button>';
    if(adminSection==='audit')$('#admin-audit').innerHTML=state.audit.slice().reverse().map(a=>`<div class="audit-row"><strong>Profilo demo</strong><span>${escapeHtml(a.action.replaceAll('_',' '))}</span><time>${new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(new Date(a.at))}</time></div>`).join('')||'<p class="empty-state">Nessuna attività registrata nella demo. Qui compariranno prenotazioni, annullamenti e modifiche delle regole.</p>';
    return;
  }
  try{
    const [users,bookings,audit]=await Promise.all([api('/admin/users'),api('/admin/bookings'),api('/admin/audit')]);
    $('#admin-summary').textContent=`${users.users.filter(u=>u.active).length} account attivi · ${bookings.bookings.filter(b=>b.status==='confirmed').length} prenotazioni confermate`;
    $('#admin-users').innerHTML=users.users.map(u=>`<div class="admin-row"><div><strong>${escapeHtml(u.name)} ${escapeHtml(u.surname||'')}</strong><p>${escapeHtml(u.email)} · ${{USER:'Utente',ADMIN:'Admin',OPERATOR:'Operatore'}[u.role]} · ${u.has_door_code?'Codice impostato':'Codice da impostare'}</p></div><span class="booking-tag">${u.active?'Attivo':'Disattivo'}</span>${u.id===sessionUser.id?'':`<button class="text-button" data-toggle-user="${u.id}" data-active="${!u.active}">${u.active?'Disattiva':'Riattiva'}</button><button class="text-button" data-reset-password="${u.id}" data-account-name="${escapeHtml(u.name)} ${escapeHtml(u.surname||'')}" data-account-first-name="${escapeHtml(u.name)}" data-account-surname="${escapeHtml(u.surname||'')}">Imposta codice porta</button>`}</div>`).join('');
    $('#admin-bookings').innerHTML=bookings.bookings.filter(b=>b.status==='confirmed').sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).map(b=>`<div class="admin-row"><div><strong>${escapeHtml(resourceLabel(b.resource,state.settings))}</strong><p>${escapeHtml(b.name||b.accountName)} · ${prettyDate(b.date)} · ${b.start}–${b.end}</p><p>${escapeHtml(b.purpose||'')}</p></div><button class="text-button danger" data-admin-cancel="${b.id}">Gestisci annullamento</button></div>`).join('')||'<p class="empty-state">Nessuna prenotazione confermata.</p>';
    $('#admin-audit').innerHTML=audit.events.map(a=>`<div class="audit-row"><strong>${escapeHtml(a.actor_name||'Sistema')}</strong><span>${escapeHtml(a.action.replaceAll('_',' '))}</span><time>${new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(new Date(a.created_at))}</time></div>`).join('')||'<p class="empty-state">Nessuna attività registrata.</p>';
  }catch(error){toast(error.message);}
}
$('#new-user-form').onsubmit=async e=>{e.preventDefault();$('#new-user-error').hidden=true;try{await api('/admin/users',{name:$('#new-user-name').value,surname:$('#new-user-surname').value,email:$('#new-user-email').value,doorCode:$('#new-user-door-code').value,role:$('#new-user-role').value,tabletResource:$('#new-user-tablet').value||null});e.target.reset();$('#new-user-tablet').disabled=true;await renderAdmin();toast('Account creato. Il codice di apertura è stato salvato in forma protetta.');}catch(error){$('#new-user-error').hidden=false;$('#new-user-error').textContent=error.message;}};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='admin-demo-login'){openAccess();return;}if(b.dataset.adminSection){adminSection=b.dataset.adminSection;renderAdmin();return;}if(!sharedMode)return;try{if(b.dataset.toggleUser){await api(`/admin/users/${b.dataset.toggleUser}/active`,{active:b.dataset.active==='true'});renderAdmin();}if(b.dataset.resetPassword){$('#password-reset-id').value=b.dataset.resetPassword;$('#password-reset-account').textContent=b.dataset.accountName;$('#password-reset-name').value=b.dataset.accountFirstName||'';$('#password-reset-surname').value=b.dataset.accountSurname||'';$('#password-reset-value').value='';$('#password-reset-error').hidden=true;$('#password-reset-dialog').showModal();}if(b.dataset.adminCancel){$('#admin-cancel-id').value=b.dataset.adminCancel;$('#admin-cancel-dialog').showModal();}}catch(error){toast(error.message);}});
$('#admin-cancel-form').onsubmit=async e=>{e.preventDefault();try{await api('/admin/bookings/cancel',{id:$('#admin-cancel-id').value,reason:$('#admin-cancel-reason').value});await reloadShared();$('#admin-cancel-dialog').close();renderAdmin();toast('Prenotazione annullata con motivazione.');}catch(error){$('#admin-cancel-error').textContent=error.message;}};
$('#abort-admin-cancel').onclick=()=>$('#admin-cancel-dialog').close();

$('#account-mobile').onclick=()=>$('#account-action').click();

$('#access-dialog').addEventListener('cancel',e=>{if(sessionUser?.mustChangePassword)e.preventDefault();});
$('#access-logout').onclick=async()=>{try{await api('/logout',{});sessionStorage.removeItem('spazi-active-meeting');location.reload();}catch(error){$('#access-error').hidden=false;$('#access-error').textContent=error.message;}};

$('#password-reset-abort').onclick=()=>$('#password-reset-dialog').close();
$('#password-reset-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('#password-reset-error').hidden=true;try{await api('/admin/users/'+$('#password-reset-id').value+'/door-code',{name:$('#password-reset-name').value,surname:$('#password-reset-surname').value,doorCode:$('#password-reset-value').value});$('#password-reset-value').value='';$('#password-reset-dialog').close();await renderAdmin();toast('Codice di apertura porta aggiornato.');}catch(error){$('#password-reset-error').textContent=error.message;$('#password-reset-error').hidden=false;}finally{button.disabled=false;}};
setInterval(async()=>{if(!sharedMode||view!=='checkin'||!currentMeetingCode||meetingRefreshing||document.hidden)return;meetingRefreshing=true;try{const next=await api('/meetings/verify',{code:currentMeetingCode});if(next.serverNow)serverOffset=next.serverNow-Date.now();if(next.booking.checkedInAt!==currentMeeting?.checkedInAt||next.booking.endedAt!==currentMeeting?.endedAt)meetingResult(next,currentMeetingCode);}catch(error){if(error.status===401)openAccess();else if(error.status===409){clearInterval(meetingTicker);meetingResult({error:error.message},currentMeetingCode);currentMeetingCode=null;currentMeeting=null;}}finally{meetingRefreshing=false;}},15000);

// Keep asynchronous forms single-flight and expose progress to assistive technology.
for(const id of ['settings-form','new-user-form','block-form','admin-cancel-form']){
  const form=document.getElementById(id);
  form.addEventListener('submit',event=>{
    if(form.dataset.submitting==='true'){event.preventDefault();event.stopImmediatePropagation();return;}
  },true);
  const submit=form.onsubmit;
  if(!submit)continue;
  form.onsubmit=async event=>{
    const buttons=[...form.querySelectorAll('button[type="submit"]')],disabled=buttons.map(b=>b.disabled);
    form.dataset.submitting='true';form.setAttribute('aria-busy','true');buttons.forEach(b=>b.disabled=true);
    try{await submit.call(form,event);}finally{delete form.dataset.submitting;form.removeAttribute('aria-busy');buttons.forEach((b,i)=>b.disabled=disabled[i]);}
  };
}

$('#booking-success-dialog').addEventListener('close',()=>$('#page-title').focus({preventScroll:true}));
