import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {openDatabase} from './database.mjs';
import {createFirstAdmin,recoverAdmin} from './accounts.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.stdin.isTTY){console.error('Esegui questo comando in un terminale interattivo sul server.');process.exit(1);}
let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:true});let db;
try{const recovering=process.argv[2]==='recover';if(process.argv[2]&&!recovering)throw new Error('Comando non valido. Usa recover per recuperare un amministratore esistente.');const name=await prompt.question('Nome amministratore: '),surname=await prompt.question('Cognome amministratore: '),email=await prompt.question('Email amministratore: ');process.stdout.write('Codice apertura porta (non visualizzato): ');muted=true;const doorCode=await prompt.question('');muted=false;process.stdout.write('\n');process.stdout.write('Ripeti codice: ');muted=true;const confirm=await prompt.question('');muted=false;process.stdout.write('\n');if(doorCode!==confirm)throw new Error('I codici non coincidono.');db=openDatabase(process.env.SPAZI_DB||path.join(root,'data','spazi.sqlite'));const account=recovering?await recoverAdmin(db,{email,name,surname,doorCode}):await createFirstAdmin(db,{name,surname,email,doorCode});console.log(`Amministratore ${recovering?'recuperato':'creato'}: ${account.email}. Accedi dal sito HTTPS.`);}catch(error){muted=false;console.error(error.message);process.exitCode=1;}finally{prompt.close();db?.close();}
