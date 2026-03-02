# iOS StoreKit "SKU Not Found" Troubleshooting Guide

## Issue
When clicking "Subscribe" button, getting "SKU not found" error even though products show "Ready to Submit" in App Store Connect.

## Common Causes & Solutions

### 1. ⚠️ **Testing on Simulator** (MOST COMMON)
**Problem**: StoreKit doesn't work reliably on iOS Simulator.

**Solution**: 
- **Test on a REAL iOS device** (iPhone/iPad)
- Simulator cannot access App Store sandbox environment properly
- Use a physical device connected via USB or TestFlight

---

### 2. 🔐 **Sandbox Account Not Set Up**
**Problem**: Not signed in with a Sandbox Apple ID.

**Solution**:
1. **Sign out of App Store on device**:
   - Settings → App Store → Sign Out
2. **Create Sandbox Tester** in App Store Connect:
   - Users and Access → Sandbox Testers → Add new tester
   - Use a different email than your main Apple ID
3. **Sign in with Sandbox account** when prompted during purchase:
   - The app will prompt you to sign in
   - Use the Sandbox tester email/password
   - **DO NOT** sign in manually in Settings

---

### 3. 📦 **Bundle ID Mismatch**
**Problem**: Bundle ID in app doesn't match App Store Connect app.

**Check**:
- App Bundle ID: `com.deephorizon.security` (from `app.json`)
- App Store Connect app must have same Bundle ID
- Product IDs must match: `com.deephorizon.security.individual.monthly.v1`, etc.

**Verify**:
```bash
# Check your app's bundle ID
grep -r "bundleIdentifier" app.json
```

---

### 4. ⏰ **Propagation Delay**
**Problem**: Products show "Ready to Submit" but haven't propagated to sandbox yet.

**Solution**:
- Wait **30-60 minutes** after creating/updating products
- Products can take time to sync to sandbox environment
- Try again after waiting

---

### 5. ✅ **Product Configuration Issues**
**Check in App Store Connect**:

1. **Product Status**: Should be "Ready to Submit" ✅
2. **Cleared for Sale**: Must be enabled ✅
3. **Pricing**: Must be set for at least one territory ✅
4. **Subscription Group**: Must be assigned to a group ✅
5. **Localizations**: Display name and description must be set ✅

**Product IDs must match exactly**:
- `com.deephorizon.security.individual.monthly.v1`
- `com.deephorizon.security.individual.yearly.v1`
- `com.deephorizon.security.family.monthly.v1`
- `com.deephorizon.security.family.yearly.v1`

---

### 6. 🔑 **Agreements & Banking**
**Problem**: App Store Connect agreements not active.

**Check**:
- Agreements, Tax, and Banking → All agreements must be "Active"
- Paid Apps Agreement must be accepted
- Banking information must be complete

---

### 7. 🏗️ **Build Configuration**
**Problem**: Using wrong build configuration (development vs production).

**For Testing**:
- Use **Development** or **Ad Hoc** builds
- Or use **TestFlight** builds
- Production builds won't work until app is approved

**Check Build Settings**:
```bash
# Verify you're using correct provisioning profile
# Development builds should work with sandbox
```

---

## Step-by-Step Testing Checklist

### ✅ Pre-Testing Setup
- [ ] Products created in App Store Connect
- [ ] Products show "Ready to Submit"
- [ ] Sandbox tester account created
- [ ] Bundle ID matches (`com.deephorizon.security`)
- [ ] Product IDs match exactly
- [ ] Agreements are active in App Store Connect

### ✅ Device Setup
- [ ] Using **real iOS device** (not simulator)
- [ ] Signed out of App Store in Settings
- [ ] App installed on device (development build or TestFlight)

### ✅ Testing Steps
1. Open app on **real device**
2. Navigate to Subscription Plans
3. Select a plan
4. Tap "Subscribe"
5. **When prompted**, sign in with **Sandbox tester account**
6. Complete purchase in sandbox

---

## Debugging: Check Logs

The app now logs detailed information. Check console for:

```
[iOS Purchase] Preflight check: Fetching product: com.deephorizon.security.individual.monthly.v1
[iOS Purchase] Preflight response: {...}
[iOS Purchase] Filtered subscription products: 1
[iOS Purchase] ✅ Preflight check passed. Product found: ...
```

If you see:
- `Filtered subscription products: 0` → SKU not found (check causes above)
- `Error details: {...}` → Check error message for specific issue

---

## Quick Fixes

### Fix 1: Test on Real Device
```bash
# Build and run on connected device
npx expo run:ios --device
```

### Fix 2: Verify Product IDs
Check `ios-purchase.service.ts`:
```typescript
export const IOS_PRODUCT_IDS: Record<string, string> = {
  'plan_RIADHZ91GxVCUn': 'com.deephorizon.security.individual.monthly.v1',
  'plan_RIAOwgHa1uhibd': 'com.deephorizon.security.individual.yearly.v1',
  'plan_RIADmXQMERsApy': 'com.deephorizon.security.family.monthly.v1',
  'plan_RIAOC4tpe6q41z': 'com.deephorizon.security.family.yearly.v1',
};
```

Compare with App Store Connect product IDs - they must match **exactly**.

### Fix 3: Wait and Retry
- Products can take 30-60 minutes to propagate
- Wait and try again
- Check App Store Connect for any warnings/errors

---

## Still Not Working?

1. **Check App Store Connect**:
   - Go to your app → In-App Purchases
   - Verify each product shows "Ready to Submit"
   - Check for any warnings (yellow triangles)

2. **Verify Bundle ID**:
   - App Store Connect → App Information
   - Bundle ID must be: `com.deephorizon.security`

3. **Test with TestFlight**:
   - Submit a build to TestFlight
   - Test purchases in TestFlight environment
   - This uses production-like environment

4. **Contact Apple Support**:
   - If products are "Ready to Submit" but still not working after 24 hours
   - App Store Connect → Help → Contact Us

---

## Expected Behavior

### ✅ Working Correctly
- App fetches products successfully
- "Subscribe" button triggers purchase
- Apple payment sheet appears
- Can complete purchase with Sandbox account
- Subscription activates after purchase

### ❌ Not Working
- "SKU not found" error
- No products returned from `fetchProducts`
- Purchase sheet doesn't appear
- Error during purchase

---

**Last Updated**: 2025-01-07
