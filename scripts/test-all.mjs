import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const suites=['test-transport.mjs','test-usage.mjs','test-admin-navigation.mjs','test-domain.mjs','test-policy.mjs','test-scheduling.mjs','test-weekly-limit.mjs','test-backend.mjs','test-release.mjs','test-production.mjs','test-concurrency.mjs','test-dining.mjs'];
let passed=0;for(const suite of suites){const result=spawnSync(process.execPath,[path.join(root,suite)],{cwd:root,stdio:'inherit',env:{...process.env,NODE_ENV:'test',SPAZI_PUBLIC_URL:'',SPAZI_TRUSTED_PROXIES:'',SPAZI_HTTPS:'',SPAZI_CERT:'',SPAZI_KEY:''}});if(result.status!==0){console.error(`Suite fallita: ${suite}`);process.exit(result.status||1);}passed++;}console.log(`Tutte le ${passed} suite superate.`);
