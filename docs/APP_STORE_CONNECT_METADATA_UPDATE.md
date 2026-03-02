# App Store Connect Metadata Update Required

## Issue: Guideline 3.1.2 - Missing Terms of Use (EULA) Link

Apple requires that apps offering auto-renewable subscriptions include:
1. ✅ **In the app binary** - All required information (DONE - we've updated the code)
2. ⚠️ **In App Store Connect metadata** - Functional links to Privacy Policy and Terms of Use

## What We've Done (App Code)

✅ Updated `SubscriptionPlansScreen.tsx` to include:
- Explicit "Auto-Renewable Subscription" labels
- Clear subscription length display (1 Month / 1 Year)
- Prominent, functional links to "Privacy Policy" and "Terms of Use (EULA)"
- All subscription details (title, length, price) clearly displayed

## What You Need to Do in App Store Connect

### Step 1: Add Terms of Use (EULA) Link to App Description

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to your app: **DeepHorizon Security**
3. Go to **App Information** → **App Description**
4. Add the following text at the end of your app description:

```
Terms of Use (EULA): Available in-app via Settings → Legal → Terms of Use, or visit: https://www.deephorizon.io/terms

Privacy Policy: Available in-app via Settings → Legal → Privacy Policy, or visit: https://www.deephorizon.io/privacy
```

**OR** if you have a direct URL to your Terms of Use document:

```
Terms of Use (EULA): [Your Terms of Use URL]
Privacy Policy: [Your Privacy Policy URL]
```

### Step 2: Verify Privacy Policy Field

1. In App Store Connect, go to **App Privacy** section
2. Ensure the **Privacy Policy URL** field is filled with your privacy policy URL
3. Verify the URL is functional and accessible

### Step 3: Alternative - Add EULA in App Store Connect

If you prefer to use App Store Connect's EULA field instead:

1. Go to **App Information**
2. Look for **EULA (End User License Agreement)** field
3. Either:
   - Select "Use standard Apple EULA" (if applicable)
   - OR upload your custom EULA document
   - OR enter your EULA URL

## Recommended Approach

**Option 1 (Recommended)**: Add links in App Description
- Simple and straightforward
- Links are visible to users in the App Store
- Easy to update

**Option 2**: Use App Store Connect EULA field
- More structured
- Separate from app description
- May require document upload

## Verification Checklist

Before resubmitting:

- [ ] Terms of Use (EULA) link added to App Description OR EULA field in App Store Connect
- [ ] Privacy Policy URL verified in App Privacy section
- [ ] Both URLs are functional and accessible
- [ ] App binary includes all required subscription information (already done)
- [ ] App binary includes functional links to Privacy Policy and Terms of Use (already done)

## Next Steps

1. Update App Store Connect metadata as described above
2. Submit the updated app binary (version 1.0.13) with the new subscription screen
3. Use the reply in `APP_STORE_REPLY_GUIDELINE_3.1.2.md` when responding to Apple

---

**Note**: The app code changes are complete. You just need to update the App Store Connect metadata to include the Terms of Use (EULA) link in the App Description or EULA field.
