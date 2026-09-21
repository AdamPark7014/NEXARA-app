# iOS TestFlight via GitHub Actions (Free path)

This repo includes a GitHub Actions workflow to archive, sign, and upload the iOS app to TestFlight without requiring a paid Codemagic Team plan.

Workflow: `.github/workflows/ios-testflight.yml`

How it works (high‑level):
- Runs on `macos-14`, checks out the repo.
- Installs XcodeGen and generates the Xcode project from `apps/mobile-native/ios/project.yml`.
- Uses Xcode automatic signing with App Store Connect API key, passing:
  - `-allowProvisioningUpdates`
  - `-authenticationKeyPath`, `-authenticationKeyID`, `-authenticationKeyIssuerID`
- Archives in Release and exports an App Store IPA.
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
- Manual signing for free path (recommended, avoids ASC auto-signing pitfalls):
  - `BUILD_CERTIFICATE_BASE64`: Distribution certificate as base64-encoded .p12
  - `P12_PASSWORD`: Password for the .p12
  - `BUILD_PROVISION_PROFILE_BASE64`: Base64-encoded App Store provisioning profile (`.mobileprovision`)

Triggering the workflow:
- Manually: Actions → iOS TestFlight (Free GHA) → Run workflow.
- Or push a tag like `ios-testflight-<anything>`.

Notes:
- This workflow uses manual signing: imports a `.p12` into a temporary keychain and installs a `.mobileprovision`, then archives with `CODE_SIGN_STYLE=Manual`, `PROVISIONING_PROFILE_SPECIFIER="NEXARA App Store"`, `DEVELOPMENT_TEAM=AHNW9K8745`.
- Upload to TestFlight is done via `xcrun iTMSTransporter` using the ASC API key (no interactive Apple ID login).
