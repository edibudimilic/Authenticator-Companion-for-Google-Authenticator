import {test} from 'node:test';
import assert from 'node:assert/strict';
let listener,permissionAdded,granted=false,injected=false,refreshes=0,injections=0;
const store=()=>{const data={};return {data,async setAccessLevel(){},async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in data).map(key=>[key,structuredClone(data[key])]));},async set(value){Object.assign(data,structuredClone(value));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};};
const local=store(),session=store(),event={addListener(){}};
const record={id:'account',issuer:'Private service',account:'demo',supported:true};
const tab={id:1,windowId:1,url:'https://private.example/login',favIconUrl:'https://private.example/brand.ico'};
globalThis.chrome={storage:{local,session},runtime:{id:'binding-test',getManifest:()=>({version:'0.1.4'}),getURL:file=>'chrome-extension://binding-test/'+file,onMessage:{addListener(value){listener=value;}}},
  declarativeNetRequest:{async updateDynamicRules(){}},alarms:{async create(){},onAlarm:event},
  permissions:{async getAll(){return {origins:granted?['https://private.example/*']:[]};},async contains(){return granted;},onAdded:{addListener(value){permissionAdded=value;}},onRemoved:event},
  scripting:{async getRegisteredContentScripts(){return [];},async registerContentScripts(){},async unregisterContentScripts(){},async executeScript(){injected=true;injections++;}},
  tabs:{async query(){return [tab];},async get(){return {...tab};},async sendMessage(_id,message){if(message.type==='companion:ping'){if(!injected)throw new Error('no receiver');return {version:'0.1.4'};}if(message.type==='companion:refresh'){refreshes++;assert.equal(message.origin,'https://private.example');assert.deepEqual(message.info.accounts.map(record=>record.id),['account']);return {ready:true};}},onUpdated:event},cookies:{onChanged:event}};
await import('../extension/worker.js');
const ui={id:'binding-test',url:'chrome-extension://binding-test/popup.html'};
const send=message=>new Promise(resolve=>listener(message,ui,resolve));
async function reset(){for(const data of [local.data,session.data])for(const key of Object.keys(data))delete data[key];granted=false;injected=false;refreshes=injections=0;tab.url='https://private.example/login';await session.set({unlocked:{key:'synthetic',expiresAt:Date.now()+60000,data:{records:[record],session:null,lastSync:null}}});}
test('first permission grant completes binding without a second popup request',async()=>{
  await reset();const prepared=await send({op:'prepareBind',key:'first',tabId:1,id:'account',expectedOrigin:'https://private.example'});
  assert.equal(prepared.ok,true);assert.equal(prepared.data.pending,true);assert.equal(local.data.bindings,undefined);
  // The popup is now gone. Only Chrome's permission event completes this.
  granted=true;permissionAdded({origins:['https://private.example/*']});await send({op:'status'});
  assert.deepEqual(local.data.bindings['https://private.example'],['account']);assert.equal(session.data.pendingBinding,undefined);
  assert.equal(local.data.siteFavicons['https://private.example'],'https://private.example/brand.ico');assert.equal(injections,1);assert.equal(refreshes,1);
});
test('existing permission and repeated binding reuse the live content script',async()=>{
  await reset();granted=true;
  await send({op:'prepareBind',key:'already',tabId:1,id:'account',expectedOrigin:'https://private.example'});
  const result=await send({op:'bind',tabId:1,id:'account',expectedOrigin:'https://private.example'});
  assert.equal(result.ok,true);assert.equal(injections,1);assert.equal(refreshes,2);assert.deepEqual(local.data.bindings['https://private.example'],['account']);
});
test('denied or cancelled permission never saves an account binding',async()=>{
  await reset();await send({op:'prepareBind',key:'cancel',tabId:1,id:'account',expectedOrigin:'https://private.example'});
  await send({op:'cancelBind',key:'cancel'});granted=true;permissionAdded({});await send({op:'status'});
  assert.equal(local.data.bindings,undefined);assert.equal(injections,0);
});
test('navigation during the permission prompt prevents binding to the new origin',async()=>{
  await reset();await send({op:'prepareBind',key:'navigation',tabId:1,id:'account',expectedOrigin:'https://private.example'});
  tab.url='https://other.example/login';granted=true;permissionAdded({});await send({op:'status'});
  assert.equal(local.data.bindings,undefined);assert.equal(injections,0);assert.equal(session.data.pendingBinding,undefined);
});
