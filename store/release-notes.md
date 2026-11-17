# Authenticator Companion 1.0.1

- Remove the email field before Google sign-in. Try to resolve the account from the sign-in token first, with a manual-email fallback only after an unsuccessful identity exchange.
- Bind fallback retries to the same Google login cookie and expire them after 15 minutes.
- Translate the popup, settings, website suggestions and error messages to English.
- Preserve existing vault format, accounts and settings; no new permissions.
- 27 automated tests pass, covering automatic identity exchange, fallback, stale cookies and network failures. Real Google sign-in for the new no-email attempt has not yet been verified; the existing explicit-email exchange is retained as fallback.

Independent and unofficial; not affiliated with or endorsed by Google LLC. Google Authenticator is a trademark of Google LLC. The internal Google integration is unsupported and has not received an independent security audit.
