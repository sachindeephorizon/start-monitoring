# SubscriptionStoreView Setup Guide

This guide explains how to set up Apple's native `SubscriptionStoreView` (iOS 17.0+) in your React Native app.

## Overview

`SubscriptionStoreView` is Apple's native SwiftUI component that automatically displays:
- ✅ Subscription titles, descriptions, and prices
- ✅ **Privacy Policy link** (from App Store Connect)
- ✅ **Terms of Use (EULA) link** (from App Store Connect)
- ✅ Purchase buttons
- ✅ All required subscription information per App Store guidelines

This eliminates the need for custom UI and ensures 100% compliance with App Store Guideline 3.1.2.

## Files Created

### Native iOS Files:
1. `ios/DeepHorizonSecurity/SubscriptionStoreViewModule.swift` - Swift module
2. `ios/DeepHorizonSecurity/SubscriptionStoreViewModule.m` - Objective-C bridge

### React Native Files:
1. `src/features/subscription/SubscriptionStoreView.native.ts` - Native module interface
2. `src/features/subscription/SubscriptionStoreView.ts` - Cross-platform wrapper

## Setup Instructions

### Step 1: Add Files to Xcode Project

1. Open `ios/DeepHorizonSecurity.xcworkspace` in Xcode
2. Right-click on the `DeepHorizonSecurity` folder in the Project Navigator
3. Select "Add Files to DeepHorizonSecurity..."
4. Add these files:
   - `SubscriptionStoreViewModule.swift`
   - `SubscriptionStoreViewModule.m`
5. Make sure "Copy items if needed" is checked
6. Make sure "DeepHorizonSecurity" target is selected
7. Click "Add"

### Step 2: Verify Build Settings

1. Select the `DeepHorizonSecurity` project in Xcode
2. Go to "Build Settings"
3. Search for "Swift Language Version"
4. Ensure it's set to Swift 5 or later
5. Search for "iOS Deployment Target"
6. Ensure it's set to iOS 17.0 or later (currently set to 18.0, which is fine)

### Step 3: Update Subscription Group ID

1. Open `src/features/subscription/SubscriptionStoreView.native.ts`
2. Find the `SUBSCRIPTION_GROUP_ID` constant
3. Replace `'21482017'` with your actual subscription group ID from App Store Connect:
   - Go to App Store Connect → Your App → Features → Subscriptions
   - Find your subscription group ID
   - Update the constant

### Step 4: Verify Product IDs

The product IDs are already configured in `SubscriptionStoreView.native.ts`:
- `com.deephorizon.security.individual.monthly.v1`
- `com.deephorizon.security.individual.yearly.v1`
- `com.deephorizon.security.family.monthly.v1`
- `com.deephorizon.security.family.yearly.v1`

Make sure these match exactly with your App Store Connect product IDs.

### Step 5: Build and Test

1. Run `cd ios && pod install` (if needed)
2. Build the app in Xcode or run `npx expo run:ios`
3. Test the subscription flow:
   - Navigate to subscription plans screen
   - On iOS 17.0+, tap "View Subscription Plans"
   - The native SubscriptionStoreView should appear

## How It Works

### On iOS 17.0+:
- Tapping "View Subscription Plans" opens Apple's native `SubscriptionStoreView`
- This view automatically includes all required information:
  - Privacy Policy link (from App Store Connect metadata)
  - Terms of Use (EULA) link (from App Store Connect metadata)
  - Subscription titles, prices, and descriptions
  - Purchase buttons
- Users can purchase directly from this native view
- All purchases go through StoreKit

### On Older iOS Versions or Android:
- Falls back to the custom subscription screen
- Uses the existing purchase flow

## App Store Connect Configuration

Make sure you have configured in App Store Connect:

1. **Privacy Policy URL**: Set in App Store Connect → App Information → Privacy Policy
2. **Terms of Use (EULA)**: Either:
   - Use Apple's Standard EULA (recommended)
   - Or upload a custom EULA in App Store Connect
3. **Subscription Group**: Create a subscription group and add all your subscription products to it
4. **Product IDs**: Match exactly with the IDs in `SubscriptionStoreView.native.ts`

## Benefits

✅ **100% App Store Compliant**: Uses Apple's native UI which automatically includes all required information
✅ **Automatic Updates**: Apple handles UI updates and localization
✅ **Better UX**: Native iOS design that users are familiar with
✅ **Less Code**: No need to maintain custom subscription UI
✅ **Future-Proof**: Automatically supports new iOS features

## Troubleshooting

### Module Not Found Error
- Make sure files are added to the Xcode project
- Run `cd ios && pod install`
- Clean build folder in Xcode (Cmd+Shift+K)
- Rebuild the project

### SubscriptionStoreView Not Appearing
- Check iOS version (requires 17.0+)
- Verify product IDs match App Store Connect
- Check subscription group ID is correct
- Ensure subscriptions are configured in App Store Connect

### Privacy Policy / Terms Links Not Working
- Verify Privacy Policy URL is set in App Store Connect
- Verify EULA is configured in App Store Connect
- Check that subscription group is properly configured

## Next Steps

After setup:
1. Test on a real iOS 17.0+ device
2. Verify Privacy Policy and Terms links work
3. Test purchase flow
4. Submit to App Store

The native SubscriptionStoreView will automatically handle all App Store requirements for Guideline 3.1.2.
