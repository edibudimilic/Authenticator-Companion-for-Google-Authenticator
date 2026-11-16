# Authenticator Companion

*for Google Authenticator™*

An independent, open-source Chrome extension that reads accounts synced to Google Authenticator and generates and fills time-based verification codes locally.

**Disclaimer:** This is an unofficial, independently developed project. It is not affiliated with, endorsed by, sponsored by, or produced by Google LLC. Google Authenticator is a trademark of Google LLC.

## Install manually from source

You do not need to trust a prebuilt download. Inspect this repository and load the extension directly:

1. Download this repository using **Code → Download ZIP**, or clone it.
2. Extract the files.
3. Open chrome://extensions in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the repository's **extension** directory.
5. Open the extension settings, create a local vault password (at least eight characters), and connect the same Google account used in Google Authenticator. Complete sign-in on Google's page.
6. Enable automatic suggestions or grant access to individual sites. For an unrecognized site, open the extension and select **Poveži sa stranicom** next to the account.

No server, npm installation, build step, or paid subscription is needed to use the extension. The current interface is in Croatian. [Croatian instructions](README.hr.md).

## Features

- Read Google Authenticator cloud accounts using an experimental, unofficial integration.
- Generate six-digit TOTP codes locally, including offline use of cached accounts.
- Suggest matching accounts and fill a single input or six separate digit inputs after a click.
- Search accounts, copy codes, show site favicons and countdowns. Codes turn red during the last five seconds.
- Encrypt the local credential vault using AES-256-GCM and PBKDF2-SHA-256 with 600,000 iterations.
- Lock the vault after 30 minutes without explicit use and when Chrome restarts. Passive code refresh does not extend the unlock period.

## Important limitations

Google does not provide a public supported API for this sync. This project uses an internal Android sign-in flow and Passbox service. Google can change or revoke access at any time. This project does not imply Google's permission or endorsement. Cached TOTP codes may continue working if sync stops.

The six-digit Passbox format was verified. Unverified formats are marked unsupported; HOTP counters, push approvals and passkeys are not implemented. Some login forms require copying the code manually. This software has not received an independent security audit.

## Privacy and permissions

Read the [privacy policy](PRIVACY.md) and [security notes](SECURITY.md). Google login is completed on Google's own site. Tokens are sent only to Google's authentication and Authenticator services. Favicons are fetched from the linked websites or their icon hosts. There is no developer-operated backend, telemetry or advertising.

Required permissions cover local/session storage, the Google login cookie, scheduled sync, clipboard copying, active-tab interaction, script injection and protocol headers restricted to this extension's Google requests. Optional website permissions enable suggestions only where granted.

## Development

Use Node.js 22 or later to run the tests:

    npm test

No third-party npm packages are required. Tests use synthetic accounts and public RFC test secrets. Real credentials and personal screenshots are not included.

## License and protocol references

[MIT](LICENSE). Protocol research: [google-passbox](https://github.com/poloputoamo/google-passbox) and [gpsoauth](https://github.com/simon-weber/gpsoauth). The implementation includes corrections verified against the service.
