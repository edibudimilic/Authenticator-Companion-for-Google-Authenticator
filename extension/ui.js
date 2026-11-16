import {LiveCodes} from './live-codes.js';
import {accountOrigin,safeFaviconUrl} from './sites.js';
const $ = selector => document.querySelector(selector);
const page = document.body.dataset.page;
let state, activeTab, matches=[], renderedSignature='', loading=false;
const codeElements=new Map();
const liveCodes=new LiveCodes(()=>ask('codes'));
let codeRetryAfter=0;
async function ask(op,values={}) {
  const result=await chrome.runtime.sendMessage({op,...values});
  if(!result?.ok)throw new Error(result?.error?.message || 'Radnja nije uspjela.');
  return result.data;
}
function showError(error) {$('#alert').textContent=error.message;$('#alert').hidden=false;}
async function action(callback,button) {
  $('#alert').hidden=true;if(button)button.disabled=true;
  try{await callback();await load();}catch(error){showError(error);}finally{if(button)button.disabled=false;}
}
function ago(time) {if(!time)return 'Još nije osvježeno';const seconds=Math.max(0,Math.floor((Date.now()-time)/1000));return seconds<60?'Upravo osvježeno':`Prije ${Math.floor(seconds/60)} min`;}
function addButton(parent,label,handler,cls='') {
  const button=document.createElement('button');button.type='button';button.textContent=label;button.className=cls;button.addEventListener('click',()=>action(()=>handler(button),button));parent.append(button);return button;
}
async function bindAccount(id) {
  if(!activeTab?.url)throw new Error('Otvori stranicu za prijavu.');
  const url=new URL(activeTab.url),origin=url.origin;
  const key=crypto.randomUUID();
  // Send intent before opening Chrome's permission prompt. The worker can
  // finish the binding even if Chrome closes this popup during the prompt.
  const prepared=ask('prepareBind',{key,tabId:activeTab.id,id,expectedOrigin:origin});
  const permission=chrome.permissions.request({origins:[`${url.protocol}//${url.hostname}/*`]});
  const [granted]=await Promise.all([permission,prepared]);
  if(!granted){await ask('cancelBind',{key});throw new Error('Pristup stranici nije dopušten.');}
  await ask('finishBind',{key});
  matches=(await ask('siteMatches',{tabId:activeTab.id})).accounts;
  renderedSignature='';
}
function accountCard(account,isMatch=false) {
  const card=document.createElement('div');card.className='account';
  const head=document.createElement('div');head.className='account-head';const title=document.createElement('div');
  const name=document.createElement('strong');name.textContent=account.issuer || 'Authenticator';
  const label=document.createElement('span');label.className='label';label.textContent=account.account;title.append(name,label);head.append(title);card.append(head);
  const origin=accountOrigin(account,state.bindings,activeTab?.url);
  const iconBox=document.createElement('span');iconBox.className='account-icon';iconBox.ariaHidden='true';
  const fallback=document.createElement('span');fallback.className='favicon-fallback';fallback.textContent=(account.issuer || account.account || '?').slice(0,1).toUpperCase();iconBox.append(fallback);
  if(origin){
    const source=safeFaviconUrl(state.siteFavicons?.[origin]) || `${origin}/favicon.ico`;
    const icon=document.createElement('img');icon.className='favicon';icon.alt='';icon.width=24;icon.height=24;icon.loading='lazy';icon.decoding='async';icon.referrerPolicy='no-referrer';
    icon.addEventListener('load',()=>{icon.style.opacity='1';fallback.hidden=true;});icon.addEventListener('error',()=>{icon.hidden=true;fallback.hidden=false;});icon.src=source;iconBox.append(icon);
  }
  head.prepend(iconBox);title.className='account-title';
  const codeRow=document.createElement('div');codeRow.className='code-row';
  const code=document.createElement('div');code.className='code';code.textContent='••• •••';
  const timer=document.createElement('span');timer.className='code-timer';
  codeRow.append(code,timer);card.append(codeRow);
  const actions=document.createElement('div');actions.className='account-actions';card.append(actions);
  if(!account.supported){const note=document.createElement('span');note.className='unsupported';note.textContent='Nepodržan tip 2FA zapisa';actions.append(note);return card;}
  codeElements.set(account.id,{code,timer});
  addButton(actions,'Kopiraj',async button=>{const result=await ask('code',{id:account.id});await navigator.clipboard.writeText(result.code);button.textContent='Kopirano';setTimeout(()=>{button.textContent='Kopiraj';},1500);});
  if(page==='popup' && activeTab?.url && /^(https:|http:\/\/(localhost|127\.0\.0\.1))/.test(activeTab.url)) {
    if(isMatch)addButton(actions,'Popuni',()=>ask('fill',{id:account.id,tabId:activeTab.id,expectedOrigin:new URL(activeTab.url).origin}),'fill');
    else addButton(actions,'Poveži sa stranicom',()=>bindAccount(account.id));
  }
  return card;
}
function renderAccounts() {
  if(!state || state.locked)return;
  const list=$('#accounts');if(!list)return;list.replaceChildren();codeElements.clear();
  const search=($('#search')?.value || '').toLowerCase();
  const accounts=state.accounts.filter(a=>(a.issuer+' '+a.account).toLowerCase().includes(search));
  const ids=new Set(matches.map(a=>a.id));
  const ordered=page==='popup'?[...accounts.filter(a=>ids.has(a.id)),...accounts.filter(a=>!ids.has(a.id))]:accounts;
  if(!ordered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=state.connected?'Nema računa za ovaj upit.':'Poveži Google račun da bi se ovdje pojavili kodovi.';list.append(empty);return;}
  let group='';
  for(const account of ordered){
    if(page==='popup'){
      const next=ids.has(account.id)?'ZA OVU STRANICU':'SVI RAČUNI';
      if(next!==group){const heading=document.createElement('div');heading.className='group-title';heading.textContent=next;list.append(heading);group=next;}
    }
    list.append(accountCard(account,ids.has(account.id)));
  }
  paintCodes();
}
function paintCodes() {
  for(const [id,elements] of codeElements) {
    const value=liveCodes.get(id);
    const seconds=value?Math.max(0,Math.ceil((value.expiresAt-Date.now())/1000)):0;
    const expiring=Boolean(value) && seconds>0 && seconds<=5;
    elements.code.textContent=value ? value.code.slice(0,3)+' '+value.code.slice(3) : '••• •••';
    elements.timer.textContent=value ? `${seconds} s` : '';
    elements.code.classList.toggle('expiring',expiring);
    elements.timer.classList.toggle('expiring',expiring);
  }
}
async function refreshVisibleCodes() {
  if(!state || state.locked || !state.connected || document.visibilityState==='hidden' || Date.now()<codeRetryAfter)return;
  try {await liveCodes.refresh();paintCodes();}
  catch(error){codeRetryAfter=Date.now()+5000;liveCodes.clear();paintCodes();await load();}
}
function render() {
  $('#onboarding').hidden=state.configured;$('#locked').hidden=!state.configured || !state.locked;$('#dashboard').hidden=!state.configured || state.locked;
  if(state.locked || !state.configured){liveCodes.clear();liveCodes.setAccounts([]);codeElements.clear();$('#accounts')?.replaceChildren();return;}
  liveCodes.setAccounts(state.accounts);
  $('#connection').textContent=state.connected?`${state.count} računa · ${state.email}`:'Lokalna pohrana je otključana';
  if($('#count'))$('#count').textContent=String(state.count);
  if($('#last-sync'))$('#last-sync').textContent=ago(state.lastSync);
  if(page==='popup'){
    $('#not-connected').hidden=state.connected;$('#connected-tools').hidden=!state.connected;
  }else{
    if(state.email && !$('#google-email').value)$('#google-email').value=state.email;
    $('#pending').hidden=!state.pendingGoogle;
    $('#google-connect').textContent=state.connected?'Ponovi Googleovu prijavu':'Prijavi se Googleom';
    $('#sync').disabled=!state.connected;
    $('#automatic').textContent=state.automatic?'Automatska ponuda je uključena · Isključi':'Omogući automatsku ponudu';
    const bindings=$('#bindings');bindings.replaceChildren();
    const origins=Object.keys(state.bindings);$('#bindings-section').hidden=!origins.length;
    for(const origin of origins){const row=document.createElement('div');row.className='binding';const name=document.createElement('span');name.textContent=origin;row.append(name);addButton(row,'Ukloni vezu',()=>ask('removeBinding',{origin}),'text-button');bindings.append(row);}
  }
  renderAccounts();
}
async function load(force=false) {
  if(loading)return;loading=true;
  try{
    const previous=state;
    state=await ask('status');
    if(previous && (previous.lastSync!==state.lastSync || previous.email!==state.email)){liveCodes.clear();codeRetryAfter=0;}
    if(page==='popup' && !state.locked && activeTab?.id){try{matches=(await ask('siteMatches',{tabId:activeTab.id})).accounts;}catch{matches=[];}}
    const signature=JSON.stringify([state,matches]);
    if(force || signature!==renderedSignature){renderedSignature=signature;render();}
    if(state.lastError){$('#alert').textContent=state.lastError.message;$('#alert').hidden=false;}
    if($('#last-sync'))$('#last-sync').textContent=ago(state.lastSync);
    await refreshVisibleCodes();
  }catch(error){showError(error);}finally{loading=false;}
}
$('#create-form')?.addEventListener('submit',event=>{event.preventDefault();action(async()=>{const password=$('#create-password').value;if(password!==$('#confirm-password').value)throw new Error('Lozinke se ne poklapaju.');await ask('createVault',{password});$('#create-password').value=$('#confirm-password').value='';},event.submitter);});
$('#unlock-form')?.addEventListener('submit',event=>{event.preventDefault();action(async()=>{await ask('unlock',{password:$('#unlock-password').value});$('#unlock-password').value='';},event.submitter);});
$('#connect-form')?.addEventListener('submit',event=>{event.preventDefault();action(()=>ask('connect',{email:$('#google-email').value}),event.submitter);});
$('#finish-connect')?.addEventListener('click',event=>action(()=>ask('finishConnect'),event.currentTarget));
$('#lock')?.addEventListener('click',()=>action(()=>ask('lock')));
$('#sync')?.addEventListener('click',event=>action(()=>ask('sync'),event.currentTarget));
$('#search')?.addEventListener('input',renderAccounts);
for(const id of ['setup','settings','connect-settings'])$('#'+id)?.addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('#automatic')?.addEventListener('click',event=>action(async()=>{
  if(state.automatic)await chrome.permissions.remove({origins:['https://*/*']});
  else if(!await chrome.permissions.request({origins:['https://*/*']}))throw new Error('Automatska ponuda nije uključena.');
  await ask('permissionsChanged');
},event.currentTarget));
if(page==='popup'){try{[activeTab]=await chrome.tabs.query({active:true,currentWindow:true});}catch{}}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){liveCodes.clear();paintCodes();}
  else {codeRetryAfter=0;load();}
});
await load();setInterval(()=>load(),2000);
setInterval(()=>{paintCodes();refreshVisibleCodes();},1000);
