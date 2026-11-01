export function showAdminSection(section,root=document){
  const panels={rules:'admin-rules-section',accounts:'admin-accounts',operations:'admin-operations',usage:'admin-usage-section',audit:'admin-audit-section'};
  for(const [key,id]of Object.entries(panels))root.querySelector('#'+id).hidden=key!==section;
  root.querySelector('#shared-admin').hidden=section==='rules';
  for(const button of root.querySelectorAll('[data-admin-section]'))button.setAttribute('aria-pressed',String(button.dataset.adminSection===section));
}
