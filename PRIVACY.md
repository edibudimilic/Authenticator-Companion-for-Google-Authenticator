# Privacy policy

Effective date: 16 November 2026

Project: Authenticator Companion for Google Authenticator™
Maintainer: edibudimilic (https://github.com/edibudimilic/Authenticator-Companion-for-Google-Authenticator)

## Data handled

The extension processes Google account identifiers and email, a temporary Google login cookie, authentication tokens, OTP account names and secret keys, generated one-time codes, linked website origins and favicon URLs. It inspects input-field attributes on permitted pages to offer code filling. It does not collect browsing history unrelated to these features.

## Where data goes

Sign-in uses accounts.google.com. The login cookie is exchanged with android.clients.google.com for a token; the token is used with passbox-pa.googleapis.com to read your Authenticator accounts. This is an unofficial internal integration. Site icons may be requested from linked websites or the icon hosts supplied by those sites. Requests for icons do not contain OTP keys or generated codes. When you choose to fill a code, it is inserted into the selected website's form; copying places it in your system clipboard.

The maintainer does not operate a backend for this extension, receive your credentials, sell user data, or run advertising or analytics. Google and linked sites handle requests according to their own policies.

## Local storage and retention

The persisted credential vault is encrypted using AES-256-GCM with a password-derived key (PBKDF2-SHA-256, 600,000 iterations). Decrypted data and the encryption key are temporarily kept in Chrome session storage restricted to trusted extension contexts. The vault locks after 30 minutes without explicit use and when the extension/browser session ends. Website bindings, icon URLs, account counts and sync status are stored separately as ordinary local extension settings. Chrome storage sync is not used.

## Your choices

You can lock the vault, grant or revoke website permissions, remove site bindings, or uninstall the extension to remove its local storage. Uninstalling does not delete accounts stored in Google Authenticator or revoke Google-side tokens. Manage Google account access through Google's security settings. A forgotten vault password cannot be recovered by the maintainer.

## Disclosure and contact

Only data required for the stated authentication features is used. Do not post keys, tokens, QR exports, live codes or account screenshots in public issues. Contact the maintainer through the GitHub profile linked by this repository. Policy changes will be committed here.
