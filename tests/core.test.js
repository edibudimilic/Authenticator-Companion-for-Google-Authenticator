import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totp,decodeFields,decodeGrpcFrames,decodeListResponse,grpcFrame,stringField,concat,toBase64,fromBase64} from '../extension/protocol.js';
import {passwordKey,encryptVault,decryptVault} from '../extension/vault.js';
import {matchingRecords,siteOrigin,accountOrigin,safeFaviconUrl} from '../extension/sites.js';
import {fetchRecords,exchangeLogin} from '../extension/google.js';

const utf8=new TextEncoder();
const vint=value=>{const result=[];do{const part=value&127;value=Math.floor(value/128);result.push(part|(value?128:0));}while(value);return Uint8Array.from(result);};
const bytes=(field,value)=>concat(vint(field*8+2),vint(value.length),value);
const integer=(field,value)=>Uint8Array.of(field*8,value);
const secret=utf8.encode('12345678901234567890');
const resource='internalservices/GOOGLE_AUTHENTICATOR/owneridnamespaces/GOOGLE_USER_ID/ownerids/123/externalservices/GitHub/credentials/test';
const otp=concat(bytes(1,secret),stringField(2,'test-user'),stringField(3,'GitHub'),integer(4,1),integer(5,1),integer(6,2));
const credential=concat(stringField(1,resource),bytes(2,bytes(1,otp)));
// A captured-schema fixture with a public RFC secret; no real account data.
const responseBody=grpcFrame(bytes(1,credential));

test('RFC 6238 vectors for SHA-1, SHA-256 and SHA-512',async()=>{
  const vectors=[
    [59,'94287082','46119246','90693936'],[1111111109,'07081804','68084774','25091201'],
    [1111111111,'14050471','67062674','99943326'],[1234567890,'89005924','91819424','93441116'],
    [2000000000,'69279037','90698825','38618901'],[20000000000,'65353130','77737706','47863826'],
  ];
  const keys=['12345678901234567890','12345678901234567890123456789012','1234567890123456789012345678901234567890123456789012345678901234'];
  for(const [time,...expected] of vectors)for(const [index,algorithm] of ['SHA-1','SHA-256','SHA-512'].entries())assert.equal(await totp(utf8.encode(keys[index]),time,8,algorithm),expected[index]);
});
test('live Passbox digit enum 2 means six digits and secrets stay separate from labels',()=>{
  const {records}=decodeListResponse(responseBody);assert.equal(records.length,1);assert.equal(records[0].supported,true);
  assert.equal(records[0].digitEnum,2);assert.equal(records[0].issuer,'GitHub');assert.deepEqual(fromBase64(records[0].secret),secret);
});
test('malformed and empty gRPC replies fail instead of erasing cached accounts',()=>{
  assert.throws(()=>decodeGrpcFrames(new Uint8Array()));assert.throws(()=>decodeGrpcFrames(Uint8Array.of(0,0,0,0,20,1)));
  assert.throws(()=>decodeGrpcFrames(Uint8Array.of(1,0,0,0,0)));assert.throws(()=>decodeFields(Uint8Array.of(10,255)));
  assert.deepEqual(decodeListResponse(grpcFrame(new Uint8Array())).records,[]);
});
test('domain matching rejects lookalike domains, unrelated domains and insecure sites',()=>{
  const records=[{id:'github',issuer:'GitHub'},{id:'private',issuer:'secure.example.com'}];
  assert.equal(matchingRecords(records,'https://github.com').length,1);
  for(const origin of ['https://github.com.attacker.example','https://attacker-github.com','http://github.com','https://githüb.com'])assert.deepEqual(matchingRecords(records,origin),[]);
  assert.equal(matchingRecords(records,'https://secure.example.com')[0].id,'private');
  assert.equal(matchingRecords(records,'https://other.example',{ 'https://other.example':['github']})[0].id,'github');
  assert.equal(siteOrigin('chrome://settings'),null);assert.equal(siteOrigin('http://127.0.0.1:1234'),'http://127.0.0.1:1234');
});
test('vault rejects wrong passwords and modified ciphertext and randomizes encryption',async()=>{
  const salt=crypto.getRandomValues(new Uint8Array(16)), key=await passwordKey('test-password-123',salt);
  const value={masterToken:'synthetic-only',records:[{secret:toBase64(secret)}]};
  const first=await encryptVault(value,key,salt),second=await encryptVault(value,key,salt);
  assert.notEqual(first.iv,second.iv);assert.notEqual(first.ciphertext,second.ciphertext);assert.deepEqual(await decryptVault(first,key),value);
  const wrong=await passwordKey('wrong-password-123',salt);await assert.rejects(()=>decryptVault(first,wrong));
  const changed=fromBase64(first.ciphertext);changed[0]^=1;await assert.rejects(()=>decryptVault({...first,ciphertext:toBase64(changed)},key));
});
test('favicons follow explicit account bindings and reject unsafe image URLs',()=>{
  const record={id:'one',issuer:'GitHub'};
  assert.equal(accountOrigin(record,{}),'https://github.com');
  const bindings={'https://git.example.com':['one'],'https://second.example.com':['one']};
  assert.equal(accountOrigin(record,bindings),'https://git.example.com');
  assert.equal(accountOrigin(record,bindings,'https://second.example.com/login'),'https://second.example.com');
  assert.equal(safeFaviconUrl('javascript:alert(1)'),null);assert.equal(safeFaviconUrl('https://user:secret@example.com/icon'),null);
  assert.equal(safeFaviconUrl('https://example.com/favicon.ico'),'https://example.com/favicon.ico');
});
test('Google requests use only fixed Google destinations and the full resource parent',async()=>{
  const originalFetch=globalThis.fetch;const requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return url.includes('android.clients') ? new Response('Auth=synthetic\n') : new Response(responseBody,{headers:{'content-type':'application/grpc'}});};
  try {
    const records=await fetchRecords({email:'test@example.com',masterToken:'synthetic',accountId:'123',androidId:'1234567890123456'});assert.equal(records.length,1);
    for(const {url,options} of requests){assert.ok(['android.clients.google.com','passbox-pa.googleapis.com'].includes(new URL(url).hostname));assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');}
    const parent=decodeFields(requests[1].options.body.slice(5)).find(f=>f.number===1).value;
    assert.ok(new TextDecoder().decode(parent).endsWith('/ownerids/123/externalservices/-'));
    globalThis.fetch=async()=>new Response('Error=BadAuthentication\n',{status:403});await assert.rejects(()=>exchangeLogin('synthetic','test@example.com'),error=>error.code==='BadAuthentication');
  }finally{globalThis.fetch=originalFetch;}
});
