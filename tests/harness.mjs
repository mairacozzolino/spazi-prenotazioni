import http from 'node:http';
import {mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const credentials=(actor,doorCode=password)=>({firstName:actor==='admin'?'QA administrator':'QA '+actor,surname:'Collaudo',email:actor+'@example.test',doorCode});
export const password='QA-only-password-not-production-2026';
export async function harness(security={}){
  mkdirSync(path.join(root,'.qa'),{recursive:true});const directory=mkdtempSync(path.join(root,'.qa','release-')),database=path.join(directory,'test.sqlite');let clock=Date.now();
  const app=createApplication({database,now:()=>clock,security});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const port=app.server.address().port,cookies={};
  async function request(actor,endpoint,body,options={}){
    const raw=options.raw??(body===undefined?undefined:JSON.stringify(body));
    const headers={'X-Spazi-Request':'1',...(raw===undefined?{}:{'Content-Type':'application/json'}),...(cookies[actor]?{Cookie:cookies[actor]}:{}),...options.headers};
    return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:options.public||endpoint.startsWith('/api/')||!endpoint.startsWith('/')?endpoint:'/api'+endpoint,method:options.method||(raw===undefined?'GET':'POST'),headers},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{if(res.headers['set-cookie'])cookies[actor]=res.headers['set-cookie'][0].split(';')[0];let parsed;try{parsed=JSON.parse(data);}catch{parsed=data;}resolve({status:res.statusCode,data:parsed,headers:res.headers});});});req.on('error',reject);if(raw!==undefined)req.write(raw);req.end();});
  }
  return {app,directory,database,cookies,request,setClock(value){clock=value;},get clock(){return clock;},async close(){app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.db.close();}};
}
export async function accounts(h,definitions=[['one','USER'],['two','USER'],['operator','OPERATOR']]){
  let result=await h.request('admin','/setup',{name:'QA administrator',surname:'Collaudo',email:'admin@example.test',doorCode:password});if(result.status!==201)throw new Error('QA setup failed');
  for(const [name,role,tabletResource]of definitions){result=await h.request('admin','/admin/users',{name:'QA '+name,surname:'Collaudo',email:name+'@example.test',doorCode:password,role,tabletResource});if(result.status!==201)throw new Error('QA account creation failed');result=await h.request(name,'/login',credentials(name));if(result.status!==200)throw new Error('QA login failed');}
}
