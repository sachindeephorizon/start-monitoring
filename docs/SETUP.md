# DeepHorizon Security App - Setup Guide

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stream.io Configuration
EXPO_PUBLIC_STREAM_API_KEY=your_stream_api_key
EXPO_PUBLIC_STREAM_TOKEN_URL=https://your-dashboard-url.com/api/stream/video-token
EXPO_PUBLIC_STREAM_APP_ID=hp84m8c435v6

# Agent Dashboard URL
EXPO_PUBLIC_AGENT_DASHBOARD_URL=https://your-dashboard-url.com

# Development
EXPO_PUBLIC_DEMO_PASSKEY=1234
EXPO_PUBLIC_ENV=development
```

### 3. Logo Setup

The app currently references `./assets/icon.png` for the app icon. To use `LOGOnew.png`:

**Option 1: Replace icon.png**
```bash
cp LOGOnew.png assets/icon.png
```

**Option 2: Update app.json**
Update the `icon` field in `app.json` to point to `./LOGOnew.png` (you may need to move it to assets folder for best practices).

### 4. Start Development Server

```bash
npm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code with Expo Go app (for physical devices)

## Project Structure

```
deephorizon-security/
├── App.tsx                      # Root component
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
├── babel.config.js              # Babel configuration
├── metro.config.js              # Metro bundler configuration
├── eas.json                     # EAS Build configuration
├── assets/                      # Images, fonts, sounds
│   ├── icon.png                 # App icon
│   ├── adaptive-icon.png        # Android adaptive icon
│   ├── splash.png               # Splash screen
│   ├── splash-icon.png          # Splash screen icon
│   ├── favicon.png              # Web favicon
│   ├── Logo-T.png               # Logo variant
│   └── siren.mp3                # Emergency sound
├── LOGOnew.png                  # Main logo (to be integrated)
├── src/
│   ├── components/              # Reusable UI components
│   ├── screens/                 # Screen components
│   ├── navigation/              # Navigation configuration
│   │   ├── AuthNavigator.tsx    # Auth flow navigation
│   │   └── MainNavigator.tsx    # Main app navigation
│   ├── services/                # Business logic and API services
│   ├── hooks/                   # Custom React hooks
│   ├── context/                 # React Context providers
│   │   ├── AuthContext.tsx      # Authentication context
│   │   └── AppStateContext.tsx  # App state context
│   ├── lib/                     # Third-party library configurations
│   │   ├── supabase.ts          # Supabase client
│   │   └── config.ts            # App configuration
│   ├── types/                   # TypeScript type definitions
│   │   └── index.ts             # All type definitions
│   └── utils/                   # Utility functions
│       ├── storage.ts           # Secure storage utilities
│       └── errors.ts            # Error handling
├── PRD.md                       # Product Requirements Document
├── ARCHITECTURE.md              # Architecture documentation
└── README.md                    # Project README
```

## Development Workflow

### Build Order (Follow Strictly)

1. ✅ **Project Scaffolding** (Complete)
2. ⏳ **Permission & Capability Layer** (Next)
3. ⏳ **Authentication**
4. ⏳ **Location Tracking (iOS-safe)**
5. ⏳ **Push Notification Infrastructure**
6. ⏳ **Emergency System**
7. ⏳ **Check-ins**
8. ⏳ **Chat**
9. ⏳ **Audio Calls**
10. ⏳ **Video Calls**
11. ⏳ **Subscriptions**
12. ⏳ **Bodyguard Booking**
13. ⏳ **History & Dashboards**

### Running Type Checks

```bash
npm run typecheck
```

### Running Linter

```bash
npm run lint
```

## iOS Development Notes

⚠️ **Important iOS Constraints:**
- No background JavaScript execution
- No background WebSocket connections
- System-driven location updates only
- Push notification-driven background updates

See `ARCHITECTURE.md` for detailed iOS architecture guidelines.

## Supabase Setup

1. Create a new Supabase project
2. Get your project URL and anon key
3. Add them to `.env` file
4. Set up database schema (will be provided in subsequent steps)

## Next Steps

After completing the setup:

1. Set up Supabase project and get credentials
2. Configure environment variables
3. Proceed to Step 2: Permission & Capability Layer

