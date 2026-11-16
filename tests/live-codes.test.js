import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveCodes} from '../extension/live-codes.js';

test('codes remain available across list rerenders and refresh at expiry',async()=>{
  let now=1000,reads=0;
  const codes=new LiveCodes(async()=>({codes:[{id:'one',code:++reads===1?'123456':'654321',expiresAt:now+30000}]}),()=>now);
  const accounts=[{id:'one',supported:true}];codes.setAccounts(accounts);
  await codes.refresh();assert.equal(codes.get('one').code,'123456');
  codes.setAccounts(accounts);await codes.refresh();assert.equal(reads,1);assert.equal(codes.get('one').code,'123456');
  now+=30000;assert.equal(codes.get('one'),null);await codes.refresh();assert.equal(codes.get('one').code,'654321');assert.equal(reads,2);
});
test('hiding or locking the UI clears codes and discards a late response',async()=>{
  let respond;
  const codes=new LiveCodes(()=>new Promise(resolve=>{respond=resolve;}),()=>1000);
  codes.setAccounts([{id:'one',supported:true}]);const pending=codes.refresh();codes.clear();
  respond({codes:[{id:'one',code:'123456',expiresAt:31000}]});await pending;assert.equal(codes.get('one'),null);
});
test('expired and unrelated codes are never displayed',async()=>{
  const codes=new LiveCodes(async()=>({codes:[{id:'old',code:'123456',expiresAt:999},{id:'other',code:'654321',expiresAt:31000}]}),()=>1000);
  codes.setAccounts([{id:'old',supported:true},{id:'unsupported',supported:false}]);await codes.refresh();
  assert.equal(codes.get('old'),null);assert.equal(codes.get('other'),null);assert.equal(codes.get('unsupported'),null);
});
