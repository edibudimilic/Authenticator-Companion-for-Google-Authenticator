import {CompanionError, concat, stringField, grpcFrame, decodeListResponse} from './protocol.js';
const CERT = '38918a453d07199354f8b19af05ec6562ced5788';
const APP = 'com.google.android.apps.authenticator2';
const ENDPOINT = 'https://android.clients.google.com/auth';
const LIST = 'https://passbox-pa.googleapis.com/google.internal.identity.passbox.passbox.v1.PassboxExternalService/ListCredentials';
async function request(url, options) {
  try { return await fetch(url, {...options, credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(20000)}); }
  catch { throw new CompanionError('NETWORK', 'Google trenutačno nije dostupan. Spremljeni kodovi i dalje rade.'); }
}
async function auth(fields) {
  const response = await request(ENDPOINT, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(fields).toString()});
  const body = await response.text();
  if (body.length > 1024*1024) throw new CompanionError('AUTH', 'Neočekivan odgovor pri Googleovoj prijavi.');
  const values = Object.fromEntries(body.split('\n').filter(line => line.includes('=')).map(line => {const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).trim()];}));
  if (!response.ok || values.Error) {
    const code = ['BadAuthentication','NeedsBrowser','MissingDroidguard','ServiceDisabled'].includes(values.Error) ? values.Error : 'AUTH';
    const message = code === 'BadAuthentication' || code === 'NeedsBrowser' ? 'Potrebna je ponovna Googleova prijava.' : `Google je odbio neslužbenu prijavu (${code}).`;
    throw new CompanionError(code, message);
  }
  return values;
}
export async function exchangeLogin(oauthToken, email) {
  const androidId = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2,'0')).join('');
  const values = await auth({Token:oauthToken, Email:email, accountType:'HOSTED_OR_GOOGLE', has_permission:'1', source:'android', androidId,
    app:'com.google.android.gms', client_sig:CERT, callerSig:CERT, device_country:'us', lang:'en', sdk_version:'28', service:'ac2dm',
    get_accountid:'1', ACCESS_TOKEN:'1', add_account:'1', google_play_services_version:'240913000', droidguard_results:'dummy123'});
  if (!values.Token || !values.Email || !/^\d+$/.test(values.accountId || '')) throw new CompanionError('AUTH', 'Google nije vratio podatke potrebne za povezivanje.');
  return {masterToken:values.Token, email:values.Email, accountId:values.accountId, androidId};
}
export async function refreshAccess(session) {
  const values = await auth({accountType:'HOSTED_OR_GOOGLE', Email:session.email, EncryptedPasswd:session.masterToken, has_permission:'1', source:'android',
    androidId:session.androidId, app:APP, client_sig:CERT, callerPkg:APP, device_country:'us', lang:'en', sdk_version:'28', service:'oauth2:https://www.googleapis.com/auth/passbox.credential'});
  if (!values.Auth) throw new CompanionError('AUTH', 'Google nije odobrio pristup Authenticatoru.');
  return values.Auth;
}
export async function fetchRecords(session) {
  const token = await refreshAccess(session), records = [];
  const parent = `internalservices/GOOGLE_AUTHENTICATOR/owneridnamespaces/GOOGLE_USER_ID/ownerids/${session.accountId}/externalservices/-`;
  let pageToken = ''; const seenPages = new Set();
  for (let page=0; page<20; page++) {
    const requestMessage = concat(stringField(1,parent), ...(pageToken ? [stringField(3,pageToken)] : []));
    const response = await request(LIST, {method:'POST', headers:{'Content-Type':'application/grpc', 'grpc-accept-encoding':'identity',
      'x-android-package':APP, 'x-android-cert':CERT, Authorization:`Bearer ${token}`}, body:grpcFrame(requestMessage)});
    const status = response.headers.get('grpc-status');
    if (!response.ok || (status !== null && status !== '0')) throw new CompanionError('SYNC', 'Google je odbio dohvat Authenticator zapisa.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 16*1024*1024) throw new CompanionError('SYNC', 'Googleov odgovor je prevelik.');
    const decoded = decodeListResponse(bytes); records.push(...decoded.records); pageToken = decoded.nextPage;
    if (!pageToken) return [...new Map(records.map(record => [record.id,record])).values()];
    if (seenPages.has(pageToken)) break;
    seenPages.add(pageToken);
  }
  throw new CompanionError('SYNC', 'Nije moguće dohvatiti cijeli popis računa.');
}
