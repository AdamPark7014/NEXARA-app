# iOS TestFlight via GitHub Actions (Free path)

This repo includes a GitHub Actions workflow to archive, sign, and upload the iOS app to TestFlight without requiring a paid Codemagic Team plan.

Workflow: `.github/workflows/ios-testflight.yml`

How it works (high‑level):
- Runs on `macos-15`, checks out the repo.
- Installs XcodeGen and generates the Xcode project from `apps/mobile-native/ios/project.yml`.
- Uses manual signing: builds a macOS‑compatible `.p12` on the runner from your PEM private key + Apple `.cer`, installs the App Store `.mobileprovision` (by UUID), then archives with `CODE_SIGN_STYLE=Manual`.
- Uploads the IPA to TestFlight using `xcrun iTMSTransporter` with API key.
- Does NOT submit for App Review.

Project settings:
- Bundle ID: `mx.nexara.mobile.NexaraApp`
- Team ID: `AHNW9K8745` (already in `project.yml`)
- Scheme: `NexaraApp`

Required GitHub Secrets (Repository → Settings → Secrets and variables → Actions):
- `APP_STORE_CONNECT_KEY_ID`: App Store Connect Key ID (e.g., ABCDE12345)
- `APP_STORE_CONNECT_ISSUER_ID`: Issuer ID from ASC
- `APP_STORE_CONNECT_PRIVATE_KEY`: Contents of the `.p8` file (paste full text)
- Manual signing (preferred; avoids p12 compatibility issues):
  - `CERTIFICATE_PRIVATE_KEY`: Distribution private key in PEM (PKCS#8)
  - `DISTRIBUTION_CERT_CER_BASE64`: Base64 of the Apple iOS Distribution `.cer` (DER)
  - `BUILD_PROVISION_PROFILE_BASE64`: Base64 of the App Store provisioning profile (`.mobileprovision`)
- Optional fallback (if you prefer to upload a .p12 directly):
  - `BUILD_CERTIFICATE_BASE64`: Base64 `.p12`
  - `P12_PASSWORD`: Password for `.p12`

Triggering the workflow:
- Manually: Actions → iOS TestFlight (Free GHA) → Run workflow.
- Or push a tag like `ios-testflight-<anything>`.

Notes:
- The workflow builds a `.p12` on the runner with OpenSSL using legacy‑compatible algorithms to avoid “MAC verification failed” during `security import` on macOS.
- Archives with `CODE_SIGN_STYLE=Manual`, `PROVISIONING_PROFILE_SPECIFIER="NEXARA App Store"`, `DEVELOPMENT_TEAM=AHNW9K8745`.
- Upload to TestFlight is done via `xcrun iTMSTransporter` using the ASC API key (no interactive Apple ID login).
