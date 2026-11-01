import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');const hash=await derive(password,salt,64);return `${salt}:${hash.toString('hex')}`;}
export async function passwordMatches(password,stored){const [salt,hash]=stored.split(':');const expected=Buffer.from(hash,'hex'),actual=await derive(password,salt,64);return expected.length===actual.length&&timingSafeEqual(actual,expected);}
export function securityConfig(overrides={}){
  const production=overrides.production??process.env.NODE_ENV==='production';
  const publicUrl=overrides.publicUrl??process.env.SPAZI_PUBLIC_URL??'';
  let origin=null;if(publicUrl){const parsed=new URL(publicUrl);if(parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash||!['http:','https:'].includes(parsed.protocol))throw new Error('SPAZI_PUBLIC_URL deve contenere solo protocollo e dominio.');origin=parsed.origin;if(production&&parsed.protocol!=='https:')throw new Error('Il servizio pubblico richiede un indirizzo HTTPS.');}
  if(production&&!origin)throw new Error('Imposta SPAZI_PUBLIC_URL prima di avviare il servizio pubblico.');
  const trustedProxies=overrides.trustedProxies??(process.env.SPAZI_TRUSTED_PROXIES||'').split(',').map(x=>x.trim()).filter(Boolean);
  return {production,origin,trustedProxies,demoEnabled:overrides.demoEnabled??(!production&&process.env.SPAZI_DEMO!=='0'),sessionHours:8};
}
const canonicalIP=value=>(value||'').replace(/^::ffff:/,'');
export function requestContext(req,config,tls){
  const peer=canonicalIP(req.socket.remoteAddress),trusted=config.trustedProxies.map(canonicalIP).includes(peer);
  const host=req.headers.host;
  if(!host||!/^([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(:\d{1,5})?$/.test(host))fail('Nome del servizio non valido.',400);
  if(req.url==='/healthz'&&['127.0.0.1','::1'].includes(peer)&&/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))return {ip:peer,origin:config.origin||`http://${host}`,trusted:false,peer};
  if(config.origin&&host.toLowerCase()!==new URL(config.origin).host.toLowerCase())fail('Nome del servizio non autorizzato.',403);
  if(config.production&&!tls&&(!trusted||req.headers['x-forwarded-proto']!=='https'))fail('Connessione HTTPS richiesta.',403);
  const forwarded=req.headers['x-real-ip'];
  const ip=trusted&&typeof forwarded==='string'&&/^[\da-fA-F:.]+$/.test(forwarded)?canonicalIP(forwarded):peer;
  return {ip,origin:config.origin||`${tls?'https':'http'}://${host}`,trusted,peer};
}
export function securityHeaders(res,config){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(config.production)res.setHeader('Strict-Transport-Security','max-age=31536000');
}
export function rateLimiter(now){
  const entries=new Map();
  return function limit(key,count,period=60000){
    const current=now();let meter=entries.get(key);if(!meter||meter.until<=current)meter={count:0,until:current+period};meter.count++;entries.set(key,meter);
    if(entries.size>10000)for(const [name,value]of entries)if(value.until<=current)entries.delete(name);
    if(meter.count>count){const error=new Error('Troppe richieste. Attendi prima di riprovare.');error.status=429;error.retryAfter=Math.max(1,Math.ceil((meter.until-current)/1000));throw error;}
  };
}
