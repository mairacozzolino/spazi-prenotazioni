import assert from 'node:assert/strict';
import {api,sessionInfo,submitAccess} from './dist/transport.js';

const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout;
try{
  for(const [staleSetup,serverSetup,conflict,expected]of [
    [false,false,false,['/api/login']],
    [true,false,false,['/api/session','/api/login']],
    [true,true,false,['/api/session','/api/setup']],
    [true,true,true,['/api/session','/api/setup','/api/login']]
  ]){
    const calls=[];
    globalThis.fetch=async url=>{calls.push(url);return url==='/api/session'?Response.json({setupRequired:serverSetup}):url==='/api/setup'&&conflict?Response.json({error:'Configurazione già completata.'},{status:409}):Response.json({ok:true});};
    assert.deepEqual(await submitAccess({firstName:'Collaudo'},staleSetup),{ok:true});
    assert.deepEqual(calls,expected);
  }
  let request;
  globalThis.fetch=async(url,options)=>{request={url,...options};return Response.json({ok:true});};
  assert.deepEqual(await api('/bookings',{name:'Collaudo'}),{ok:true});
  assert.equal(request.method,'POST');
  assert.equal(request.credentials,'same-origin');
  assert.equal(request.headers['X-Spazi-Request'],'1');
  assert.equal(request.body,JSON.stringify({name:'Collaudo'}));
  await api('/state');assert.equal(request.method,'GET');
  globalThis.fetch=async()=>Response.json({error:'Accedi per continuare.'},{status:401});
  await assert.rejects(api('/state'),error=>error.status===401&&/Accedi/.test(error.message));
  for(const response of ['<html>Proxy non disponibile</html>','null','[]','"ok"']){
    globalThis.fetch=async()=>new Response(response);
    await assert.rejects(api('/state'),/Risposta del server non valida/);
  }
  globalThis.fetch=async()=>{throw new TypeError('offline');};
  assert.deepEqual(await sessionInfo(),{online:false,user:null,setupRequired:false,demoEnabled:false});
  // Headers can arrive while the response body stalls: keep the timeout active until JSON is read.
  globalThis.setTimeout=(callback)=>originalTimeout(callback,20);
  globalThis.fetch=async(url,{signal})=>({json:()=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })});
  await assert.rejects(api('/state'),/Il server non ha risposto/);
  console.log('Trasporto verificato: metodi, credenziali, errori HTTP, JSON non valido, offline e timeout del corpo risposta.');
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;}
