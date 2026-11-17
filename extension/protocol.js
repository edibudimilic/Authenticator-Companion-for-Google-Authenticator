const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', {fatal:true});
export class CompanionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const toBase64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
export const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export function concat(...arrays) {
  const output = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) { output.set(array, offset); offset += array.length; }
  return output;
}
function varint(value) {
  value = BigInt(value); const result = [];
  do { const byte = Number(value & 127n); value >>= 7n; result.push(byte | (value ? 128 : 0)); } while (value);
  return Uint8Array.from(result);
}
export function stringField(number, value) {
  const bytes = utf8.encode(value);
  return concat(varint(number * 8 + 2), varint(bytes.length), bytes);
}
export function decodeFields(bytes) {
  let offset = 0; const fields = [];
  const readVarint = () => {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (offset >= bytes.length) throw new CompanionError('PROTOBUF', 'Google returned an incomplete record.');
      const byte = bytes[offset++]; value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return value;
    }
    throw new CompanionError('PROTOBUF', 'Unsupported Google response format.');
  };
  while (offset < bytes.length) {
    const tag = Number(readVarint()), number = tag >>> 3, wire = tag & 7;
    if (!number) throw new CompanionError('PROTOBUF', 'Invalid Google response.');
    let value;
    if (wire === 0) value = readVarint();
    else {
      const length = wire === 2 ? Number(readVarint()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
      if (!Number.isSafeInteger(length) || length < 0 || length > bytes.length - offset) throw new CompanionError('PROTOBUF', 'Unsupported Google response format.');
      value = bytes.slice(offset, offset + length); offset += length;
    }
    fields.push({number, wire, value});
    if (fields.length > 100000) throw new CompanionError('PROTOBUF', 'The Google response is too large.');
  }
  return fields;
}
const bytesField = (fields, number) => fields.find(field => field.number === number && field.wire === 2)?.value;
const numberField = (fields, number) => Number(fields.find(field => field.number === number && field.wire === 0)?.value ?? 0n);
export function grpcFrame(message) {
  const prefix = new Uint8Array(5); new DataView(prefix.buffer).setUint32(1, message.length);
  return concat(prefix, message);
}
export function decodeGrpcFrames(bytes) {
  if (bytes.length < 5) throw new CompanionError('GRPC', 'Google rejected the account request. Try again or sign in to Google again.');
  const messages = []; let offset = 0;
  while (offset < bytes.length) {
    if (offset + 5 > bytes.length) throw new CompanionError('GRPC', 'Incomplete sync response.');
    const flag = bytes[offset], length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0);
    offset += 5;
    if (length > bytes.length - offset) throw new CompanionError('GRPC', 'Incomplete sync response.');
    const body = bytes.slice(offset, offset + length); offset += length;
    if (flag === 128) {
      const status = text.decode(body).match(/grpc-status:\s*(\d+)/i)?.[1];
      if (status && status !== '0') throw new CompanionError('GRPC', `Google rejected sync (status ${status}).`);
    } else if (flag === 0) messages.push(body);
    else throw new CompanionError('GRPC', 'Google changed the sync format.');
  }
  if (!messages.length) throw new CompanionError('GRPC', 'Google did not return an account response.');
  return messages;
}
export function decodeListResponse(bytes) {
  const records = []; let nextPage = '';
  for (const message of decodeGrpcFrames(bytes)) {
    const fields = decodeFields(message);
    nextPage = bytesField(fields, 2) ? text.decode(bytesField(fields, 2)) : '';
    for (const item of fields.filter(field => field.number === 1 && field.wire === 2)) {
      const credential = decodeFields(item.value);
      const payload = bytesField(credential, 2);
      const otpData = payload && bytesField(decodeFields(payload), 1);
      if (!otpData) throw new CompanionError('CREDENTIAL', 'Google changed the Authenticator record format.');
      const otp = decodeFields(otpData), secret = bytesField(otp, 1), resource = bytesField(credential, 1);
      if (!secret?.length || !resource?.length) throw new CompanionError('CREDENTIAL', 'This record has no key for generating codes.');
      const record = {
        id:text.decode(resource), secret:toBase64(secret),
        issuer:bytesField(otp, 3) ? text.decode(bytesField(otp, 3)) : '',
        account:bytesField(otp, 2) ? text.decode(bytesField(otp, 2)) : '',
        type:numberField(otp,4), algorithm:numberField(otp,5), digitEnum:numberField(otp,6),
      };
      record.supported = record.type === 1 && [1,2,3].includes(record.algorithm) && record.digitEnum === 2;
      records.push(record);
    }
  }
  return {records, nextPage};
}
export async function totp(secret, seconds = Date.now() / 1000, digits = 6, algorithm = 'SHA-1') {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(seconds / 30)));
  const key = await crypto.subtle.importKey('raw', secret, {name:'HMAC', hash:algorithm}, false, ['sign']);
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = hash[hash.length - 1] & 15;
  const binary = new DataView(hash.buffer).getUint32(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}
export async function recordCode(record) {
  // The live Passbox schema uses enum 2 for six digits. Other digit enums
  // have not been verified and must not silently generate incorrect codes.
  if (!record.supported) throw new CompanionError('UNSUPPORTED', 'This type of 2FA record is not supported yet.');
  const algorithm = {1:'SHA-1',2:'SHA-256',3:'SHA-512'}[record.algorithm];
  for (let attempt=0; attempt<3; attempt++) {
    const now = Date.now(), counter = Math.floor(now/30000);
    const code = await totp(fromBase64(record.secret), now/1000, 6, algorithm);
    if (Math.floor(Date.now()/30000) === counter) return {code,expiresAt:(counter+1)*30000};
  }
  throw new CompanionError('CLOCK','Check your computer clock and try again.');
}
