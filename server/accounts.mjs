import {randomUUID} from 'node:crypto';
import {passwordHash} from './security.mjs';
import {transaction} from './database.mjs';
export async function createFirstAdmin(db,{name,surname,email,doorCode}){
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>80)throw new Error('Inserisci un nome da 2 a 80 caratteri.');
  if(typeof surname!=='string'||surname.trim().length<2||surname.trim().length>80)throw new Error('Inserisci un cognome da 2 a 80 caratteri.');
  if(typeof email!=='string'||email.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw new Error('Email non valida.');
  if(typeof doorCode!=='string'||doorCode.trim().length<1||doorCode.trim().length>64)throw new Error('Inserisci un codice porta valido.');
  const hash=await passwordHash(doorCode.trim()),id=randomUUID();return transaction(db,()=>{if(db.prepare('SELECT id FROM users LIMIT 1').get())throw new Error('Il primo amministratore esiste già.');db.prepare('INSERT INTO users(id,email,name,role,hash,active,must_change,surname,door_code_hash) VALUES(?,?,?,?,?,1,0,?,?)').run(id,email.trim().toLowerCase(),name.trim(),'ADMIN',hash,surname.trim(),hash);db.prepare('INSERT INTO audit(actor,action,entity,created_at) VALUES(?,?,?,?)').run(id,'ADMIN_CREATED',id,new Date().toISOString());return {id,name:name.trim(),surname:surname.trim(),email:email.trim().toLowerCase()};});
}
export async function recoverAdmin(db,{email,name,surname,doorCode}){
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>80)throw new Error('Inserisci un nome da 2 a 80 caratteri.');
  if(typeof surname!=='string'||surname.trim().length<2||surname.trim().length>80)throw new Error('Inserisci un cognome da 2 a 80 caratteri.');
  if(typeof doorCode!=='string'||doorCode.trim().length<1||doorCode.trim().length>64)throw new Error('Inserisci un codice porta valido.');
  const user=db.prepare("SELECT * FROM users WHERE email=? AND role='ADMIN'").get(String(email).trim().toLowerCase());if(!user)throw new Error('Amministratore non trovato.');const hash=await passwordHash(doorCode.trim());
  transaction(db,()=>{db.prepare('UPDATE users SET name=?,surname=?,hash=?,door_code_hash=?,active=1,must_change=0 WHERE id=?').run(name.trim(),surname.trim(),hash,hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('INSERT INTO audit(actor,action,entity,created_at) VALUES(?,?,?,?)').run(user.id,'ADMIN_ACCESS_RECOVERED',user.id,new Date().toISOString());});return {id:user.id,email:user.email};
}
