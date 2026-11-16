import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toBase64} from '../extension/protocol.js';
let listener,sitePermission=true;
const store=()=>{
  const data={};return {data,async setAccessLevel(){},async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in data).map(key=>[key,structuredClone(data[key])]));},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};
};
const local=store(),session=store(),event={addListener(){}};
const record={id:'test-credential',issuer:'GitHub',account:'synthetic-user',secret:toBase64(new TextEncoder().encode('12345678901234567890')),type:1,algorithm:1,digitEnum:2,supported:true};
const tab={id:1,windowId:1,url:'https://github.com/login'};
globalThis.chrome={storage:{local,session},runtime:{id:'test-extension',getURL:file=>'chrome-extension://test-extension/'+file,onMessage:{addListener(value){listener=value;}}},
  declarativeNetRequest:{async updateDynamicRules(){}},
  alarms:{async create(){},onAlarm:event},permissions:{async getAll(){return {origins:[]};},async contains(){return sitePermission;},onAdded:event,onRemoved:event},
  scripting:{async getRegisteredContentScripts(){return [];},async registerContentScripts(){},async unregisterContentScripts(){}},
  tabs:{async query(){return [tab];},async get(){return tab;},async sendMessage(){},onUpdated:event},cookies:{onChanged:event}};
await import('../extension/worker.js');
const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
const ui={id:'test-extension',url:'chrome-extension://test-extension/popup.html'};
const site={id:'test-extension',url:'https://github.com/login',frameId:0,tab};
test('content scripts cannot request the account list or arbitrary account codes',async()=>{
  await session.set({unlocked:{key:'synthetic',expiresAt:Date.now()+60000,data:{session:{email:'test@example.com',masterToken:'never-expose'},records:[record]}}});
  const status=await send({op:'status'},ui);assert.equal(status.ok,true);assert.equal(status.data.accounts.length,1);
  assert.equal(JSON.stringify(status).includes('never-expose'),false);assert.equal(JSON.stringify(status).includes(record.secret),false);
  assert.equal((await send({op:'status'},site)).ok,false);assert.equal((await send({op:'code',id:record.id},site)).ok,false);
  const info=await send({op:'siteInfo'},site);assert.equal(info.ok,true);assert.equal(info.data.accounts.length,1);assert.equal(JSON.stringify(info).includes(record.secret),false);
  assert.equal((await send({op:'siteCode',id:'unrelated'},site)).ok,false);
  const code=await send({op:'siteCode',id:record.id},site);assert.match(code.data.code,/^\d{6}$/);assert.equal(JSON.stringify(code).includes('masterToken'),false);
});
test('automatic code display is restricted to trusted UI and does not extend unlock lifetime',async()=>{
  const expiresAt=session.data.unlocked.expiresAt;
  const result=await send({op:'codes'},ui);
  assert.equal(result.ok,true);assert.equal(result.data.codes.length,1);assert.match(result.data.codes[0].code,/^\d{6}$/);
  assert.equal(session.data.unlocked.expiresAt,expiresAt);
  assert.equal(JSON.stringify(result).includes(record.secret),false);assert.equal(JSON.stringify(result).includes('never-expose'),false);
  assert.equal((await send({op:'codes'},site)).ok,false);
});
test('iframe, external extension, navigation and lookalike-origin requests fail',async()=>{
  for(const sender of [{...site,frameId:1},{...site,id:'other-extension'},{...site,url:'https://github.com.attacker.example/'}])assert.equal((await send({op:'siteCode',id:record.id},sender)).ok,false);
  tab.url='https://attacker.example/';assert.equal((await send({op:'siteCode',id:record.id},site)).ok,false);tab.url='https://github.com/login';
  assert.equal((await send({op:'bind',id:record.id,tabId:1,expectedOrigin:'https://other.example'},ui)).ok,false);
});
test('expired unlock sessions are removed and cannot generate codes',async()=>{
  const saved=(await session.get('unlocked')).unlocked;saved.expiresAt=Date.now()-1;await session.set({unlocked:saved});
  assert.equal((await send({op:'siteCode',id:record.id},site)).ok,false);assert.equal(session.data.unlocked,undefined);
});
test('a remaining content script cannot retrieve codes after site permission is revoked',async()=>{
  await session.set({unlocked:{expiresAt:Date.now()+60000,data:{records:[record]}}});
  sitePermission=false;assert.equal((await send({op:'siteCode',id:record.id},site)).ok,false);
  sitePermission=true;assert.equal((await send({op:'siteCode',id:record.id},site)).ok,true);
});
