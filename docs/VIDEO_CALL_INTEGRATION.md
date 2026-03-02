# Video Call System Integration

## Overview
This document tracks the integration of the full video call system from the old app to the new app.

## Components Copied
1. ✅ `StreamVideoCallDedicated.tsx` - Main video call UI component
2. ✅ `VideoMonitorModal.tsx` - Modal to start video monitoring
3. ✅ `streamVideoSdkLoader.ts` - Stream SDK loader utility
4. ✅ `video.client.ts` - Stream.io client service (new, simplified)
5. ✅ `VideoMonitorModal.styles.ts` - Styles for video monitor modal

## Services Created
1. ✅ `video.client.ts` - Stream.io client initialization and user connection
2. ✅ `streamVideoServiceDedicated.ts` - Wrapper service for compatibility
3. ✅ `simpleCall.service.ts` - Simple call session management
4. ✅ `subscriptionAccess.ts` - Subscription access checking utility
5. ✅ `callPriority.ts` - Call priority flag management
6. ✅ `logger.ts` - Simple logger utility
7. ✅ `time.ts` - Time formatting utilities
8. ✅ `interactionGuard.ts` - Interaction guard utilities
9. ✅ `sessionCache.ts` - Session cache utility
10. ✅ `mediaRecovery.ts` - Media recovery utility
11. ✅ `backgroundCallNotification.service.ts` - Background notification service
12. ✅ `useInCallAudio.ts` - In-call audio hook

## Integration Steps

### Step 1: Update Video Service ✅
- [x] Update `createCallSession` to generate room codes like old app: `call-${shortUserId}-${timestamp}`
- [x] Ensure room codes are max 50 characters
- [x] Match old app's database insert pattern

### Step 2: Fix StreamVideoCallDedicated ✅
- [x] Fix imports to use new app's services
- [x] Replace `streamVideoServiceDedicated` with wrapper service
- [x] Remove iOS background processing code
- [x] Fix component structure (unreachable code)

### Step 3: Fix VideoMonitorModal ✅
- [x] Fix imports to use `@/` aliases
- [x] Update subscription access checks
- [x] Remove iOS background processing code

### Step 4: Integrate with HomeScreen ✅
- [x] Add video call state management
- [x] Add VideoMonitorModal to HomeScreen
- [x] Add StreamVideoCallDedicated rendering when call is active
- [x] Create `startCall` function
- [x] Handle camera permissions
- [x] Connect service cards to modals

### Step 2: Fix StreamVideoCallDedicated
- [ ] Replace `streamVideoServiceDedicated` imports with `streamVideoClientService`
- [ ] Remove old app dependencies (backgroundCallNotification, MediaRecovery, etc.)
- [ ] Adapt to use new app's video hooks
- [ ] Fix all import paths

### Step 3: Fix VideoMonitorModal
- [ ] Remove iOS background processing code
- [ ] Use new app's `useVideoCall` hook
- [ ] Use new app's subscription guards
- [ ] Fix import paths

### Step 4: Integrate with HomeScreen
- [ ] Add video call state management
- [ ] Connect VideoMonitorModal to video service card
- [ ] Handle call session creation and navigation
- [ ] Add StreamVideoCallDedicated rendering when call is active

## Room Code Generation Pattern (Old App)
```typescript
const sanitizedUserId = userId.replace(/\./g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase();
const shortUserId = sanitizedUserId.substring(0, 8);
const timestamp = Date.now().toString().slice(-8);
const roomCode = `call-${shortUserId}-${timestamp}`;
```

## Database Schema
- `call_sessions` table: `id`, `call_type`, `mobile_user_id`, `room_code`, `status`, `priority`, `context_reason`
- `video_sessions` table: `session_id`, `mobile_user_id`, `room_code`, `status`, `session_type`

## Next Steps
1. Update video.service.ts room code generation
2. Fix StreamVideoCallDedicated imports
3. Fix VideoMonitorModal
4. Integrate with HomeScreen

