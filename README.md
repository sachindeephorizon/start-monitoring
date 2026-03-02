# DeepHorizon Security App

A comprehensive personal security and safety application built with React Native and Expo.

## Architecture Overview

This app follows iOS-first architecture principles:

- **No background JS execution** - All critical logic runs on the server
- **System-driven location updates** - Uses native location services
- **Push-driven updates** - Background updates via push notifications
- **Foreground-only real-time** - WebSocket connections only when app is active

## Project Structure

```
├── App.tsx                 # Root component
├── assets/                 # Images, fonts, sounds
├── src/
│   ├── components/         # Reusable UI components
│   ├── screens/            # Screen components
│   ├── navigation/         # Navigation configuration
│   ├── services/           # Business logic and API services
│   ├── hooks/              # Custom React hooks
│   ├── context/            # React Context providers
│   ├── lib/                # Third-party library configurations
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
```

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   EXPO_PUBLIC_STREAM_API_KEY=your_stream_api_key
   EXPO_PUBLIC_STREAM_TOKEN_URL=https://your-dashboard-url.com/api/stream/video-token
   EXPO_PUBLIC_STREAM_APP_ID=hp84m8c435v6
   EXPO_PUBLIC_AGENT_DASHBOARD_URL=https://your-dashboard-url.com
   EXPO_PUBLIC_ENV=development
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **Run on iOS:**
   ```bash
   npm run ios
   ```

5. **Run on Android:**
   ```bash
   npm run android
   ```

## Development Status

This project is being built incrementally following the specified build order:

- [x] Step 1: Project Scaffolding (Current)
- [ ] Step 2: Permission & Capability Layer
- [ ] Step 3: Authentication
- [ ] Step 4: Location Tracking (iOS-safe)
- [ ] Step 5: Push Notification Infrastructure
- [ ] Step 6: Emergency System
- [ ] Step 7: Check-ins
- [ ] Step 8: Chat
- [ ] Step 9: Audio Calls
- [ ] Step 10: Video Calls
- [ ] Step 11: Subscriptions
- [ ] Step 12: Bodyguard Booking
- [ ] Step 13: History & Dashboards

## Technology Stack

- **Framework:** React Native with Expo SDK 54+
- **Language:** TypeScript 5.9.3
- **Navigation:** React Navigation 7.x
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **Video/Audio:** Stream.io
- **Payment:** Razorpay
- **Notifications:** Expo Notifications + Firebase FCM

## iOS Considerations

This app is designed with iOS App Store guidelines in mind:

- No continuous background JavaScript execution
- No background WebSocket connections
- System-driven location updates only
- Push notification-driven background updates
- Proper background modes configuration

## License

Proprietary - DeepHorizon Security

