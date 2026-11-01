import {addDays,todayRome,minutes,timeString,romeInstant,validateRequest,isUpcoming} from './domain.js';

export function nextOpeningRequest(settings,now=Date.now()) {
  const date=todayRome();
  const local=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const next=Math.max(minutes(settings.open),(Math.floor((local.hour*60+local.minute)/30)+1)*30);
  return next+30<=minutes(settings.close)?{date,start:timeString(next),end:timeString(next+30)}:{date:addDays(date,1),start:settings.open,end:timeString(minutes(settings.open)+30)};
}
export function findNextSlot(state,resource,request) {
  const duration=Math.max(30,Math.min(state.settings.maxDuration,minutes(request.end)-minutes(request.start)||30));
  const lunch=resource.startsWith('table-'),open=minutes(lunch?state.settings.lunchOpen:state.settings.open),close=minutes(lunch?state.settings.lunchClose:state.settings.close);
  const first=request.date&&request.date>=todayRome()?request.date:todayRome();
  for(let offset=0;offset<=30;offset++){
    const date=addDays(first,offset);if(date>addDays(todayRome(),30))break;
    for(let start=offset===0?Math.max(open,minutes(request.start)||open):open;start+duration<=close;start+=30){
      const candidate={date,start:timeString(start),end:timeString(start+duration)};
      if(romeInstant(date,candidate.start).getTime()<=Date.now())continue;
      if(!validateRequest(state,resource,candidate))return {request:candidate};
    }
  }
  return {error:'Non ci sono fasce disponibili entro i prossimi 30 giorni. Prova una durata più breve o un altro spazio.'};
}
