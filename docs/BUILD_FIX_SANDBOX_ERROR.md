# Fix: Sandbox Error When Building to Device

## Error
```
❌  error: Sandbox: bash(18519) deny(1) file-write-create .../DeepHorizonSecurity.app/ip.txt
```

## Solution: Build from Xcode Directly

The sandbox error occurs when building from command line. Building from Xcode directly usually resolves this.

### Steps:

1. **Open Xcode** (should already be open with the project)

2. **Select Your iPhone** as the build target:
   - At the top of Xcode, next to the play button
   - Select your connected iPhone: "SIDXBOI Iphone (18.6.2)"

3. **Build and Run**:
   - Click the **Play button** (▶️) in Xcode
   - Or press `Cmd + R`

4. **If you see code signing errors**:
   - Go to **Signing & Capabilities** tab
   - Ensure "Automatically manage signing" is checked
   - Select your Development Team
   - Xcode will automatically create certificates and provisioning profiles

5. **Trust the Developer Certificate** (first time only):
   - On your iPhone: **Settings → General → VPN & Device Management**
   - Find your developer certificate
   - Tap it and tap **"Trust"**

## Alternative: Use EAS Build

If Xcode build still fails, use EAS Build which handles these issues:

```bash
cd Deephorizon-security
eas build --platform ios --profile development --local
```

## Why This Happens

- Command line builds have stricter sandbox permissions
- Xcode builds have more permissions for build scripts
- The `ip.txt` file is created by React Native's build script for Metro bundler connection
- Xcode's build environment allows this, command line doesn't always

## Quick Fix Summary

✅ **Best Solution**: Build from Xcode (Play button)  
✅ **Alternative**: Use EAS Build  
❌ **Avoid**: Command line `npx expo run:ios --device` (has sandbox issues)
