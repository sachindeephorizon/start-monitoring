# Feature Migration Plan

## Architecture Differences

### Old App
- Monolithic services in `src/services/`
- All logic in App.tsx
- iOS background processing in UI components
- Direct service calls from components

### New App
- Modular features in `src/features/` (guards, hooks, services, types)
- Clean separation: UI components are pure, logic in features
- iOS-first: No background processing in UI
- Feature guards for subscription/permission checks

## Migration Order (Dependencies First)

### Phase 1: Core UI Components
1. ✅ SlideMenu (navigation)
2. ✅ ServiceModal (common wrapper)
3. ✅ DatePickerModal
4. ✅ ModernTimePicker
5. ✅ Common modals (PasskeyModal, etc.)

### Phase 2: Feature Modals (UI Only)
1. ✅ LocationTrackingModal (for tracking feature)
2. ✅ CheckInModal (for check-in feature)
3. ✅ BodyguardModal (for bodyguard feature)
4. ✅ VideoMonitorModal (for video feature)
5. ✅ Audio call UI components
6. ✅ ChatBox (for chat feature)

### Phase 3: Feature Integration
1. Emergency - Connect EmergencyButton to emergency feature hooks
2. Tracking - Connect LocationTrackingModal to tracking feature hooks
3. Check-in - Connect CheckInModal to check-in feature hooks
4. Bodyguard - Connect BodyguardModal to bodyguard feature hooks
5. Video - Connect VideoMonitorModal to video feature hooks
6. Audio - Connect audio UI to audio feature hooks
7. Chat - Connect ChatBox to chat feature hooks

### Phase 4: HomeScreen Integration
1. Connect all service cards to their respective modals
2. Implement navigation flow
3. Add loading states and error handling

## Implementation Strategy

For each feature:
1. **Copy UI components** (modals, buttons, etc.) - NO background processing
2. **Adapt to new architecture**:
   - Use feature hooks instead of direct service calls
   - Use feature guards for permission/subscription checks
   - Remove iOS background processing logic
   - Use new app's navigation system
3. **Test integration** with existing feature services

## Files to Copy

### Components
- `src/components/navigation/SlideMenu.tsx` + styles
- `src/components/common/ServiceModal.tsx` + styles
- `src/components/DatePickerModal.tsx`
- `src/components/ModernTimePicker.tsx`
- `src/components/modals/LocationTrackingModal.tsx`
- `src/components/modals/CheckInModal.tsx` + styles
- `src/components/modals/BodyguardModal.tsx`
- `src/components/modals/VideoMonitorModal.tsx` + styles
- `src/components/chat/ChatBox.tsx` + styles
- Audio call interface components

### Styles
- All corresponding `.styles.ts` files

### Utils (if needed)
- Date/time formatting utilities
- Validation utilities

