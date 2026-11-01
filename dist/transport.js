export async function api(path,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let response;
  let data;
  try{response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'X-Spazi-Request':'1',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});data=await response.json();}catch(error){if(error instanceof SyntaxError)throw new Error('Risposta del server non valida. Riprova.');throw new Error(error.name==='AbortError'?'Il server non ha risposto. Controlla la connessione e riprova.':'Connessione al server non disponibile. Controlla la rete e riprova.');}finally{clearTimeout(timeout);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Risposta del server non valida. Riprova.');
  if(!response.ok){const error=new Error(data.error||'Operazione non riuscita.');error.status=response.status;throw error;}
  return data;
}
export async function sessionInfo(){try{return {...await api('/session'),online:true};}catch{return {online:false,user:null,setupRequired:false,demoEnabled:false};}}
export async function submitAccess(payload,setupRequired){
  if(setupRequired&&(await api('/session')).setupRequired){
    try{return await api('/setup',payload);}catch(error){if(error.status!==409)throw error;}
  }
  return api('/login',payload);
}
