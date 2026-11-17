# Chrome Web Store submission

The public GitHub release is available independently of the Chrome Web Store. A Store listing is not live until Google approves a submitted item and it is published.

## Submission status

Version 1.0.0 is **Published – public**, confirmed by the publisher dashboard screenshot on 17 November 2026. It is distributed publicly and free of charge. The website has been updated to remove its pending-review notice and link installation and footer actions to the published item.

Store: https://chromewebstore.google.com/detail/bmajakgokepceocggcfemcepnjkknpoi

Chrome Web Store item ID: `bmajakgokepceocggcfemcepnjkknpoi`.

## Reproducing the submission

1. Open the Chrome Web Store Developer Dashboard and sign in with the intended publisher account. Complete developer registration yourself if required.
2. Download `Authenticator-Companion-WebStore.zip` from this repository's GitHub release, or run `python scripts/package.py` to build it. The ZIP contains `manifest.json` at its root and omits the development-only public manifest key. Runtime source code is unchanged.
3. Choose **Add new item** and upload the ZIP.
4. Use the exact name, description, source link and permission explanations from [listing.md](listing.md). Select the appropriate category and interface language (Croatian).
5. Upload `extension/icons/128.png` as the icon, `store/assets/screenshot-1280x800.jpg` as the first screenshot, `store/assets/promo-440x280.jpg` as the small promotional tile and `store/assets/marquee-1400x560.jpg` as the marquee. The screenshots use demonstration accounts, not personal account data. The older UI screenshot can remain as a second view.
6. Set the homepage to https://google-auth-for-chrome.exevio.com/ , support to https://google-auth-for-chrome.exevio.com/#faq and privacy policy to https://google-auth-for-chrome.exevio.com/privacy.html . Retain the public GitHub source link in the description.
7. Complete the privacy declarations accurately using [listing.md](listing.md), including authentication information. No developer backend or analytics does not mean the extension handles no data.
8. Choose public distribution and **Submit for review**, with automatic publication after approval if desired. Any publisher terms, account verification or registration payment must be completed by the publisher.

The unsupported Google API, requested permissions, name and visual identity are subject to Google's review. This repository and a disclaimer do not guarantee approval.
