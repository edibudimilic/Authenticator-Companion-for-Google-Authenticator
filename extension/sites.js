const HOSTS = {
  github:['github.com'], google:['accounts.google.com'], cloudflare:['dash.cloudflare.com'],
  digitalocean:['cloud.digitalocean.com'], hetzner:['accounts.hetzner.com','console.hetzner.cloud'],
  namecheap:['www.namecheap.com','ap.www.namecheap.com'], gitlab:['gitlab.com'],
  bookingcom:['account.booking.com','admin.booking.com'], discord:['discord.com'],
  notion:['www.notion.so','www.notion.com'], amazon:['www.amazon.com','www.amazon.de'],
  linkedin:['www.linkedin.com'], dropbox:['www.dropbox.com'], paypal:['www.paypal.com'],
  microsoft:['login.live.com','login.microsoftonline.com'], openai:['auth.openai.com'],
};
export function siteOrigin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1','localhost'].includes(parsed.hostname))) return null;
    return parsed.origin;
  } catch {return null;}
}
export function matchingRecords(records, origin, bindings = {}) {
  if (!siteOrigin(origin)) return [];
  const host = new URL(origin).hostname;
  const explicit = bindings[origin];
  if (Array.isArray(explicit)) return records.filter(record => explicit.includes(record.id));
  return records.filter(record => {
    const issuer = record.issuer.trim(), normalized = issuer.toLowerCase().replace(/[^a-z0-9]/g,'');
    if (HOSTS[normalized]?.includes(host)) return true;
    // Domain labels must match exactly; substring matches could leak a code
    // to lookalike domains such as github.com.attacker.example.
    if (/^(https:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\/?$/i.test(issuer)) {
      try {return new URL(issuer.startsWith('https://') ? issuer : `https://${issuer}`).hostname === host;} catch {}
    }
    return false;
  });
}
export const metadata = record => ({id:record.id,issuer:record.issuer,account:record.account,supported:record.supported});

export function accountOrigin(record,bindings={},activeUrl='') {
  const explicit=Object.keys(bindings).filter(origin=>siteOrigin(origin) && Array.isArray(bindings[origin]) && bindings[origin].includes(record.id));
  const active=siteOrigin(activeUrl);
  if(active && explicit.includes(active))return active;
  const remote=explicit.find(origin=>origin.startsWith('https:'));if(remote)return remote;
  const issuer=record.issuer.trim(),key=issuer.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(HOSTS[key]?.length)return `https://${HOSTS[key][0]}`;
  if(explicit.length)return explicit[0];
  if(/^(https:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\/?$/i.test(issuer))return siteOrigin(issuer.startsWith('https://')?issuer:`https://${issuer}`);
  return null;
}
export function safeFaviconUrl(value) {
  if(typeof value!=='string' || value.length>100000)return null;
  if(/^data:image\/(png|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i.test(value))return value;
  try{const url=new URL(value);if(url.username || url.password)return null;if(url.protocol==='https:' || (url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname)))return url.href;}catch{}
  return null;
}
