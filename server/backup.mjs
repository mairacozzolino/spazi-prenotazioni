import {createBackup} from './backup-service.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=createBackup(process.env.SPAZI_DB||path.join(root,'data','spazi.sqlite'),process.env.SPAZI_BACKUP_DIR||path.join(root,'data','backups'));
console.log(`Backup verificato creato: ${output}`);
