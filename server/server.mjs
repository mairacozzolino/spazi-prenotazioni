import http from 'node:http';
import {usageReport} from './usage.mjs';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {randomBytes,randomUUID,randomInt} from 'node:crypto';
import {digest,fail,passwordHash,passwordMatches,securityConfig,requestContext,securityHeaders,rateLimiter} from './security.mjs';
import {openDatabase,transaction} from './database.mjs';
import {validateRequest,romeInstant,ROOM_IDS,minutes,closedReason,todayRome,addDays} from '../dist/domain.js';
import {cancellationError} from '../dist/booking-service.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
const safeUser=u=>u?{id:u.id,email:u.email,name:u.name,surname:u.surname||'',role:u.role,mustChangePassword:false,tabletResource:u.tablet_resource||null}:null;
function validText(value,min,max,label){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(`${label}: inserisci da ${min} a ${max} caratteri.`);return value.trim();}
function passwordCheck(value){if(typeof value!=='string'||value.length<12||value.length>128)fail('La password deve avere da 12 a 128 caratteri.');return value;}
function doorCodeCheck(value){if(typeof value!=='string'||value.trim().length<1||value.trim().length>64)fail('Inserisci un codice di apertura valido.');return value.trim();}

export function createApplication({database=process.env.SPAZI_DB,now=()=>Date.now(),security={}}={}){
  const tlsEnabled=!!(process.env.SPAZI_CERT&&process.env.SPAZI_KEY);
  const config=securityConfig(security),limit=rateLimiter(now);
  const db=openDatabase(database||path.join(root,'data','spazi.sqlite'));
  function settings(){return {revision:1,...JSON.parse(db.prepare('SELECT data FROM configuration WHERE id=1').get().data),maxUpcoming:10};}
  function bookings(){return db.prepare('SELECT * FROM bookings').all().map(r=>({...JSON.parse(r.data),userId:r.user_id,status:r.status}));}
  function blocks(){return db.prepare('SELECT data FROM blocks').all().map(r=>JSON.parse(r.data));}
  function audit(actor,action,entity=''){db.prepare('INSERT INTO audit(actor,action,entity,created_at) VALUES(?,?,?,?)').run(actor,action,entity,new Date(now()).toISOString());}
  function currentUser(req){const token=/\bspazi_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];if(!token)return null;return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.active=1').get(digest(token),now())||null;}
  function cookie(res,user){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,now()+8*3600000);db.prepare('DELETE FROM sessions WHERE user_id=? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT 20)').run(user.id,user.id);res.setHeader('Set-Cookie',`spazi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${tlsEnabled||config.production||config.origin?.startsWith('https:')||process.env.SPAZI_HTTPS==='1'?'; Secure':''}`);}
  function requireRole(user,...roles){if(!user)fail('Accedi per continuare.',401);if(user.must_change)fail('Cambia la password iniziale prima di continuare.',403);if(roles.length&&!roles.includes(user.role))fail('Non sei autorizzato a questa operazione.',403);}
  function modelFor(user){const all=bookings();return {version:1,serverNow:now(),settings:settings(),bookings:all.filter(b=>b.userId===user.id),seeds:all.filter(b=>b.userId!==user.id).map(b=>({resource:b.resource,date:b.date,start:b.start,end:b.end,status:b.status,checkedInAt:b.checkedInAt,endedAt:b.endedAt,name:b.name||b.title||'',...(b.resource.startsWith('table-')?{}:{purpose:b.purpose||''})})),blocks:blocks(),audit:[]};}
  function uniqueMeetingCode(){let code;do{code=String(randomInt(100000000)).padStart(8,'0');}while(db.prepare('SELECT id FROM bookings WHERE token_hash=?').get(digest(code)));return code;}
  function persist(booking,userId,hash=null,requestKey=null){db.prepare('INSERT INTO bookings(id,user_id,resource,date,start,end,status,data,token_hash,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)').run(booking.id,userId,booking.resource,booking.date,booking.start,booking.end,booking.status,JSON.stringify(booking),hash,requestKey);}
  function update(booking){db.prepare('UPDATE bookings SET status=?,data=? WHERE id=?').run(booking.status,JSON.stringify(booking),booking.id);}
  function owned(id,user){const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(id);if(!row||row.user_id!==user.id)fail('Prenotazione non trovata.',404);return {...JSON.parse(row.data),status:row.status};}
  function verify(code,user){
    if(typeof code!=='string'||!/^\d{8}$/.test(code.trim()))fail('Inserisci il codice di 8 cifre.');
    const row=db.prepare('SELECT * FROM bookings WHERE token_hash=?').get(digest(code.trim()));
    if(!row)fail('Codice non riconosciuto. Controlla la prenotazione.',404);
    const b={...JSON.parse(row.data),status:row.status};
    if(b.status!=='confirmed')fail('La prenotazione è annullata o non confermata.',409);
    if(b.resource.startsWith('table-'))fail('Questa funzione è riservata alle sale riunioni e call.',422);
    if(user?.tablet_resource&&user.tablet_resource!==b.resource)fail('Questo codice appartiene a un’altra sala.',403);
    return {booking:b,already:!!b.checkedInAt,serverNow:now()};
  }
  function startMeeting(b){
    if(b.endedAt)fail('La riunione è già terminata.',409);
    if(b.checkedInAt)return;
    const start=romeInstant(b.date,b.start).getTime(),s=settings();
    if(now()<start-s.checkInBefore*60000||now()>start+s.checkInAfter*60000)fail('Inizio consentito da 15 minuti prima a 15 minuti dopo l’orario prenotato.',422);
    if(bookings().some(other=>other.id!==b.id&&other.resource===b.resource&&other.status==='confirmed'&&other.checkedInAt&&!other.endedAt))fail('Una riunione è già in corso in questa sala.',409);
  }
  function validateSettings(next){const old=settings();if(next.revision!==old.revision)fail('Le regole sono state modificate da un altro amministratore. Ricarica prima di salvarle.',409);const result={...old,...next,revision:old.revision+1};for(const key of ['open','close','lunchOpen','lunchClose'])if(typeof result[key]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(result[key])||minutes(result[key])%30)fail('Gli orari devono essere validi e allineati a 30 minuti.');if(minutes(result.close)<=minutes(result.open)||minutes(result.lunchClose)<=minutes(result.lunchOpen)||minutes(result.lunchOpen)<minutes(result.open)||minutes(result.lunchClose)>minutes(result.close))fail('Controlla apertura, chiusura e orario pranzo.');if(![60,120,180].includes(result.maxDuration)||result.maxUpcoming!==10||![0,30,60].includes(result.cancellationCutoff))fail('Regole non valide.');if(!Array.isArray(result.names)||result.names.length!==4)fail('Servono quattro nomi per le sale.');result.names=result.names.map(n=>validText(n,1,50,'Nome sala'));result.checkInBefore=15;result.checkInAfter=15;
    for(const b of bookings().filter(b=>b.status==='confirmed'&&!b.endedAt&&romeInstant(b.date,b.end).getTime()>now())){const lunch=b.resource.startsWith('table-');if(minutes(b.start)<minutes(lunch?result.lunchOpen:result.open)||minutes(b.end)>minutes(lunch?result.lunchClose:result.close)||minutes(b.end)-minutes(b.start)>result.maxDuration)fail('Le nuove regole incidono su prenotazioni confermate. Gestiscile prima.',409);}return result;}
  const handler=async(req,res)=>{
    securityHeaders(res,config);
    const base=`http://${req.headers.host}`;let url;try{url=new URL(req.url,base);}catch{res.writeHead(400).end();return;}
    const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      const context=requestContext(req,config,tlsEnabled);
      if(url.pathname==='/healthz'&&req.method==='GET'){db.prepare('SELECT 1').get();json({ok:true,version});return;}
      if(url.pathname.startsWith('/api/')){
        if(!['GET','POST'].includes(req.method))fail('Metodo non supportato.',405);
        const ip=context.ip;limit('general:'+ip,500);if(url.pathname==='/api/login')limit('login:'+ip,20,60000);
        let body={};if(req.method!=='GET'){
          if(req.headers['x-spazi-request']!=='1'||req.headers.origin&&req.headers.origin!==context.origin)fail('Origine della richiesta non valida.',403);
          if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))fail('Formato richiesta non supportato: usa JSON.',415);
          const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>20000)fail('Richiesta troppo grande.',413);chunks.push(part);}try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));body=raw?JSON.parse(raw):{};}catch{fail('Dati non validi.');}
        }
        if(!body||typeof body!=='object'||Array.isArray(body))fail('Invia un oggetto JSON valido.');
        const user=currentUser(req);
        if(url.pathname.startsWith('/api/meetings/')){requireRole(user,'ADMIN','OPERATOR');limit('meeting:'+user.id,30);}
        const localSetup=!config.production&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)&&/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'')&&!tlsEnabled&&process.env.SPAZI_HTTPS!=='1'&&(!process.env.SPAZI_HOST||['127.0.0.1','::1','localhost'].includes(process.env.SPAZI_HOST));
        if(req.method==='GET'&&url.pathname==='/api/session'){json({user:safeUser(user),demoEnabled:config.demoEnabled,serverNow:now(),setupRequired:!db.prepare('SELECT id FROM users LIMIT 1').get(),setupAllowed:localSetup});return;}
        if(req.method==='POST'&&url.pathname==='/api/setup'){
          if(!localSetup)fail('Il primo amministratore va creato dal computer che ospita il servizio.',403);
          const name=validText(body.name,2,80,'Nome'),surname=validText(body.surname,2,80,'Cognome'),email=validText(body.email,3,150,'Email').toLowerCase(),code=doorCodeCheck(body.doorCode);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Email non valida.');
          const hash=await passwordHash(code);const created=transaction(db,()=>{if(db.prepare('SELECT id FROM users LIMIT 1').get())fail('Configurazione già completata.',409);const id=randomUUID();db.prepare('INSERT INTO users(id,email,name,role,hash,active,must_change,surname,door_code_hash) VALUES(?,?,?,?,?,1,0,?,?)').run(id,email,name,'ADMIN',hash,surname,hash);audit(id,'ADMIN_CREATED',id);return db.prepare('SELECT * FROM users WHERE id=?').get(id);});cookie(res,created);json({user:safeUser(created)},201);return;
        }
        if(req.method==='POST'&&url.pathname==='/api/login'){
          const firstName=typeof body.firstName==='string'?body.firstName.trim():'';const surname=typeof body.surname==='string'?body.surname.trim():'';const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';const code=typeof body.doorCode==='string'&&body.doorCode.length<=64?body.doorCode.trim():'';limit('login-account:'+digest(email),10,900000);const candidate=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);const matches=await passwordMatches(code,candidate?.door_code_hash||('0'.repeat(32)+':'+ '0'.repeat(128)));if(!candidate||!candidate.door_code_hash||candidate.name.trim().toLocaleLowerCase('it')!==firstName.toLocaleLowerCase('it')||String(candidate.surname||'').trim().toLocaleLowerCase('it')!==surname.toLocaleLowerCase('it')||!matches)fail('I dati inseriti non corrispondono a un account attivo.',401);const stillActive=db.prepare('SELECT * FROM users WHERE id=? AND active=1 AND door_code_hash=?').get(candidate.id,candidate.door_code_hash);if(!stillActive)fail('I dati inseriti non corrispondono a un account attivo.',401);cookie(res,stillActive);json({user:safeUser(stillActive)});return;
        }
        if(req.method==='POST'&&url.pathname==='/api/logout'){const token=/\bspazi_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));res.setHeader('Set-Cookie','spazi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json({ok:true});return;}
        if(req.method==='POST'&&url.pathname==='/api/password'){if(!user)fail('Accedi per continuare.',401);if(!await passwordMatches(String(body.currentPassword||''),user.hash))fail('Password attuale non corretta.',401);const next=passwordCheck(body.password);db.prepare('UPDATE users SET hash=?,must_change=0 WHERE id=?').run(await passwordHash(next),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);cookie(res,{...user,must_change:0});audit(user.id,'PASSWORD_CHANGED',user.id);json({ok:true});return;}
        requireRole(user);
        if(req.method==='GET'&&url.pathname==='/api/state'){json(modelFor(user));return;}
        if(req.method==='POST'&&url.pathname==='/api/bookings'){
          const resource=String(body.resource||''),lunch=resource.startsWith('table-'),name=validText(body.name,2,80,lunch?'Nome e cognome':'Nome del referente'),purpose=lunch?'':validText(body.purpose,3,500,'Finalità');
          const requestKey=body.requestId;if(requestKey!==undefined&&(typeof requestKey!=='string'||!/^[a-f0-9-]{36}$/.test(requestKey)))fail('Identificativo richiesta non valido.');
          const booking=transaction(db,()=>{if(requestKey){const existing=db.prepare('SELECT data FROM bookings WHERE user_id=? AND request_key=?').get(user.id,requestKey);if(existing){const b=JSON.parse(existing.data);if(['resource','date','start','end','name','purpose'].some(key=>b[key]!==({ ...body,name,purpose })[key]))fail('Richiesta già usata per un’altra prenotazione.',409);return b;}}const state=modelFor(user),error=validateRequest(state,resource,{date:body.date,start:body.start,end:body.end},todayRome(now()),now());if(error)fail(error,409);const b={id:randomUUID(),resource,date:body.date,start:body.start,end:body.end,status:'confirmed',title:name,name,purpose,createdAt:new Date(now()).toISOString(),attendanceStatus:'NOT_CHECKED_IN',priceSnapshotCents:0,currency:'EUR',paymentStatus:'NOT_REQUIRED'};if(!lunch)b.meetingCode=uniqueMeetingCode();persist(b,user.id,lunch?null:digest(b.meetingCode),requestKey||null);audit(user.id,'BOOKING_CONFIRMED',b.id);return b;});json({booking},201);return;
        }
        const bookingPath=/^\/api\/bookings\/([a-f0-9-]{36})\/(cancel|code)$/.exec(url.pathname);
        if(req.method==='POST'&&bookingPath){
          const [,id,action]=bookingPath;
          if(action==='cancel'){const result=transaction(db,()=>{const b=owned(id,user);if(b.status==='cancelled')return b;const error=cancellationError({settings:settings()},b,now());if(error)fail(error,409);b.status='cancelled';b.cancelledAt=new Date(now()).toISOString();update(b);audit(user.id,'BOOKING_CANCELLED',id);return b;});json({booking:result});return;}
          const b=owned(id,user);if(b.status!=='confirmed')fail('Prenotazione non attiva.',409);if(b.resource.startsWith('table-'))fail('Codice disponibile solo per sale riunioni e call.',422);
          const code=transaction(db,()=>{const current=owned(id,user);if(current.meetingCode)return current.meetingCode;const next=uniqueMeetingCode();current.meetingCode=next;update(current);db.prepare('UPDATE bookings SET token_hash=? WHERE id=?').run(digest(next),id);return next;});json({code});return;
        }
        if(req.method==='GET'&&url.pathname==='/api/attendance'){requireRole(user,'ADMIN','OPERATOR');json({bookings:bookings().filter(b=>b.checkedInAt&&(!user.tablet_resource||b.resource===user.tablet_resource)).map(b=>({resource:b.resource,date:b.date,start:b.start,end:b.end,name:b.name,checkedInAt:b.checkedInAt,endedAt:b.endedAt}))});return;}
        if(req.method==='POST'&&url.pathname==='/api/meetings/verify'){requireRole(user,'ADMIN','OPERATOR');json(verify(body.code,user));return;}
        if(req.method==='POST'&&['/api/meetings/start','/api/meetings/end'].includes(url.pathname)){
          requireRole(user,'ADMIN','OPERATOR');
          const result=transaction(db,()=>{const checked=verify(body.code,user),b=checked.booking;
            if(url.pathname.endsWith('/start')){startMeeting(b);if(!b.checkedInAt){b.checkedInAt=new Date(now()).toISOString();b.checkedInBy=user.id;b.attendanceStatus='IN_PROGRESS';update(b);audit(user.id,'MEETING_STARTED',b.id);}}
            else {if(!b.checkedInAt)fail('Avvia la riunione prima di terminarla.',409);if(!b.endedAt){b.endedAt=new Date(now()).toISOString();b.endedBy=user.id;b.attendanceStatus='ENDED';update(b);audit(user.id,'MEETING_ENDED',b.id);}}
            return checked;});json(result);return;
        }
        if(url.pathname.startsWith('/api/admin/'))requireRole(user,'ADMIN');
        if(req.method==='GET'&&url.pathname==='/api/admin/usage'){const to=url.searchParams.get('to')??todayRome(now()),from=url.searchParams.get('from')??addDays(todayRome(now()),-29);json(usageReport(bookings(),settings(),from,to));return;}
        if(req.method==='GET'&&url.pathname==='/api/admin/users'){json({users:db.prepare('SELECT id,email,name,surname,role,active,must_change,tablet_resource,door_code_hash IS NOT NULL AS has_door_code FROM users ORDER BY name').all()});return;}
        if(req.method==='POST'&&url.pathname==='/api/admin/users'){
          const name=validText(body.name,2,80,'Nome'),surname=validText(body.surname,2,80,'Cognome'),email=validText(body.email,3,150,'Email').toLowerCase(),code=doorCodeCheck(body.doorCode),role=body.role;if(!['USER','OPERATOR','ADMIN'].includes(role)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Email o ruolo non validi.');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail('Email già registrata.',409);const tabletResource=role==='OPERATOR'&&body.tabletResource?String(body.tabletResource):null;if(tabletResource&&!ROOM_IDS.includes(tabletResource))fail('Sala tablet non valida.');const hash=await passwordHash(code),id=randomUUID();try{db.prepare('INSERT INTO users(id,email,name,role,hash,active,must_change,tablet_resource,surname,door_code_hash) VALUES(?,?,?,?,?,1,0,?,?,?)').run(id,email,name,role,hash,tabletResource,surname,hash);}catch(error){if(error.message.includes('UNIQUE'))fail('Email già registrata.',409);throw error;}audit(user.id,'USER_CREATED',id);json({id},201);return;
        }
        const userPath=/^\/api\/admin\/users\/([a-f0-9-]{36})\/active$/.exec(url.pathname);
        if(req.method==='POST'&&userPath){if(userPath[1]===user.id)fail('Non puoi disattivare il tuo account.');if(typeof body.active!=='boolean')fail('Stato non valido.');db.prepare('UPDATE users SET active=? WHERE id=?').run(body.active?1:0,userPath[1]);if(!body.active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(userPath[1]);audit(user.id,body.active?'USER_ENABLED':'USER_DISABLED',userPath[1]);json({ok:true});return;}
        const resetPath=/^\/api\/admin\/users\/([a-f0-9-]{36})\/door-code$/.exec(url.pathname);
        if(req.method==='POST'&&resetPath){
          const id=resetPath[1],name=validText(body.name,2,80,'Nome'),surname=validText(body.surname,2,80,'Cognome');
          if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))fail('Account non trovato.',404);
          const hash=await passwordHash(doorCodeCheck(body.doorCode));transaction(db,()=>{db.prepare('UPDATE users SET name=?,surname=?,hash=?,door_code_hash=?,must_change=0 WHERE id=?').run(name,surname,hash,hash,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);audit(user.id,'DOOR_CODE_RESET',id);});json({ok:true});return;
        }
        if(req.method==='GET'&&url.pathname==='/api/admin/bookings'){json({bookings:bookings().map(b=>{const u=db.prepare('SELECT name,email FROM users WHERE id=?').get(b.userId);return {...b,accountName:u.name,accountEmail:u.email};})});return;}
        if(req.method==='POST'&&url.pathname==='/api/admin/bookings/cancel'){const reason=validText(body.reason,3,200,'Motivo');transaction(db,()=>{const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(String(body.id));if(!row)fail('Prenotazione non trovata.',404);const b=JSON.parse(row.data);if(row.status==='cancelled')return;b.status='cancelled';b.cancelReason=reason;b.cancelledAt=new Date(now()).toISOString();update(b);audit(user.id,'ADMIN_CANCELLED',b.id);});json({ok:true});return;}
        if(req.method==='POST'&&url.pathname==='/api/admin/settings'){const next=transaction(db,()=>{const checked=validateSettings(body);db.prepare('UPDATE configuration SET data=? WHERE id=1').run(JSON.stringify(checked));audit(user.id,'SETTINGS_UPDATED');return checked;});json({settings:next});return;}
        if(req.method==='POST'&&url.pathname==='/api/admin/blocks'){
          const date=String(body.date||''),resource=String(body.resource||''),reason=validText(body.reason,3,80,'Motivo');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date||!['all','lunch',...ROOM_IDS].includes(resource))fail('Giorno o spazio non validi.');transaction(db,()=>{if(bookings().some(b=>b.date===date&&b.status==='confirmed'&&!b.endedAt&&(resource==='all'||resource===b.resource||resource==='lunch'&&b.resource.startsWith('table-'))))fail('Esistono prenotazioni confermate. Gestiscile prima della chiusura.',409);const id=randomUUID();db.prepare('INSERT INTO blocks VALUES(?,?)').run(id,JSON.stringify({id,date,resource,reason}));audit(user.id,'SPACE_CLOSED',id);});json({ok:true});return;
        }
        if(req.method==='POST'&&url.pathname==='/api/admin/blocks/remove'){db.prepare('DELETE FROM blocks WHERE id=?').run(String(body.id));audit(user.id,'CLOSURE_REMOVED',String(body.id));json({ok:true});return;}
        if(req.method==='GET'&&url.pathname==='/api/admin/audit'){json({events:db.prepare('SELECT a.*,u.name as actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 100').all()});return;}
        fail('Endpoint non disponibile.',404);
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      let requestPath;try{requestPath=decodeURIComponent(url.pathname);}catch{fail('Percorso non valido.',400);}
      const filename=path.resolve(root,'dist',`.${requestPath==='/'?'/index.html':requestPath}`),dist=path.join(root,'dist');
      if(!filename.startsWith(dist+path.sep)||!existsSync(filename)||!statSync(filename).isFile()){res.writeHead(404).end('Not found');return;}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
      res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(filename));
    }catch(error){if(error.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));if(url.pathname.startsWith('/api/'))json({error:error.status?error.message:'Errore interno. Riprova.',code:error.status||500},error.status||500);else res.writeHead(error.status||500).end(error.status?error.message:'Errore');}
  };
  const server=tlsEnabled?https.createServer({cert:readFileSync(process.env.SPAZI_CERT),key:readFileSync(process.env.SPAZI_KEY)},handler):http.createServer(handler);
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return {server,db,config};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const host=process.env.SPAZI_HOST||'127.0.0.1',port=Number(process.env.SPAZI_PORT||8766),tls=!!(process.env.SPAZI_CERT&&process.env.SPAZI_KEY);
  const {server,db,config}=createApplication();
  if(!['127.0.0.1','::1','localhost'].includes(host)&&!tls&&!(config.production&&config.trustedProxies.length)){db.close();throw new Error('Per l’accesso di rete configura HTTPS diretto oppure il proxy HTTPS di produzione.');}
  server.listen(port,host,()=>console.log(`Spazi in ascolto su ${tls?'https':'http'}://${host}:${port}`));
  let closing=false;const stop=()=>{if(closing)return;closing=true;server.close(()=>{db.close();process.exit(0);});setTimeout(()=>{server.closeAllConnections();},5000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
