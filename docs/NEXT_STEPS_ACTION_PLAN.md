# Next Steps - Action Plan

## ✅ What's Already Done

1. ✅ Code updated - Subscription screen now shows all required information
2. ✅ Functional links added - Privacy Policy and Terms of Use (EULA) links in app
3. ✅ Reply document created - Ready to send to Apple

## 📋 What You Need to Do (In Order)

### STEP 1: Update App Store Connect Metadata (5 minutes)

**This is REQUIRED before submitting the build.**

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to: **My Apps** → **DeepHorizon Security**
3. Click on **App Information** (left sidebar)
4. Scroll to **App Description** field
5. **Add this text at the END of your app description:**

```
Terms of Use (EULA): Available in-app via Settings → Legal → Terms of Use, or visit: https://www.deephorizon.io/terms

Privacy Policy: Available in-app via Settings → Legal → Privacy Policy, or visit: https://www.deephorizon.io/privacy
```

**OR** if you have direct URLs, use:
```
Terms of Use (EULA): [Your actual Terms of Use URL]
Privacy Policy: [Your actual Privacy Policy URL]
```

6. Click **Save** (top right)

7. **Verify Privacy Policy URL:**
   - Go to **App Privacy** section (left sidebar)
   - Check that **Privacy Policy URL** field is filled
   - If empty, add your privacy policy URL
   - Click **Save**

---

### STEP 2: Build New Version (30-60 minutes)

**Build the app with the updated code:**

```bash
# Make sure you're in the project directory
cd /Users/deephorizon/development/Deephorizon_ios/Deephorizon-security

# Build for iOS production
eas build --platform ios --profile production
```

**Wait for the build to complete** (this takes 30-60 minutes)

---

### STEP 3: Submit New Build to App Store Connect (10 minutes)

1. Once build completes, go to **App Store Connect**
2. Navigate to: **My Apps** → **DeepHorizon Security** → **TestFlight** or **App Store**
3. Click **+ Version** or **+ Build** button
4. Select the new build (version 1.0.13, build 113)
5. Fill in any required information
6. Click **Submit for Review**

---

### STEP 4: Reply to Apple's Review Message (5 minutes)

1. In **App Store Connect**, go to: **My Apps** → **DeepHorizon Security**
2. Click on **App Review** tab (left sidebar)
3. Find the message about **Guideline 3.1.2**
4. Click **Reply** button
5. **Copy and paste the entire content** from `APP_STORE_REPLY_GUIDELINE_3.1.2.md`
6. Click **Send**

---

## 📝 Quick Checklist

Before submitting, verify:

- [ ] App Store Connect App Description includes Terms of Use (EULA) link
- [ ] Privacy Policy URL is set in App Privacy section
- [ ] New app build (1.0.13) is created and uploaded
- [ ] New build is submitted for review
- [ ] Reply sent to Apple's review message

---

## ⚠️ Important Notes

1. **Do Step 1 FIRST** - Update metadata before building/submitting
2. **Version Number**: The app is already at version 1.0.13 (build 113) - this is correct
3. **Reply Timing**: You can send the reply either:
   - Before submitting the new build (to explain what's coming)
   - After submitting the new build (to confirm it's included)
   - Either way works, but sending it after submission is recommended

---

## 🆘 If You Need Help

**If build fails:**
- Check EAS build logs
- Ensure all environment variables are set in EAS secrets

**If metadata update fails:**
- Make sure you have Admin or App Manager role
- Try refreshing the page

**If you can't find the reply option:**
- The reply option appears in the App Review section
- Make sure you're looking at the correct app version

---

## ✅ Success Criteria

You'll know everything is done when:
1. ✅ App Store Connect metadata shows Terms of Use link
2. ✅ New build (1.0.13) is submitted
3. ✅ Reply sent to Apple
4. ✅ Status shows "Waiting for Review"

---

**Estimated Total Time**: 1-2 hours (mostly waiting for build)

**Start with Step 1** - Update App Store Connect metadata first!
