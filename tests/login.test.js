import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {toBase64,grpcFrame} from '../extension/protocol.js';
import {encryptVault} from '../extension/vault.js';

let listener,behavior='success',cookieValue='new-synthetic-cookie';const actions=[],masterEmails=[];
const completedUrl='https://accounts.google.com/v3/signin/speedbump/embeddedsigninconsent#close';
const loginTab={id:42,url:completedUrl};
const store=()=>{const data={};return {data,async setAccessLevel(){},async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in data).map(key=>[key,structuredClone(data[key])]));},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};};
const local=store(),session=store(),event={addListener(){}};
globalThis.chrome={storage:{local,session},runtime:{id:'login-test',getURL:file=>'chrome-extension://login-test/'+file,onMessage:{addListener(value){listener=value;}},async openOptionsPage(){actions.push('options');}},
  declarativeNetRequest:{async updateDynamicRules(){}},alarms:{async create(){},onAlarm:event},
  permissions:{async getAll(){return {origins:[]};},async contains(){return true;},onAdded:event,onRemoved:event},
  scripting:{async getRegisteredContentScripts(){return [];},async unregisterContentScripts(){},async registerContentScripts(){}},
  tabs:{async query(){return [];},async create(options){actions.push('create');assert.equal(options.url,'https://accounts.google.com/EmbeddedSetup');return {...loginTab};},async get(id){assert.equal(id,42);return {...loginTab};},async remove(id){actions.push('close:'+id);},onUpdated:event},
  cookies:{async get(){return {value:cookieValue};},onChanged:event}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(url.includes('android.clients')){
    const values=new URLSearchParams(options.body);
    if(values.has('Token')){
      actions.push('master');masterEmails.push(values.get('Email'));
      if(behavior==='master-network')throw new Error('synthetic network failure');
      if(behavior==='email-required' && !values.has('Email'))return new Response('Error=BadAuthentication\n',{status:403});
      return new Response('Token=synthetic-master\nEmail=test@example.com\naccountId=123\n');
    }
    actions.push('access');return new Response('Auth=synthetic-access\n');
  }
  actions.push('read');
  if(behavior==='fail')throw new Error('synthetic network failure');
  if(behavior==='navigated')loginTab.url='https://accounts.google.com/ManageAccount';
  return new Response(grpcFrame(new Uint8Array()),{headers:{'content-type':'application/grpc'}});
};
after(()=>{globalThis.fetch=originalFetch;});
await import('../extension/worker.js');
const send=message=>new Promise(resolve=>listener(message,{id:'login-test',url:'chrome-extension://login-test/options.html'},resolve));
async function prepare(mode='success'){
  behavior=mode;actions.length=0;masterEmails.length=0;cookieValue='new-synthetic-cookie';loginTab.url=completedUrl;
  for(const data of [local.data,session.data])for(const key of Object.keys(data))delete data[key];
  const key=crypto.getRandomValues(new Uint8Array(32)),salt=crypto.getRandomValues(new Uint8Array(16));
  const data={session:null,records:[],lastSync:null};
  await local.set({vault:await encryptVault(data,key,salt)});
  await session.set({unlocked:{key:toBase64(key),data,expiresAt:Date.now()+60000},pendingGoogle:{tabId:42,started:Date.now(),oldHash:'previous-cookie'}});
}
test('successful login returns to options and closes only its completed Google tab after the read',async()=>{
  await prepare();const result=await send({op:'status'});
  assert.equal(result.ok,true);assert.equal(result.data.connected,true);assert.equal(result.data.pendingGoogle,false);
  assert.deepEqual(actions,['master','access','read','options','close:42']);
  assert.deepEqual(masterEmails,[null]);
  assert.equal(result.data.email,'test@example.com');
});
test('a login tab navigated elsewhere by the user is preserved without stealing focus',async()=>{
  await prepare('navigated');const result=await send({op:'status'});
  assert.equal(result.data.connected,true);assert.deepEqual(actions,['master','access','read']);
});
test('failed record read retains the exchanged session and leaves the login tab open',async()=>{
  await prepare('fail');const result=await send({op:'status'});
  assert.equal(result.data.connected,true);assert.equal(result.data.lastError.code,'NETWORK');
  assert.equal(session.data.unlocked.data.session.masterToken,'synthetic-master');assert.deepEqual(actions,['master','access','read']);
});
test('an incomplete consent page is not consumed or closed automatically',async()=>{
  await prepare();loginTab.url=completedUrl.replace('#close','');const result=await send({op:'status'});
  assert.equal(result.data.pendingGoogle,true);assert.equal(result.data.connected,false);assert.deepEqual(actions,[]);
});

test('connect opens Google without requiring or reusing a typed email',async()=>{
  await prepare();delete session.data.pendingGoogle;
  const result=await send({op:'connect'});
  assert.equal(result.ok,true);assert.deepEqual(actions,['create']);
  assert.equal('email' in session.data.pendingGoogle,false);
});

test('email fallback appears only after automatic exchange fails and does not retry on status polls',async()=>{
  await prepare('email-required');const result=await send({op:'status'});
  assert.equal(result.data.emailRequired,true);assert.equal(result.data.pendingGoogle,true);assert.equal(result.data.connected,false);
  assert.equal(session.data.pendingGoogle.exchanging,false);
  assert.equal('token' in session.data.pendingGoogle,false);
  assert.deepEqual(actions,['master','options']);
  await send({op:'status'});assert.deepEqual(actions,['master','options']);
  const finished=await send({op:'finishConnect',email:'selected@example.com'});
  assert.equal(finished.ok,true);assert.equal(finished.data.connected,true);assert.equal(finished.data.emailRequired,false);
  assert.equal(finished.data.email,'test@example.com'); // Server identity is authoritative.
  assert.deepEqual(masterEmails,[null,'selected@example.com']);
});

test('a changed Google cookie cannot be used with a pending manual-email fallback',async()=>{
  await prepare('email-required');await send({op:'status'});cookieValue='another-synthetic-cookie';
  const result=await send({op:'finishConnect',email:'selected@example.com'});
  assert.equal(result.ok,false);assert.equal(result.error.code,'AUTH');
  assert.equal(session.data.pendingGoogle,undefined);assert.deepEqual(masterEmails,[null]);
  assert.equal(session.data.unlocked.data.session,null);
});

test('network errors do not ask for an email and expired fallbacks cannot retry',async()=>{
  await prepare('master-network');let result=await send({op:'status'});
  assert.equal(result.data.emailRequired,false);assert.equal(result.data.lastError.code,'NETWORK');
  await prepare('email-required');await send({op:'status'});
  session.data.pendingGoogle.started=Date.now()-16*60*1000;
  result=await send({op:'finishConnect',email:'selected@example.com'});
  assert.equal(result.data.connected,false);assert.equal(result.data.pendingGoogle,false);
  assert.deepEqual(masterEmails,[null]);
});
