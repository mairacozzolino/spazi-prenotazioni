import {copyFileSync,mkdirSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
const name='spazi-'+version+'-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=path.join(root,'release',name);mkdirSync(destination,{recursive:true});
const excluded=new Set(['.env','server.env','qa-preview.mjs','qa-offline.mjs']);
function copy(relative){const source=path.join(root,relative),target=path.join(destination,relative);if(excluded.has(path.basename(relative)))return;if(statSync(source).isDirectory()){mkdirSync(target,{recursive:true});for(const entry of readdirSync(source))copy(path.join(relative,entry));}else{mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target);}}
for(const item of ['dist','server','deploy','scripts','tests','package.json','.dockerignore','README.md','INSTALLAZIONE.md','ARCHITETTURA.md','COLLAUDO_RILASCIO.md','COLLAUDO_FINALE.md','COLLAUDO_2026-10-26.md','test-transport.mjs','test-usage.mjs','test-admin-navigation.mjs','test-domain.mjs','test-policy.mjs','test-scheduling.mjs','test-weekly-limit.mjs','test-backend.mjs','test-release.mjs','test-production.mjs','test-concurrency.mjs','test-dining.mjs'])copy(item);
const files=[];function collect(directory){for(const entry of readdirSync(directory)){const file=path.join(directory,entry);if(statSync(file).isDirectory())collect(file);else files.push(file);}}collect(destination);
const manifest=files.sort().map(file=>createHash('sha256').update(readFileSync(file)).digest('hex')+'  '+path.relative(destination,file).replaceAll('\\','/')).join('\n')+'\n';writeFileSync(path.join(destination,'SHA256SUMS'),manifest);
const archive=destination+'.zip';if(process.platform==='win32'){const quoted=value=>"'"+value.replaceAll("'","''")+"'";const command=`$null=[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem');[System.IO.Compression.ZipFile]::CreateFromDirectory(${quoted(destination)},${quoted(archive)},[System.IO.Compression.CompressionLevel]::Optimal,$true)`;const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'Creazione ZIP fallita.');}else{const result=spawnSync('tar',['-czf',destination+'.tar.gz','-C',path.dirname(destination),path.basename(destination)],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'Creazione archivio fallita.');}
console.log(JSON.stringify({directory:destination,archive:process.platform==='win32'?archive:destination+'.tar.gz',files:files.length},null,2));
