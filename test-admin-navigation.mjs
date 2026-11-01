import assert from 'node:assert/strict';
import {showAdminSection} from './dist/admin-navigation.js';
const panels={rules:'admin-rules-section',accounts:'admin-accounts',operations:'admin-operations',usage:'admin-usage-section',audit:'admin-audit-section'};
const elements=Object.fromEntries([...Object.values(panels),'shared-admin'].map(id=>['#'+id,{hidden:false}]));
const buttons=Object.keys(panels).map(section=>({dataset:{adminSection:section},setAttribute(name,value){this[name]=value;}}));
const root={querySelector:selector=>elements[selector],querySelectorAll:()=>buttons};
for(const section of ['rules','accounts','operations','usage','audit','rules','usage','accounts']){
  showAdminSection(section,root);
  for(const [key,id]of Object.entries(panels))assert.equal(elements['#'+id].hidden,key!==section);
  assert.equal(elements['#shared-admin'].hidden,section==='rules');
  assert.deepEqual(buttons.filter(b=>b['aria-pressed']==='true').map(b=>b.dataset.adminSection),[section]);
}
console.log('Gestione verificata: cinque pannelli distinti, un solo pannello e pulsante attivi, ritorno alle sezioni senza contenuti residui.');
