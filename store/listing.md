# Chrome Web Store listing

## Name
Authenticator Companion for Google Authenticator™

## Summary
Unofficial open-source companion for Google Authenticator™. Sync accounts and fill 2FA codes. Not affiliated with Google.

## Description
Use your Google Authenticator accounts in Chrome. Connect your Google account, unlock your encrypted local vault, and select a matching account to fill its verification code. Cached codes are generated locally and also work offline.

Features include account search, copying codes, site favicons, expiry countdowns and single-field or split-field filling. Codes turn red during their final five seconds. Website access is optional and can be granted per site.

OPEN SOURCE / MANUAL INSTALLATION
Source: https://github.com/edibudimilic/Authenticator-Companion-for-Google-Authenticator
Prefer to inspect and run the code yourself? Download or clone the repository, enable Developer mode at chrome://extensions, choose Load unpacked, and select its extension folder. No build step is needed.

DISCLAIMER
This is an unofficial, independently developed extension. It is not affiliated with, endorsed by, sponsored by, or produced by Google LLC. Google Authenticator is a trademark of Google LLC. The integration uses an internal, unsupported Google service and may stop working after Google changes. No independent security audit has been performed.

Privacy policy: https://github.com/edibudimilic/Authenticator-Companion-for-Google-Authenticator/blob/main/PRIVACY.md

## Privacy declarations
Single purpose: Access and fill the user's time-based Authenticator verification codes.
Data handled: personally identifiable account information; authentication information; limited website content and origins necessary for code filling. Data is processed locally except Google authentication/sync requests, favicon requests and user-selected code insertion into a site. No sale, ads or analytics.

## Permission justifications
- storage: encrypted local vault, temporary unlocked session, site mappings and preferences.
- cookies: read only the oauth_token cookie during a user-started Google sign-in.
- activeTab: identify the page explicitly selected for linking or filling.
- scripting: detect and fill OTP fields on permitted pages.
- alarms: periodic sync while unlocked and session expiry handling.
- clipboardWrite: copy a code on user action.
- declarativeNetRequestWithHostAccess: add required protocol headers solely to this extension's exact Google authentication/read requests.
- Google host permissions: user-started authentication and reading synced Authenticator accounts.
- optional HTTPS and loopback host permissions: suggestions and user-approved site binding; loopback supports locally hosted sites.

## Reviewer instructions
The UI is currently in Croatian. Create a local password (8+ characters), connect a Google account with Authenticator cloud sync, and complete Google's sign-in steps. No real user test credentials are bundled. The internal Google sign-in can remain on Loading after consent; the extension completes the exchange and returns to its options after a successful read.
