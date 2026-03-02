# DeepHorizon Security App - Architecture Documentation

## Overview

This document describes the high-level architecture of the DeepHorizon Security mobile application, with special attention to iOS background execution constraints.

## Core Architectural Principle

**The mobile app is a thin client.**

- All timing, scheduling, escalation, and critical logic lives on the server
- The app captures user intent, requests permissions, sends events immediately, and reacts to pushes
- The backend owns time, state, escalation, and reliability

## iOS Background Execution Rules

### ❌ FORBIDDEN

- NO continuous background JavaScript execution
- NO background WebSocket connections
- NO JS timers for critical logic
- NO polling-based tracking
- NO "Android-style" services

### ✅ ALLOWED

- Background location updates (system-driven)
- Push notifications (APNs)
- Foreground execution
- Audio background mode (for calls only)

## Technology Stack

### Mobile App
- **Framework**: React Native with Expo SDK 54+
- **Language**: TypeScript 5.9.3
- **Runtime**: Hermes JavaScript Engine
- **State Management**: React Context API + React Hooks
- **Navigation**: React Navigation 7.x

### Backend Services
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth (with 2FA OTP)
- **Real-time**: Supabase Realtime (foreground only)
- **Video/Audio**: Stream.io WebRTC
- **Push Notifications**: Firebase FCM / Apple APNs
- **Payments**: Razorpay

## Project Structure

```
deephorizon-security/
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
│   │   ├── supabase.ts     # Supabase client
│   │   └── config.ts       # App configuration
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
│       ├── storage.ts      # Secure storage utilities
│       └── errors.ts       # Error handling
```

## Key Architectural Decisions

### 1. Location Tracking

**iOS-Safe Implementation:**
- Uses `expo-location` with system-driven location updates
- NO JavaScript intervals or polling
- Location updates are sent immediately when received
- Server handles tracking session logic and state

**Background Behavior:**
- iOS: System delivers location updates via native callbacks
- App sends location to server immediately on callback
- No background JavaScript execution required

### 2. Real-Time Communication

**Foreground Only:**
- Supabase Realtime subscriptions exist ONLY in foreground
- Background messages use push notifications
- Reconnections happen cleanly on app resume

### 3. Check-Ins & Scheduling

**Server-Side Scheduling:**
- ALL scheduling happens on the backend
- Mobile app NEVER waits for time
- Missed check-ins detected server-side
- Escalations are server-driven via push notifications

### 4. Video & Audio Calls

**Video Calls:**
- Require foreground execution
- Use Stream.io WebRTC SDK

**Audio Calls:**
- May use background audio mode (iOS allowed)
- Incoming calls MUST use push notifications
- App handles cold-start from push

### 5. Emergency System

**Immediate Actions:**
- User presses emergency button
- Location captured immediately
- Event sent to server immediately
- Server handles routing and escalation
- Push notifications notify user of agent response

### 6. Push Notifications

**Primary Background Update Mechanism:**
- All background updates delivered via push
- No polling or background connections
- App handles cold-start from notification
- Notification handlers trigger appropriate app flows

## Data Flow Patterns

### User Action → Server → Push Notification

1. User performs action (e.g., starts tracking)
2. App sends event to server immediately
3. Server processes and schedules/escalates as needed
4. Server sends push notification when action needed
5. App receives push and updates UI accordingly

### Server Event → Push Notification → App Update

1. Server detects event (e.g., missed check-in)
2. Server sends push notification
3. App receives push (even if in background)
4. App handles notification and updates UI
5. User sees updated state

## Security Considerations

- **Authentication**: Supabase Auth with JWT tokens
- **Passkeys**: Stored securely in iOS Keychain (via SecureStore)
- **API Security**: Row-level security (RLS) in Supabase
- **Data Encryption**: Encrypted in transit (HTTPS/WSS) and at rest (database encryption)

## Build & Deployment

- **Development**: Expo Dev Client
- **Build**: EAS Build (Expo Application Services)
- **Platforms**: iOS (App Store) and Android (Google Play)
- **Project ID**: 27fb532d-c0f0-45e5-919e-0e7b9a62366d

## Development Status

This project is being built incrementally following a strict build order:

1. ✅ Project Scaffolding (Complete)
2. ⏳ Permission & Capability Layer
3. ⏳ Authentication
4. ⏳ Location Tracking (iOS-safe)
5. ⏳ Push Notification Infrastructure
6. ⏳ Emergency System
7. ⏳ Check-ins
8. ⏳ Chat
9. ⏳ Audio Calls
10. ⏳ Video Calls
11. ⏳ Subscriptions
12. ⏳ Bodyguard Booking
13. ⏳ History & Dashboards

