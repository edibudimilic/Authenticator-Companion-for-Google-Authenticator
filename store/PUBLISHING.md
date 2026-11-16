# Chrome Web Store submission

The public GitHub release is available independently of the Chrome Web Store. A Store listing is not live until Google approves a submitted item and it is published.

## Submission status

Version 0.1.6 was submitted on 16 November 2026. The Developer Dashboard confirmed **Pending review**. Public, free distribution in all available regions and automatic publication after approval were selected. This is not yet confirmation of a live Store listing.

Chrome Web Store item ID: `bmajakgokepceocggcfemcepnjkknpoi`.

## Reproducing the submission

1. Open the Chrome Web Store Developer Dashboard and sign in with the intended publisher account. Complete developer registration yourself if required.
2. Download `Authenticator-Companion-WebStore.zip` from this repository's GitHub release, or run `python scripts/package.py` to build it. The ZIP contains `manifest.json` at its root and omits the development-only public manifest key. Runtime source code is unchanged.
3. Choose **Add new item** and upload the ZIP.
4. Use the exact name, description, source link and permission explanations from [listing.md](listing.md). Select the appropriate category and interface language (Croatian).
5. Upload `extension/icons/128.png` as the icon and `store/assets/screenshot-1280x800.png` as a screenshot. This screenshot uses demonstration accounts, not personal account data.
6. Set the homepage/source URL to https://github.com/edibudimilic/Authenticator-Companion-for-Google-Authenticator and privacy policy URL to https://github.com/edibudimilic/Authenticator-Companion-for-Google-Authenticator/blob/main/PRIVACY.md .
7. Complete the privacy declarations accurately using [listing.md](listing.md), including authentication information. No developer backend or analytics does not mean the extension handles no data.
8. Choose public distribution and **Submit for review**, with automatic publication after approval if desired. Any publisher terms, account verification or registration payment must be completed by the publisher.

The unsupported Google API, requested permissions, name and visual identity are subject to Google's review. This repository and a disclaimer do not guarantee approval.
