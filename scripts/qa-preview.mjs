import {mkdirSync,mkdtempSync} from 'node:fs';
import {createApplication} from '../server/server.mjs';
import {createFirstAdmin} from '../server/accounts.mjs';
import {passwordHash,digest} from '../server/security.mjs';
import {todayRome,timeString,minutes} from '../dist/domain.js';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),password='QA-browser-only-2026-safe';
mkdirSync(path.join(root,'.qa'),{recursive:true});
const directory=mkdtempSync(path.join(root,'.qa','browser-'));
const app=createApplication({database:path.join(directory,'test.sqlite'),security:{demoEnabled:false}});
if(!app.db.prepare('SELECT id FROM users LIMIT 1').get()){
  await createFirstAdmin(app.db,{name:'Amministratore',surname:'Collaudo',email:'admin@qa.example.test',doorCode:password});
  for(const [email,name,role,room]of [['user@qa.example.test','Utente collaudo','USER',null],['tablet@qa.example.test','Tablet sala 1','OPERATOR','meeting-1']])app.db.prepare('INSERT INTO users(id,email,name,role,hash,active,must_change,tablet_resource,surname,door_code_hash) VALUES(?,?,?,?,?,1,0,?,?,?)').run(randomUUID(),email,name,role,await passwordHash(password),room,'Collaudo',await passwordHash(password));
}
const owner=app.db.prepare("SELECT id FROM users WHERE email='user@qa.example.test'").get();
const start=new Date().toLocaleTimeString('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit'}),date=todayRome(),code='65382147';
const old=app.db.prepare('SELECT id FROM bookings WHERE token_hash=?').get(digest(code));
if(!old){const b={id:randomUUID(),resource:'meeting-1',date,start,end:timeString(Math.min(19*60,minutes(start)+60)),status:'confirmed',name:'Collaudo tablet',purpose:'Verifica timer e liberazione sala',meetingCode:code,createdAt:new Date().toISOString()};app.db.prepare('INSERT INTO bookings(id,user_id,resource,date,start,end,status,data,token_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(b.id,owner.id,b.resource,date,b.start,b.end,b.status,JSON.stringify(b),digest(code));}
app.server.listen(8930,'127.0.0.1',()=>console.log('Collaudo browser pronto sulla porta 8930, solo dati sintetici.'));
