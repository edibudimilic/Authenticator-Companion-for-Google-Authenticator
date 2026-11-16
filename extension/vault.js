import {toBase64,fromBase64,CompanionError} from './protocol.js';
const utf8 = new TextEncoder();
const AAD = utf8.encode('Authenticator Companion vault v1');
export const ITERATIONS = 600000;
export async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,256));
}
export async function encryptVault(value, rawKey, salt) {
  const key = await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},key,utf8.encode(JSON.stringify(value)));
  return {version:1,iterations:ITERATIONS,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(ciphertext))};
}
export async function decryptVault(envelope, rawKey) {
  if (envelope?.version !== 1 || envelope.iterations !== ITERATIONS) throw new CompanionError('VAULT', 'Nepodržana verzija šifrirane pohrane.');
  try {
    const key = await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);
    const value = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(envelope.iv),additionalData:AAD},key,fromBase64(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(value));
  } catch { throw new CompanionError('PASSWORD','Pogrešna lozinka ili oštećena lokalna pohrana.'); }
}
