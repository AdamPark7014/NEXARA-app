# Android USB debug and ADB authorization

Use this checklist when ADB does not detect your phone or shows it as unauthorized.

## 1) Enable developer options

1. Open Settings > About phone > Software information.
2. Tap Build number 7 times.
3. Enter your phone PIN if requested.

## 2) Enable USB debugging

1. Open Settings > Developer options.
2. Enable USB debugging.
3. Optional but recommended: enable Install via USB.

## 3) Authorize this computer

1. Connect the phone with a data USB cable.
2. On the phone, set USB mode to File transfer (MTP).
3. Accept the prompt: Allow USB debugging.
4. Enable Always allow from this computer.
5. Tap Allow.

## 4) Verify connection on Windows

Run:

```powershell
adb devices -l
```

Expected status is device.

- If unauthorized: revoke USB debugging authorizations on phone and reconnect.
- If offline: disconnect/reconnect cable and run adb kill-server ; adb start-server.
- If empty: change cable/USB port and verify adb is installed.

## 5) Install APK with project script

From repo root:

```powershell
npm run apk:install
```

Or rebuild + install:

```powershell
npm run apk:build-install
```
