# Quick Fix: Build to Device from Xcode

## Problem
EAS local build fails with sandbox error when trying to write `ip.txt` file.

## Solution: Build from Xcode (Takes 2 minutes)

### Step 1: Open Xcode
```bash
cd /Users/deephorizon/development/Deephorizon_ios/Deephorizon-security
open ios/DeepHorizonSecurity.xcworkspace
```

### Step 2: In Xcode
1. **Select your iPhone** at the top (next to Play button)
   - Choose: "SIDXBOI Iphone"

2. **Click the Play button** (▶️) or press `Cmd + R`

3. **Wait for build** - Xcode will:
   - Build the app
   - Install on your device
   - Launch automatically

### Step 3: Trust Certificate (First Time Only)
If you see a "Untrusted Developer" message on your iPhone:
- **Settings → General → VPN & Device Management**
- Find your developer certificate
- Tap **"Trust"**

## Why This Works
- Xcode builds have more permissions than command-line builds
- The sandbox allows Xcode to write `ip.txt` file
- EAS local builds use `xcodebuild` which has stricter permissions

## After Building
Once the app is installed on your device:
1. Open the app
2. Navigate to Subscription Plans
3. Select a plan
4. Tap "Subscribe"
5. Sign in with **Sandbox tester account** when prompted
6. Test the StoreKit purchase flow

## Alternative: Use EAS Cloud Build
If you prefer cloud builds (no sandbox issues):
```bash
eas build --platform ios --profile development
```
This builds on EAS servers (no local sandbox restrictions).
