# 🚀 EAS Build Deployment Commands

## Quick Reference

### iOS Production Build
```bash
eas build --platform ios --profile production
```

### Android Production Build
```bash
eas build --platform android --profile production
```

### Both Platforms (Sequential)
```bash
eas build --platform ios --profile production && eas build --platform android --profile production
```

---

## 📊 Build Configuration Summary

### Version Information
```
App Version: 1.0.27
iOS Build Number: 129
Android Version Code: 129
Runtime Version: 1.0.27
```

### EAS Build Profiles

#### Development
- Distribution: internal
- Environment: development
- iOS Resource: m-medium
- Android Format: apk

#### Preview
- Distribution: internal
- Environment: production
- iOS Resource: m-medium
- Android Format: apk

#### Production ✅ (RECOMMENDED FOR THIS BUILD)
- Environment: production
- iOS: SDK 54, m-medium, Release build
- Android: app-bundle (AAB) format
- Distribution: Ready for App Store / Play Store

---

## 🔧 Pre-Build Checklist

```bash
# 1. Verify EAS CLI is installed
which eas

# 2. Check project configuration
eas project info

# 3. Verify credentials are configured
eas credentials list

# 4. Check Git status (ensure clean working directory recommended)
git status

# 5. Verify TypeScript compiles
npx tsc --noEmit
```

---

## 📱 iOS Build Process

```bash
# Step 1: Initiate iOS production build
eas build --platform ios --profile production

# Step 2: Monitor build (optional)
eas build:list

# Step 3: View build logs (if needed)
eas build:log <build-id>

# Step 4: Once build completes, submit to App Store
eas submit --platform ios
```

### Expected Output
- `.ipa` file created
- All provisioning profiles auto-managed
- Ready for App Store Connect submission
- Build typically takes: 10-15 minutes

---

## 🤖 Android Build Process

```bash
# Step 1: Initiate Android production build
eas build --platform android --profile production

# Step 2: Monitor build (optional)
eas build:list

# Step 3: View build logs (if needed)
eas build:log <build-id>

# Step 4: Once build completes, submit to Google Play
eas submit --platform android
```

### Expected Output
- `.aab` file created (Android App Bundle)
- Signed with production keystore
- Ready for Google Play submission
- Build typically takes: 8-12 minutes

---

## 🎯 Submission to App Stores

### iOS App Store
```bash
# Automatic submission
eas submit --platform ios

# Or submit specific build
eas submit --platform ios --latest
```

### Google Play Store
```bash
# Automatic submission
eas submit --platform android

# Or submit specific build
eas submit --platform android --latest
```

---

## 📋 After Deployment

### Monitor
- [ ] Check app store listing updated
- [ ] Verify version appears in stores (can take 1-24 hours)
- [ ] Monitor crash rates in analytics
- [ ] Check user reviews/feedback

### Rollback (If Needed)
```bash
# Find previous build
eas build:list

# Resubmit previous build
eas submit --platform ios --build <previous-build-id>
```

---

## 🆘 Troubleshooting

### Build Fails
```bash
# Check detailed logs
eas build:log <build-id>

# Common issues:
# - Invalid provisioning profile (iOS)
# - Outdated dependencies (npm install)
# - TypeScript errors (npx tsc --noEmit)
```

### Submission Fails
```bash
# Check App Store Connect credentials (iOS)
eas credentials list

# Check Google Play credentials (Android)
eas credentials list

# Re-authenticate if needed
eas credentials delete --platform ios
eas credentials create --platform ios
```

---

## ✅ What's in This Build (v1.0.27)

### Critical Fixes ✅
- Logout state management fixed
- Date picker navigation works
- Check-in detection operational
- Tracking doesn't freeze
- Profile fetch error handling

### New Features ✅
- 30-second passkey countdown
- Auto-detection of scheduled check-ins
- Periodic check-in reload (60s)
- Non-blocking location fetch

### Quality Assurance ✅
- TypeScript: 0 errors
- All fixes tested
- No breaking changes
- Backward compatible

---

## 📞 Support

**Need Help?**
- View EAS Build docs: https://docs.expo.dev/build/introduction/
- Check build status: `eas build:list`
- View logs: `eas build:log <id>`
- Contact EAS support: support@expo.dev

---

**Status**: ✅ READY TO BUILD AND DEPLOY

**Next Command**: 
```bash
eas build --platform ios --profile production
```
