# StoreKit Preflight "SKU Not Found" Fix

## Issue
The preflight check is returning 0 products, causing "SKU not found" error:
```
[iOS Purchase] Preflight response: []
[iOS Purchase] Filtered subscription products: 0
[iOS Purchase] ❌ SKU not found via StoreKit preflight
```

## ✅ Fixed Issues

1. **StoreKit Configuration File Path** - Fixed in Xcode scheme
   - Changed from `../DeepHorizonSecurity.storekit` to `../../../DeepHorizonSecurity.storekit`
   - Path is now relative to scheme location: `ios/DeepHorizonSecurity.xcodeproj/xcshareddata/xcschemes/`
   - Correct path: `../../../DeepHorizonSecurity.storekit` → `ios/DeepHorizonSecurity.storekit`
   - This ensures the StoreKit config file is properly referenced

## 🔍 Root Cause Analysis

The preflight check fails when:
1. **On Simulator**: StoreKit config file not properly configured in scheme
2. **On Real Device**: Products not available in sandbox environment

## ✅ Solutions

### Solution 1: For Simulator Testing (StoreKit Configuration)

The StoreKit configuration file path has been fixed. To use it:

1. **Open Xcode**:
   ```bash
   open ios/DeepHorizonSecurity.xcworkspace
   ```

2. **Verify StoreKit Config in Scheme**:
   - Click on the scheme dropdown (next to Play button)
   - Select "Edit Scheme..."
   - Go to "Run" → "Options"
   - Verify "StoreKit Configuration" shows: `DeepHorizonSecurity.storekit`
   - If not, click the dropdown and select it

3. **Build and Run**:
   - Select iOS Simulator (iOS 17.0+)
   - Press Cmd+R to build and run
   - The StoreKit config file will be used

### Solution 2: For Real Device Testing (Sandbox Environment)

On real devices, StoreKit configuration files are **NOT used**. You need:

1. **Products in App Store Connect**:
   - All 4 products must be "Ready to Submit" ✅
   - Products must be in subscription group `21880668`
   - Products must have pricing set

2. **Sandbox Tester Account**:
   - Go to App Store Connect → Users and Access → Sandbox Testers
   - Create a sandbox tester (different email than your Apple ID)
   - Sign out of App Store on your device (Settings → App Store → Sign Out)

3. **Test Purchase Flow**:
   - Run app on real device
   - Navigate to subscription plans
   - Select a plan and tap "Subscribe"
   - When prompted, sign in with **sandbox tester account**
   - Complete purchase

### Solution 3: Improve Error Handling

The code already handles this gracefully - it continues to attempt purchase even if preflight fails. However, we can improve the logging:

## 📋 Verification Checklist

### For Simulator:
- [x] StoreKit config file path fixed in scheme
- [ ] StoreKit config file selected in Xcode scheme
- [ ] All 4 products exist in StoreKit config file
- [ ] Product IDs match exactly

### For Real Device:
- [ ] Products created in App Store Connect
- [ ] Products show "Ready to Submit"
- [ ] Sandbox tester account created
- [ ] Signed out of App Store on device
- [ ] Bundle ID matches: `com.deephorizon.security`

## 🔧 Product IDs Verification

Verify these product IDs match in:
1. **StoreKit Config File** (`ios/DeepHorizonSecurity.storekit`)
2. **App Store Connect** (In-App Purchases)
3. **Code** (`src/features/subscription/ios-purchase.service.ts`)

**Product IDs**:
- `com.deephorizon.security.individual.monthly.v1`
- `com.deephorizon.security.individual.yearly.v1`
- `com.deephorizon.security.family.monthly.v1`
- `com.deephorizon.security.family.yearly.v1`

## 🚀 Next Steps

1. **If testing on Simulator**:
   - Open Xcode
   - Edit scheme → Run → Options
   - Select StoreKit configuration file
   - Build and run

2. **If testing on Real Device**:
   - Ensure products are in App Store Connect
   - Create sandbox tester
   - Sign out of App Store on device
   - Test purchase flow

3. **If still failing**:
   - Check console logs for detailed error messages
   - Verify product IDs match exactly
   - Wait 30-60 minutes after creating products (propagation delay)

## 📝 Notes

- **StoreKit Config Files** are primarily for simulator testing
- **Real devices** use App Store Connect sandbox environment
- **Preflight failure** doesn't always mean purchase will fail
- The code continues to attempt purchase even if preflight fails (on real devices)
