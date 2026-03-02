# DeepHorizon Security App - Testing Guide

This guide covers how to test the DeepHorizon Security App, from development setup to production-ready testing scenarios.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Running the App](#running-the-app)
4. [Testing on Simulators/Emulators](#testing-on-simulatorsemulators)
5. [Testing on Real Devices](#testing-on-real-devices)
6. [Critical Test Scenarios](#critical-test-scenarios)
7. [iOS-Specific Testing](#ios-specific-testing)
8. [Feature-by-Feature Testing](#feature-by-feature-testing)
9. [App Store Preparation Testing](#app-store-preparation-testing)

---

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18+
   ```

2. **Expo CLI**
   ```bash
   npm install -g expo-cli
   ```

3. **EAS CLI** (for builds)
   ```bash
   npm install -g eas-cli
   ```

4. **iOS Development** (Mac only)
   - Xcode 15+
   - iOS Simulator
   - CocoaPods: `sudo gem install cocoapods`

5. **Android Development**
   - Android Studio
   - Android SDK
   - Android Emulator

### Environment Variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_STREAM_API_KEY=your_stream_api_key
EXPO_PUBLIC_STREAM_TOKEN_URL=your_stream_token_endpoint
EXPO_PUBLIC_STREAM_APP_ID=your_stream_app_id
EXPO_PUBLIC_AGENT_DASHBOARD_URL=your_dashboard_url
EXPO_PUBLIC_ENV=development
```

---

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm start
# or
npx expo start
```

This will:
- Start Metro bundler
- Display QR code for Expo Go
- Show options for iOS/Android simulators

### 3. Run on iOS Simulator (Mac only)

```bash
npm run ios
# or
npx expo start --ios
```

### 4. Run on Android Emulator

```bash
npm run android
# or
npx expo start --android
```

### 5. Run on Physical Device

#### Using Expo Go (Development)

1. Install Expo Go app from App Store/Play Store
2. Scan QR code from terminal
3. App loads on device

**Note**: Expo Go has limitations. For full feature testing, use a development build.

#### Using Development Build (Recommended)

1. Build development client:
   ```bash
   eas build --profile development --platform ios
   # or
   eas build --profile development --platform android
   ```

2. Install on device via EAS or TestFlight/Internal Testing

3. Start development server:
   ```bash
   npx expo start --dev-client
   ```

---

## Testing on Simulators/Emulators

### iOS Simulator (Recommended for Initial Testing)

**Advantages:**
- Fast iteration
- Easy to test multiple scenarios
- No physical device needed

**Limitations:**
- Background location tracking may not work perfectly
- Push notifications require configuration
- Some hardware features unavailable

**Test Steps:**
1. Open Xcode
2. Launch iOS Simulator (iPhone 14 Pro recommended)
3. Run: `npm run ios`
4. App installs and launches automatically

### Android Emulator

**Advantages:**
- Fast iteration
- Multiple device configurations
- Easy to test different Android versions

**Limitations:**
- Location simulation may differ from real GPS
- Background restrictions differ from real devices

**Test Steps:**
1. Open Android Studio
2. Launch Android Emulator (Pixel 5 recommended)
3. Run: `npm run android`
4. App installs and launches automatically

---

## Testing on Real Devices

### iOS Device (REQUIRED for Final Testing)

**Why Real Device is Critical:**
- Background location tracking only works properly on real devices
- Push notifications require real device
- iOS background execution rules enforced
- App Store testing requires real device

**Setup Steps:**

1. **Register Device in Apple Developer Account**
   - Add device UDID to provisioning profile

2. **Build Development Client**
   ```bash
   eas build --profile development --platform ios
   ```

3. **Install via TestFlight** (Recommended)
   ```bash
   eas build --profile preview --platform ios
   # Upload to App Store Connect
   # Distribute via TestFlight
   ```

4. **Install via EAS**
   ```bash
   eas build --profile development --platform ios
   # Follow EAS instructions to install
   ```

### Android Device

**Setup Steps:**

1. **Enable Developer Options**
   - Settings → About Phone → Tap Build Number 7 times

2. **Enable USB Debugging**
   - Settings → Developer Options → USB Debugging

3. **Build Development Client**
   ```bash
   eas build --profile development --platform android
   ```

4. **Install APK**
   - Download from EAS build page
   - Install on device

---

## Critical Test Scenarios

### 🔴 CRITICAL: iOS Background Testing

These scenarios **MUST** be tested on a **real iPhone**:

#### 1. Location Tracking - Background Survival

**Test Steps:**
1. Grant "Always" location permission
2. Start tracking session
3. **Lock the phone** (swipe up or press power button)
4. Walk/move for 5-10 minutes
5. Unlock and check Supabase → locations should have arrived
6. **Force-kill the app** (swipe up in app switcher)
7. Walk/move again
8. Check Supabase → locations should still arrive

**Expected Result:**
✅ Locations continue to arrive even when app is killed

**Failure Signs:**
❌ Locations stop after app kill
❌ Locations only arrive when app is open

#### 2. Emergency - App Kill Scenario

**Test Steps:**
1. Trigger emergency
2. **Immediately kill the app** (before location capture completes)
3. Check Supabase → emergency record should exist

**Expected Result:**
✅ Emergency created on server even if app dies

**Failure Signs:**
❌ No emergency record in database
❌ Emergency only created if app stays open

#### 3. Push Notifications - Cold Start

**Test Steps:**
1. **Kill the app completely**
2. Send push notification from dashboard/backend
3. Tap notification
4. App should open and navigate to correct screen

**Expected Result:**
✅ App opens from killed state
✅ User remains authenticated
✅ Correct screen opens

**Failure Signs:**
❌ App doesn't open
❌ User is logged out
❌ Wrong screen opens

#### 4. Audio Call - Background Continuity

**Test Steps:**
1. Start audio call
2. **Lock the phone**
3. Audio should continue
4. **Background the app** (home button/swipe)
5. Audio should continue
6. End call
7. Background execution should stop

**Expected Result:**
✅ Audio continues in background/locked state
✅ Audio stops cleanly on hangup
✅ No audio "leaks" after call ends

---

## Feature-by-Feature Testing

### 1. Authentication

**Test Scenarios:**
- ✅ Sign up with email/password
- ✅ Sign in with email/password
- ✅ Session persists after app kill
- ✅ Session persists after phone restart
- ✅ Logout works correctly
- ✅ Auth state updates correctly

**Critical Test:**
```bash
# Test session persistence
1. Sign in
2. Kill app completely
3. Reopen app
4. Should still be logged in
```

### 2. Permissions

**Test Scenarios:**
- ✅ Request location (when in use) → Grant → Works
- ✅ Request location (always) → Grant → Background tracking works
- ✅ Request notifications → Grant → Notifications arrive
- ✅ Request microphone → Grant → Audio calls work
- ✅ Request camera → Grant → Video calls work
- ✅ Deny permission → Feature shows permission required UI
- ✅ Block permission → Settings link works

**Critical Test:**
```bash
# Test permission denial
1. Deny location permission
2. Try to start tracking
3. Should show permission required UI
4. Should not crash
```

### 3. Location Tracking

**Test Scenarios:**
- ✅ Start tracking session
- ✅ Location updates arrive in Supabase
- ✅ Tracking works in background
- ✅ Tracking works when phone is locked
- ✅ Tracking continues after app kill (iOS)
- ✅ Stop tracking → Locations stop
- ✅ View tracking history

**Critical Test (iOS):**
```bash
# Test background location
1. Start tracking
2. Lock phone
3. Move/walk for 10 minutes
4. Check Supabase → locations should arrive
5. Force-kill app
6. Move again
7. Locations should still arrive
```

### 4. Emergency System

**Test Scenarios:**
- ✅ Trigger emergency → Emergency created
- ✅ Location attached to emergency
- ✅ Passkey verification works
- ✅ Emergency created even if app dies
- ✅ View emergency history
- ✅ Emergency status updates

**Critical Test:**
```bash
# Test emergency reliability
1. Trigger emergency
2. Immediately kill app
3. Check Supabase → emergency record exists
4. Check dashboard → emergency visible to agents
```

### 5. Check-Ins

**Test Scenarios:**
- ✅ Schedule check-in
- ✅ Receive notification at scheduled time
- ✅ Complete check-in with passkey
- ✅ Missed check-in escalates
- ✅ View check-in history

**Critical Test:**
```bash
# Test missed check-in
1. Schedule check-in for 1 minute from now
2. Kill app
3. Wait 2 minutes
4. Check Supabase → check-in marked as missed
5. Check dashboard → agent should be notified
```

### 6. Chat

**Test Scenarios:**
- ✅ Create chat request
- ✅ Agent assigned automatically
- ✅ Send messages
- ✅ Receive messages (foreground)
- ✅ Receive push notification (background)
- ✅ Chat history loads correctly

**Critical Test:**
```bash
# Test chat background
1. Open chat
2. Background app
3. Agent sends message
4. Push notification arrives
5. Tap notification
6. App opens to chat screen
7. Message visible
```

### 7. Audio Calls

**Test Scenarios:**
- ✅ Start audio call
- ✅ Audio continues in background
- ✅ Audio continues when phone locked
- ✅ End call → Audio stops
- ✅ Receive incoming audio call
- ✅ Call history recorded

**Critical Test:**
```bash
# Test background audio
1. Start audio call
2. Lock phone
3. Audio continues
4. Background app
5. Audio continues
6. End call
7. Audio stops immediately
```

### 8. Video Calls

**Test Scenarios:**
- ✅ Start video call
- ✅ Video works in foreground
- ✅ Video stops when app backgrounds
- ✅ Camera/mic controls work
- ✅ End call works
- ✅ Call history recorded

**Critical Test:**
```bash
# Test video background restriction
1. Start video call
2. Background app (home button)
3. Video call should end automatically
4. Check Supabase → call status = 'ended'
```

### 9. Subscriptions

**Test Scenarios:**
- ✅ View subscription plans
- ✅ Create Razorpay order
- ✅ Complete payment
- ✅ Subscription activates
- ✅ View subscription status
- ✅ Feature gating works

**Critical Test:**
```bash
# Test subscription gating
1. Without subscription → try to book bodyguard
2. Should show subscription required
3. Complete subscription
4. Now can book bodyguard
```

### 10. Bodyguard Booking

**Test Scenarios:**
- ✅ Create booking
- ✅ Booking appears in dashboard
- ✅ Status updates work
- ✅ Cancel booking
- ✅ View booking history

### 11. History

**Test Scenarios:**
- ✅ View all history
- ✅ Filter by type
- ✅ History loads correctly
- ✅ History works after app kill

### 12. Settings

**Test Scenarios:**
- ✅ View permission status
- ✅ Open iOS Settings works
- ✅ Notification preferences
- ✅ Logout works
- ✅ Legal screens load

---

## iOS-Specific Testing

### Background Execution Tests

**1. Location Tracking Background**
- ✅ Works when app is killed
- ✅ Works when phone is locked
- ✅ No battery drain issues

**2. Push Notifications**
- ✅ Notifications arrive when app is killed
- ✅ Tapping notification opens app
- ✅ Cold-start navigation works

**3. Audio Background**
- ✅ Audio continues when locked
- ✅ Audio continues in background
- ✅ Audio stops cleanly on end

**4. Video Foreground-Only**
- ✅ Video stops when backgrounded
- ✅ No attempts to keep video in background

### Permission Testing

**Test Permission Denial Paths:**
1. Deny location → Tracking disabled
2. Deny notifications → No push notifications
3. Deny microphone → Audio calls disabled
4. Deny camera → Video calls disabled

**Test Permission Re-request:**
1. Deny permission
2. Go to Settings
3. Grant permission
4. Return to app
5. Feature should work

### App Store Compliance Tests

**1. App Store Review Guidelines:**
- ✅ No crashes on launch
- ✅ No blank screens
- ✅ Privacy policy accessible
- ✅ Terms of service accessible
- ✅ Refund policy accessible
- ✅ Permission explanations clear

**2. Background Modes:**
- ✅ Location background mode works
- ✅ Audio background mode works only during calls
- ✅ No unauthorized background execution

**3. Permissions:**
- ✅ All permission descriptions present in Info.plist
- ✅ Permission requests have clear explanations
- ✅ Settings deep-link works

---

## App Store Preparation Testing

### Pre-Submission Checklist

#### 1. App Store Metadata

- [ ] App name (max 30 characters)
- [ ] Subtitle (max 30 characters)
- [ ] Description (compelling, clear)
- [ ] Keywords (relevant search terms)
- [ ] Screenshots (all required sizes)
- [ ] App icon (1024x1024)
- [ ] Privacy policy URL
- [ ] Support URL

#### 2. Build Requirements

- [ ] Build number incremented
- [ ] Version number correct
- [ ] App icon set
- [ ] Splash screen configured
- [ ] Bundle identifier matches
- [ ] Signing certificates valid

#### 3. Functional Testing

- [ ] All features work on latest iOS
- [ ] No crashes on launch
- [ ] No crashes during normal use
- [ ] Background features work
- [ ] Push notifications work
- [ ] Permissions work correctly

#### 4. Legal Compliance

- [ ] Privacy policy accessible
- [ ] Terms of service accessible
- [ ] Refund policy accessible (if required)
- [ ] All legal content is accurate

#### 5. Performance

- [ ] App launches quickly (< 3 seconds)
- [ ] No excessive battery drain
- [ ] No excessive data usage
- [ ] Memory usage reasonable

---

## Testing Tools

### 1. Expo Dev Tools

Access at `http://localhost:19002`:
- Logs
- Performance metrics
- Device info

### 2. React Native Debugger

```bash
npm install -g react-native-debugger
```

### 3. Flipper (Optional)

For advanced debugging:
- Network inspector
- Layout inspector
- Database inspector

### 4. EAS Build Logs

View build logs:
```bash
eas build:list
eas build:view [BUILD_ID]
```

---

## Common Issues and Solutions

### Issue: App Crashes on Launch

**Solutions:**
- Check environment variables
- Clear cache: `npx expo start -c`
- Rebuild: `eas build --clear-cache`

### Issue: Location Not Working in Background

**Solutions:**
- Verify "Always" permission granted
- Check `UIBackgroundModes` in `app.json`
- Test on real device (simulator limitations)

### Issue: Push Notifications Not Arriving

**Solutions:**
- Verify APNs certificates configured
- Check device token registered in Supabase
- Test on real device
- Check notification permissions

### Issue: Build Fails

**Solutions:**
- Check EAS build logs
- Verify all dependencies installed
- Check for TypeScript errors: `npx tsc --noEmit`
- Verify environment variables set

---

## Next Steps

1. **Complete Development Testing**
   - Test all features on simulator
   - Fix any bugs

2. **Real Device Testing**
   - Build development client
   - Test on real iPhone (critical)
   - Test on real Android device

3. **Pre-Production Build**
   ```bash
   eas build --profile production --platform ios
   ```

4. **TestFlight Distribution**
   - Upload to App Store Connect
   - Add internal testers
   - Test thoroughly

5. **App Store Submission**
   - Complete App Store Connect metadata
   - Submit for review
   - Respond to any review feedback

---

## Quick Test Commands

```bash
# Start development server
npm start

# Run on iOS simulator (if on Mac)
npm run ios

# Run on Android emulator
npm run android

# Build development client (iOS)
eas build --profile development --platform ios

# Build production build (iOS)
eas build --profile production --platform ios

# Check TypeScript errors
npx tsc --noEmit

# Clear cache and restart
npx expo start -c

# Check for linting errors
npm run lint  # if configured
```

## Getting Started Right Now

### Option 1: Quick Test with Expo Go (Limited)

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm start

# 3. Scan QR code with Expo Go app (iOS/Android)
# Note: Some features won't work in Expo Go (background location, etc.)
```

### Option 2: Development Build (Recommended)

```bash
# 1. Install dependencies
npm install

# 2. Configure EAS (first time only)
eas login
eas build:configure

# 3. Build development client for your device
eas build --profile development --platform ios     # for iPhone
# or
eas build --profile development --platform android # for Android

# 4. Install build on device (follow EAS instructions)

# 5. Start development server
npx expo start --dev-client

# 6. App should connect automatically
```

### Option 3: Test on Simulator/Emulator

**iOS Simulator (Mac only):**
```bash
npm install
npm start
# Press 'i' in terminal to open iOS simulator
```

**Android Emulator:**
```bash
npm install
npm start
# Press 'a' in terminal to open Android emulator
```

---

**Remember**: Always test critical features (location tracking, emergencies, push notifications) on a **real iPhone** before App Store submission!

