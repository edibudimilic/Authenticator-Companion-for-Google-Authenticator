# Security

This extension handles authentication secrets. Inspect the source before installing and use a separate vault password. No independent security audit has been completed. The Google integration is unofficial and can stop working.

Do not include real OTP seeds, Google tokens, passwords or private screenshots in public reports. Use synthetic data for reproduction. For sensitive reports, contact the maintainer through the repository owner's GitHub profile before disclosing details publicly.

The extension never needs access to your Google password outside Google's sign-in page. The internal Google master token is sensitive and is stored inside the encrypted vault. Website matching uses exact origins/known hostnames, and content scripts cannot request the full vault.
