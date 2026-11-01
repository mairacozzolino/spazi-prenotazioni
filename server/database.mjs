import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {DEFAULT_SETTINGS} from '../dist/domain.js';

export function openDatabase(filename){
  mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,must_change INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),resource TEXT NOT NULL,date TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,token_hash TEXT);
    CREATE INDEX IF NOT EXISTS booking_resource_date ON bookings(resource,date,status);
    CREATE TABLE IF NOT EXISTS configuration(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,action TEXT NOT NULL,entity TEXT,created_at TEXT NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO configuration VALUES(1,?)').run(JSON.stringify(DEFAULT_SETTINGS));
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS booking_code_unique ON bookings(token_hash) WHERE token_hash IS NOT NULL');
  const bookingColumns=db.prepare('PRAGMA table_info(bookings)').all();
  if(!bookingColumns.some(c=>c.name==='request_key'))db.exec('ALTER TABLE bookings ADD COLUMN request_key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS booking_request_unique ON bookings(user_id,request_key) WHERE request_key IS NOT NULL');
  const userColumns=db.prepare('PRAGMA table_info(users)').all();
  if(!userColumns.some(c=>c.name==='tablet_resource'))db.exec('ALTER TABLE users ADD COLUMN tablet_resource TEXT');
  if(!userColumns.some(c=>c.name==='surname'))db.exec("ALTER TABLE users ADD COLUMN surname TEXT NOT NULL DEFAULT ''");
  if(!userColumns.some(c=>c.name==='door_code_hash')){db.exec('ALTER TABLE users ADD COLUMN door_code_hash TEXT');db.exec('DELETE FROM sessions');}
  return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
