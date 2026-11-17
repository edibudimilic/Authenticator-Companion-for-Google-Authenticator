import {CompanionError,toBase64,fromBase64,recordCode} from './protocol.js';
import {passwordKey,encryptVault,decryptVault} from './vault.js';
import {exchangeLogin,fetchRecords} from './google.js';
import {siteOrigin,matchingRecords,metadata,safeFaviconUrl} from './sites.js';

const UNLOCK_MS = 30*60*1000;
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  // Native gRPC needs TE: trailers, which fetch cannot set. Restrict the
  // network rule to this extension and the one read-only Google RPC.
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2],addRules:[
    {id:1,priority:1,condition:{regexFilter:'^https://passbox-pa\\.googleapis\\.com/google\\.internal\\.identity\\.passbox\\.passbox\\.v1\\.PassboxExternalService/ListCredentials$',initiatorDomains:[chrome.runtime.id],resourceTypes:['xmlhttprequest'],requestMethods:['post']},action:{type:'modifyHeaders',requestHeaders:[{header:'te',operation:'set',value:'trailers'},{header:'user-agent',operation:'set',value:'grpc-java-android/1.65.0'}]}},
    {id:2,priority:1,condition:{regexFilter:'^https://android\\.clients\\.google\\.com/auth$',initiatorDomains:[chrome.runtime.id],resourceTypes:['xmlhttprequest'],requestMethods:['post']},action:{type:'modifyHeaders',requestHeaders:[{header:'user-agent',operation:'set',value:'GoogleAuth/1.4'}]}}
  ]});
  await chrome.alarms.create('maintenance',{periodInMinutes:1});
  await registerScripts();
})();
let queue = Promise.resolve();
function enqueue(action) { const result = queue.then(() => ready).then(action); queue = result.catch(() => {}); return result; }
function safeError(error) {
  return error instanceof CompanionError ? {code:error.code,message:error.message} : {code:'INTERNAL',message:'The action failed. Please try again.'};
}
async function unlockState(touch = false) {
  const {unlocked} = await chrome.storage.session.get('unlocked');
  if (!unlocked || unlocked.expiresAt < Date.now()) {
    if (unlocked) await chrome.storage.session.remove('unlocked');
    return null;
  }
  if (touch) {unlocked.expiresAt = Date.now()+UNLOCK_MS; await chrome.storage.session.set({unlocked});}
  return unlocked;
}
async function requireUnlocked(touch = false) {
  const state = await unlockState(touch);
  if (!state) throw new CompanionError('LOCKED','Unlock Authenticator with your local vault password.');
  return state;
}
async function saveVault(state) {
  const {vault} = await chrome.storage.local.get('vault');
  if (!vault) throw new CompanionError('VAULT','The local vault has not been set up.');
  const encrypted = await encryptVault(state.data,fromBase64(state.key),fromBase64(vault.salt));
  await chrome.storage.local.set({vault:encrypted,summary:{count:state.data.records.length,lastSync:state.data.lastSync}});
  await chrome.storage.session.set({unlocked:state});
}
async function synchronize() {
  const state = await requireUnlocked();
  if (!state.data.session) throw new CompanionError('NOT_CONNECTED','Connect a Google account first.');
  try {
    const records = await fetchRecords(state.data.session);
    state.data.records = records; state.data.lastSync = Date.now();
    await saveVault(state); await chrome.storage.local.remove('lastError');
    return {count:records.length};
  } catch (error) {await chrome.storage.local.set({lastError:safeError(error)}); throw error;}
}
async function registerScripts() {
  const {origins=[]} = await chrome.permissions.getAll();
  const matches = origins.filter(origin => origin === 'https://*/*' || origin.startsWith('http://127.0.0.1/') || origin.startsWith('http://localhost/') || (origin.startsWith('https://') && !['https://accounts.google.com/*','https://android.clients.google.com/*','https://passbox-pa.googleapis.com/*'].includes(origin)));
  const {bindings={}} = await chrome.storage.local.get('bindings');
  for (const origin of Object.keys(bindings)) {
    if (!siteOrigin(origin)) continue;
    const url = new URL(origin), pattern = `${url.protocol}//${url.hostname}/*`;
    if (await chrome.permissions.contains({origins:[pattern]})) matches.push(pattern);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.some(script => script.id === 'companion')) await chrome.scripting.unregisterContentScripts({ids:['companion']});
  if (matches.length) await chrome.scripting.registerContentScripts([{id:'companion',matches:[...new Set(matches)],js:['content.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
}
async function notifyTabs(excludeTabId) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab=>tab.id && tab.id!==excludeTabId).map(tab=>chrome.tabs.sendMessage(tab.id,{type:'companion:changed'})));
}
async function tokenHash(value) {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value || ''))));
}
async function finishLoginScreen(tabId,completedUrl) {
  // This is the dedicated tab we opened for this login, not an arbitrary
  // Google tab. Preserve it if the user has navigated somewhere else.
  try {
    const tab=await chrome.tabs.get(tabId);
    if(tab.url!==completedUrl || new URL(tab.url).origin!=='https://accounts.google.com')return;
    await chrome.runtime.openOptionsPage();
    const current=await chrome.tabs.get(tabId);
    if(current.url===completedUrl)await chrome.tabs.remove(tabId);
  } catch {}
}
async function tryFinishGoogleLogin(force = false, fallbackEmail = '') {
  const {pendingGoogle} = await chrome.storage.session.get('pendingGoogle');
  if (!pendingGoogle || pendingGoogle.exchanging) return;
  if (Date.now()-pendingGoogle.started > 15*60*1000) {await chrome.storage.session.remove('pendingGoogle');return;}
  if (pendingGoogle.emailRequired && !fallbackEmail) return;
  let tab;
  try {tab = await chrome.tabs.get(pendingGoogle.tabId);} catch {await chrome.storage.session.remove('pendingGoogle');return;}
  const url = tab.url ? new URL(tab.url) : null;
  if (!url || url.origin !== 'https://accounts.google.com') return;
  if (!force && url.hash !== '#close' && url.pathname !== '/o/android/auth') return;
  const cookie = await chrome.cookies.get({url:'https://accounts.google.com/',name:'oauth_token'});
  if (!cookie || await tokenHash(cookie.value) === pendingGoogle.oldHash) return;
  if (fallbackEmail && (!pendingGoogle.emailRequired || await tokenHash(cookie.value) !== pendingGoogle.fallbackHash)) {
    await chrome.storage.session.remove('pendingGoogle');
    throw new CompanionError('AUTH','The Google sign-in session changed. Please sign in again.');
  }
  const state = await requireUnlocked();
  pendingGoogle.exchanging = true; await chrome.storage.session.set({pendingGoogle});
  try {
    const email = fallbackEmail || pendingGoogle.email || '';
    let session;
    try {session = await exchangeLogin(cookie.value,email);}
    catch (error) {
      if (!email && error instanceof CompanionError && ['AUTH','BadAuthentication','NeedsBrowser'].includes(error.code)) {
        // Keep only a hash of the cookie. The actual token stays in Google's
        // cookie store and is rechecked before any manual-email retry.
        pendingGoogle.emailRequired = true;
        pendingGoogle.fallbackHash = await tokenHash(cookie.value);
        pendingGoogle.exchanging = false;
        await chrome.storage.session.set({pendingGoogle});
        await chrome.storage.local.remove('lastError');
        await chrome.runtime.openOptionsPage();
        return;
      }
      throw error;
    }
    // Retain a successful login even if the following read fails.
    state.data.session = session; await saveVault(state);
    await chrome.storage.session.remove('pendingGoogle');
    await synchronize();
    await notifyTabs();
    await finishLoginScreen(pendingGoogle.tabId,tab.url);
  } catch (error) {
    await chrome.storage.session.remove('pendingGoogle');
    await chrome.storage.local.set({lastError:safeError(error)});
    throw error;
  }
}
async function status() {
  const local = await chrome.storage.local.get(['vault','summary','lastError','bindings','siteFavicons']);
  const state = await unlockState();
  const {pendingGoogle} = await chrome.storage.session.get('pendingGoogle');
  const permissions = await chrome.permissions.getAll();
  return {configured:Boolean(local.vault),locked:!state,connected:Boolean(state?.data.session),email:state?.data.session?.email || '',
    count:state?.data.records.length ?? local.summary?.count ?? 0,lastSync:state?.data.lastSync ?? local.summary?.lastSync ?? null,
    lastError:local.lastError || null,pendingGoogle:Boolean(pendingGoogle),emailRequired:Boolean(pendingGoogle?.emailRequired),automatic:permissions.origins?.includes('https://*/*') || false,
    accounts:state ? state.data.records.map(metadata).sort((a,b)=>(a.issuer+a.account).localeCompare(b.issuer+b.account)) : [],bindings:local.bindings || {},siteFavicons:local.siteFavicons || {}};
}
function trustedUI(sender) {
  return sender.id === chrome.runtime.id && ['popup.html','options.html'].some(file => sender.url === chrome.runtime.getURL(file));
}
async function senderSite(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || !sender.url) throw new CompanionError('ORIGIN','This page request is not allowed.');
  const tab = await chrome.tabs.get(sender.tab.id), origin = siteOrigin(sender.url);
  if (!origin || origin !== siteOrigin(tab.url)) throw new CompanionError('ORIGIN','The page changed. Please try again.');
  const url=new URL(origin),pattern=`${url.protocol}//${url.hostname}/*`;
  if(!await chrome.permissions.contains({origins:[pattern]}))throw new CompanionError('PERMISSION','Access to this site is no longer granted.');
  return {origin,tab};
}
async function handleSite(message,sender) {
  const {origin,tab} = await senderSite(sender);
  const {bindings={}} = await chrome.storage.local.get('bindings');
  const state = await unlockState();
  if (message.op === 'siteInfo') return {locked:!state,accounts:state ? matchingRecords(state.data.records,origin,bindings).filter(r=>r.supported).map(metadata) : [],known:Boolean(bindings[origin])};
  if (message.op === 'openUI') {await chrome.action.openPopup({windowId:tab.windowId});return {};}
  if (message.op === 'siteCode') {
    if (!state) throw new CompanionError('LOCKED','Unlock Authenticator first.');
    const record = matchingRecords(state.data.records,origin,bindings).find(r=>r.id === message.id);
    if (!record) throw new CompanionError('ORIGIN','This account is not linked to this domain.');
    await requireUnlocked(true);
    return recordCode(record);
  }
  throw new CompanionError('ORIGIN','This page request is not allowed.');
}
async function targetTab(tabId,expectedOrigin) {
  if (!Number.isInteger(tabId)) throw new CompanionError('TAB','Open the page where you want to fill a code.');
  const tab = await chrome.tabs.get(tabId), origin = siteOrigin(tab.url);
  if (!origin) throw new CompanionError('TAB','Code filling works on HTTPS pages.');
  if (expectedOrigin && expectedOrigin !== origin) throw new CompanionError('ORIGIN','Stranica se promijenila. Ponovno otvori ekstenziju.');
  return {tab,origin};
}
async function ensureContent(tabId) {
  try{const response=await chrome.tabs.sendMessage(tabId,{type:'companion:ping'},{frameId:0});if(response?.version===chrome.runtime.getManifest().version)return;}catch{}
  await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['content.js']});
}
async function performBinding(request) {
  const state=await requireUnlocked(true),{origin,tab}=await targetTab(request.tabId,request.expectedOrigin);
  if(!state.data.records.some(record=>record.id===request.id && record.supported))throw new CompanionError('ACCOUNT','This account is not available for filling.');
  const url=new URL(origin),pattern=`${url.protocol}//${url.hostname}/*`;
  if(!await chrome.permissions.contains({origins:[pattern]}))throw new CompanionError('PERMISSION','Grant access to this site first.');
  const {bindings={},siteFavicons={}}=await chrome.storage.local.get(['bindings','siteFavicons']);
  const automatic=matchingRecords(state.data.records,origin,{}).map(record=>record.id);
  bindings[origin]=[...new Set([...(bindings[origin] || automatic),request.id])];
  const favicon=safeFaviconUrl(tab.favIconUrl);if(favicon)siteFavicons[origin]=favicon;
  await chrome.storage.local.set({bindings,siteFavicons});await registerScripts();
  await targetTab(tab.id,origin);await ensureContent(tab.id);await targetTab(tab.id,origin);
  await chrome.tabs.sendMessage(tab.id,{type:'companion:refresh',origin,info:{locked:false,known:true,accounts:matchingRecords(state.data.records,origin,bindings).filter(record=>record.supported).map(metadata)}},{frameId:0});
  await notifyTabs(tab.id);return {origin};
}
async function completePendingBinding(key) {
  const {pendingBinding}=await chrome.storage.session.get('pendingBinding');
  if(!pendingBinding || (key && pendingBinding.key!==key))return {};
  if(Date.now()-pendingBinding.createdAt>120000){await chrome.storage.session.remove('pendingBinding');return {};}
  const url=new URL(pendingBinding.expectedOrigin),pattern=`${url.protocol}//${url.hostname}/*`;
  if(!await chrome.permissions.contains({origins:[pattern]}))return {pending:true};
  try{return await performBinding(pendingBinding);}finally{await chrome.storage.session.remove('pendingBinding');}
}
async function handleUI(message) {
  if (message.op === 'status') {try {await tryFinishGoogleLogin();} catch {} return status();}
  if (message.op === 'createVault') {
    if ((await chrome.storage.local.get('vault')).vault) throw new CompanionError('VAULT','A local vault already exists.');
    if (typeof message.password !== 'string' || message.password.length < 8) throw new CompanionError('PASSWORD','Choose a password with at least 8 characters.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await passwordKey(message.password,salt);
    const data = {session:null,records:[],lastSync:null};
    await chrome.storage.local.set({vault:await encryptVault(data,key,salt)});
    await chrome.storage.session.set({unlocked:{key:toBase64(key),data,expiresAt:Date.now()+UNLOCK_MS}});
    return status();
  }
  if (message.op === 'unlock') {
    const {vault} = await chrome.storage.local.get('vault');
    if (!vault) throw new CompanionError('VAULT','Prvo postavi lokalnu pohranu.');
    const key = await passwordKey(String(message.password || ''),fromBase64(vault.salt)), data = await decryptVault(vault,key);
    await chrome.storage.session.set({unlocked:{key:toBase64(key),data,expiresAt:Date.now()+UNLOCK_MS}});
    await notifyTabs(); return status();
  }
  if (message.op === 'lock') {await chrome.storage.session.remove(['unlocked','pendingGoogle','pendingBinding']);await notifyTabs();return status();}
  if (message.op === 'connect') {
    await requireUnlocked(true);
    const cookie = await chrome.cookies.get({url:'https://accounts.google.com/',name:'oauth_token'});
    const tab = await chrome.tabs.create({url:'https://accounts.google.com/EmbeddedSetup',active:true});
    await chrome.storage.session.set({pendingGoogle:{tabId:tab.id,started:Date.now(),oldHash:await tokenHash(cookie?.value)}});
    await chrome.storage.local.remove('lastError'); return {};
  }
  if (message.op === 'finishConnect') {
    const email = String(message.email || '').trim();
    if (email && (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new CompanionError('EMAIL','Enter the email address selected during Google sign-in.');
    await tryFinishGoogleLogin(true,email);return status();
  }
  if (message.op === 'sync') {await requireUnlocked(true);await synchronize();await notifyTabs();return status();}
  if (message.op === 'code') {
    const state = await requireUnlocked(true), record = state.data.records.find(r=>r.id===message.id);
    if (!record) throw new CompanionError('ACCOUNT','Account not found.');
    return recordCode(record);
  }
  if (message.op === 'codes') {
    // Automatic display refresh must not keep an idle vault unlocked.
    const state=await requireUnlocked();
    const codes=await Promise.all(state.data.records.filter(record=>record.supported).map(async record=>({id:record.id,...await recordCode(record)})));
    return {codes};
  }
  if (message.op === 'siteMatches') {
    const {origin} = await targetTab(message.tabId), state = await requireUnlocked();
    const {bindings={}} = await chrome.storage.local.get('bindings');
    return {origin,accounts:matchingRecords(state.data.records,origin,bindings).map(metadata)};
  }
  if (message.op === 'prepareBind') {
    const state=await requireUnlocked(true),{origin}=await targetTab(message.tabId,message.expectedOrigin);
    if(typeof message.key!=='string' || message.key.length>80 || !state.data.records.some(record=>record.id===message.id && record.supported))throw new CompanionError('ACCOUNT','This account is not available for linking.');
    await chrome.storage.session.set({pendingBinding:{key:message.key,id:message.id,tabId:message.tabId,expectedOrigin:origin,createdAt:Date.now()}});
    return completePendingBinding(message.key);
  }
  if (message.op === 'finishBind') return completePendingBinding(message.key);
  if (message.op === 'cancelBind') {const {pendingBinding}=await chrome.storage.session.get('pendingBinding');if(pendingBinding?.key===message.key)await chrome.storage.session.remove('pendingBinding');return {};}
  if (message.op === 'bind') return performBinding(message);
  if (message.op === 'fill') {
    const state = await requireUnlocked(true), {origin,tab} = await targetTab(message.tabId,message.expectedOrigin);
    const {bindings={}} = await chrome.storage.local.get('bindings');
    const record = matchingRecords(state.data.records,origin,bindings).find(r=>r.id===message.id && r.supported);
    if (!record) throw new CompanionError('ORIGIN','Link the account to this site first.');
    await ensureContent(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id,{type:'companion:fill',...await recordCode(record)},{frameId:0});
    if (!result?.filled) throw new CompanionError('FIELD','No verification code field was found. You can copy the code instead.');
    return {};
  }
  if (message.op === 'permissionsChanged') {await registerScripts();await notifyTabs();return status();}
  if (message.op === 'removeBinding') {
    const {bindings={}} = await chrome.storage.local.get('bindings');
    delete bindings[message.origin]; await chrome.storage.local.set({bindings}); await notifyTabs();return status();
  }
  throw new CompanionError('MESSAGE','Unknown action.');
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (!message || typeof message !== 'object' || typeof message.op !== 'string') return;
  enqueue(() => trustedUI(sender) ? handleUI(message) : handleSite(message,sender))
    .then(data=>respond({ok:true,data}),error=>respond({ok:false,error:safeError(error)}));
  return true;
});
chrome.cookies.onChanged.addListener(change => {
  if (!change.removed && change.cookie.name === 'oauth_token' && change.cookie.domain.endsWith('google.com')) enqueue(()=>tryFinishGoogleLogin()).catch(()=>{});
});
chrome.tabs.onUpdated.addListener((tabId,change) => {
  if (change.url?.startsWith('https://accounts.google.com/')) enqueue(()=>tryFinishGoogleLogin()).catch(()=>{});
});
chrome.permissions.onAdded.addListener(()=>enqueue(async()=>{await registerScripts();await completePendingBinding();}).catch(()=>{}));
chrome.permissions.onRemoved.addListener(()=>enqueue(registerScripts).catch(()=>{}));
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'maintenance') return;
  enqueue(async()=>{
    const state = await unlockState();
    if (state?.data.session && Date.now()-(state.data.lastSync || 0)>5*60*1000) {try {await synchronize();} catch {}}
  }).catch(()=>{});
});
