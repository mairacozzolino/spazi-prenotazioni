import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
export function createBackup(database,directory){
  if(!existsSync(database))throw new Error('Database non trovato: il backup non è stato creato.');
  mkdirSync(directory,{recursive:true,mode:0o700});const db=new DatabaseSync(database,{readOnly:true});
  const output=path.join(directory,`spazi-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}.sqlite`);
  try{db.prepare('VACUUM INTO ?').run(output);chmodSync(output,0o600);const check=new DatabaseSync(output,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Controllo integrità del backup fallito.');}finally{check.close();}return output;}finally{db.close();}
}
