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
- Team ID: `49J96Q3WQ3` (already in `project.yml`)
- Scheme: `NexaraApp`

Required GitHub Secrets (Repository → Settings → Secrets and variables → Actions):
- `APP_STORE_CONNECT_KEY_ID`: App Store Connect Key ID (e.g., ABCDE12345)
- `APP_STORE_CONNECT_ISSUER_ID`: Issuer ID from ASC
- `APP_STORE_CONNECT_PRIVATE_KEY`: Contents of the `.p8` file (paste full text)
- `CERTIFICATE_PRIVATE_KEY` (optional but recommended): PKCS#8 PEM private key (full PEM). Used if you also want to import a custom private key into the keychain; Xcode can still create signing assets with just the ASC API key.

Triggering the workflow:
- Manually: Actions → iOS TestFlight (Free GHA) → Run workflow.
- Or push a tag like `ios-testflight-<anything>`.

Notes:
- The workflow relies on Xcode’s automatic signing using the ASC API key (no interactive Apple ID logins).
- If you need explicit provisioning profile management, you can extend the job with Fastlane (`sigh`) using the same API key, but this base workflow should work for standard App Store distribution. 
