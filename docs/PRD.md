# DeepHorizon Security App - Product Requirements Document

## 1. Product Overview

DeepHorizon is a comprehensive personal security and safety application designed to provide real-time protection, monitoring, and emergency response services. The platform consists of two main components:

1. **Mobile Application** - A mobile app for end users (individuals and families) to access security services, request assistance, and stay connected with security agents
2. **Agent Dashboard** - A web-based dashboard for security agents and administrators to monitor users, respond to emergencies, manage assignments, and coordinate security operations

The platform enables users to access professional security services including real-time location tracking, emergency response, video/audio monitoring, scheduled check-ins, bodyguard booking, and direct communication with security personnel.

---

## 2. User Types and Roles

### 2.1 End Users (Mobile App)

**Individual Users**
- Regular users who subscribe to individual plans
- Can access all personal security features
- Limited to their own account and data

**Family Plan Users**
- Primary account holder who manages the family subscription
- Can add up to 5 family members to their subscription
- Each family member has their own account with independent access
- Primary account holder can manage family members (add/remove)

### 2.2 Security Agents (Dashboard)

**Agent**
- Standard security personnel with basic monitoring capabilities
- Can view alerts, respond to calls, update status, and view incidents
- Assigned to users for monitoring and response

**Senior Agent**
- Experienced agent with additional reporting access
- All Agent permissions plus: create reports, view analytics

**Supervisor**
- Team leader with agent management capabilities
- All Senior Agent permissions plus: manage team, escalate incidents

**Administrator**
- Full system access with user and system management
- Complete access to all features and system configuration

---

## 3. Mobile Application Features

### 3.1 Authentication & Profile Management

**User Registration & Login**
- Email and password-based registration
- Email and password-based login
- Session management with automatic token refresh
- Logout functionality

**Passkey System**
- 4-digit passkey setup and configuration
- Passkey verification for critical actions (emergency, check-ins)
- Passkey recovery and reset options
- Secure passkey storage

**Profile Management**
- View and update user profile information (name, email, phone)
- Profile photo upload and management
- View subscription status and plan details
- Update security settings including passkey
- View account creation date and activity

### 3.2 Real-Time Location Tracking

**Location Tracking Sessions**
- Start and stop location tracking sessions
- Configurable tracking intervals (15 minutes, 30 minutes, 1 hour, 2 hours, 4 hours, 8 hours, 24 hours)
- Background location tracking that continues when app is minimized
- Real-time location updates sent to security agents
- Location accuracy indicators
- Network type detection (WiFi, cellular, etc.)

**Tracking Features**
- Automatic location capture during tracking sessions
- Location history for past tracking sessions
- View active tracking session status and duration
- Countdown timer showing time until next location update
- Scheduled check-ins during tracking sessions (optional)
- Location data includes coordinates, timestamp, accuracy, and network information

**Tracking Session Management**
- Create new tracking sessions with custom duration
- View all active and past tracking sessions
- End tracking sessions manually
- Automatic session termination when duration expires
- Session status indicators (active, completed, ended)

### 3.3 Emergency Response System

**Emergency Button**
- Large, prominent emergency button on home screen
- Instant emergency alert creation with location capture
- Automatic agent routing based on priority and availability
- Emergency countdown timer (configurable timeout)
- Passkey verification required to confirm emergency (prevents accidental activation)
- Automatic escalation if no response within timeout period

**Emergency Features**
- Automatic location capture and transmission
- Emergency description/context input
- Real-time emergency status updates
- Direct connection to security agents
- Emergency video call escalation option
- Emergency services dispatch option
- Emergency alert history

**Emergency Response Flow**
1. User presses emergency button
2. Passkey verification prompt appears
3. Location is automatically captured
4. Emergency alert is created and routed to available agents
5. Agent receives notification and can respond
6. Video/audio call can be initiated by agent or user
7. Emergency can be resolved and marked as complete

### 3.4 Video Monitoring & Calls

**Video Monitoring**
- Initiate video monitoring sessions with security agents
- Real-time video streaming using WebRTC technology
- Camera and microphone controls (enable/disable)
- Video quality indicators
- Connection status monitoring
- Session duration tracking

**Video Call Features**
- Start video calls from multiple entry points:
  - Direct video call button
  - Emergency escalation to video
  - Scheduled check-in escalation
  - Agent-initiated video calls
- Video call interface with controls:
  - Camera on/off toggle
  - Microphone mute/unmute
  - End call button
  - Connection quality indicators
- Call session management and history
- Automatic call session creation in database
- Room code generation for call sessions

**Video Call Types**
- **Monitoring Sessions**: Regular video monitoring for safety
- **Emergency Calls**: High-priority video calls during emergencies
- **Scheduled Calls**: Pre-arranged video monitoring sessions

### 3.5 Audio Calls

**Audio Call Features**
- Initiate audio-only calls with security agents
- Audio call interface with controls:
  - Microphone mute/unmute
  - Speaker/earpiece toggle
  - End call button
  - Call duration display
- Background audio call support
- Audio call session management
- Connection quality monitoring

**Audio Call Use Cases**
- Emergency situations requiring voice communication
- Tracking session check-ins
- Quick status updates with agents
- Low-bandwidth scenarios

### 3.6 Scheduled Check-Ins

**Check-In Scheduling**
- Schedule one-time or recurring check-ins
- Set date and time for check-ins
- Add custom messages/notes for check-ins
- Specify location for check-in (optional)
- Recurring check-in options:
  - Daily
  - Weekly
  - Custom frequency

**Check-In Completion**
- Automatic notification when check-in time arrives
- Passkey verification required to complete check-in
- Location capture during check-in (optional)
- Response time tracking
- Automatic agent notification if check-in is missed or overdue

**Check-In Features**
- View all scheduled check-ins (upcoming, completed, missed)
- Edit or cancel scheduled check-ins
- Check-in history with timestamps
- Integration with tracking sessions (tracking check-ins)
- Escalation to video/audio call if check-in is not completed
- Check-in status indicators (pending, completed, missed, overdue)

**Check-In Types**
- **Regular Check-Ins**: Standard scheduled safety check-ins
- **Tracking Check-Ins**: Check-ins during active tracking sessions
- **Emergency Check-Ins**: High-priority check-ins with shorter timeout

### 3.7 Real-Time Chat

**Chat Features**
- Real-time messaging with assigned security agents
- Instant message delivery and receipt
- Message read receipts
- Chat history persistence
- Automatic agent assignment when chat is initiated
- Chat request status tracking (pending, assigned, active, closed)

**Chat Functionality**
- Send and receive text messages
- View conversation history
- Chat interface with message bubbles
- Timestamp display for each message
- Chat notifications
- Multiple concurrent chat sessions support
- Chat priority levels (low, medium, high, emergency)

**Chat Categories**
- General inquiries
- Emergency assistance
- Technical support
- Billing questions
- Safety concerns

### 3.8 Subscription Management

**Subscription Plans**

**Individual Plans:**
- **Monthly Individual Plan**: ₹149/month
  - Personal safety tracking
  - Emergency alerts
  - 5 video monitoring sessions per month
  - Location sharing
- **Yearly Individual Plan**: ₹1,639/year
  - All monthly features
  - 2 months free (equivalent to ₹136.58/month)

**Family Plans:**
- **Monthly Family Plan**: ₹649/month
  - Up to 5 family members
  - Family safety tracking
  - Emergency alerts for all members
  - 5 video monitoring sessions per month (shared)
  - Location sharing
- **Yearly Family Plan**: ₹7,139/year
  - All monthly family features
  - 2 months free (equivalent to ₹594.92/month)

**Subscription Features**
- View current subscription plan and status
- View subscription expiration date
- View trial period information (if applicable)
- Upgrade or change subscription plans
- View subscription history
- Payment method management
- Coupon code support for discounts
- Subscription renewal notifications

**Family Member Management** (Family Plans Only)
- Add family members by phone number, name, and email
- Remove family members from plan
- View all family members and their status
- Each family member has independent account access
- Family member limit: 5 members total

### 3.9 Bodyguard Service Booking

**Booking Features**
- Book bodyguard services through the app
- Select number of bodyguards required (1 or more)
- Specify booking date and time
- Select city/location for service
- Add reason/description for bodyguard requirement
- Add special requirements or instructions
- Location picker for precise service location

**Booking Management**
- View all past and upcoming bookings
- Booking status tracking (pending, confirmed, active, completed, cancelled)
- View assigned bodyguard information (when assigned)
- Booking history with details
- Cancel bookings (if allowed)

**Booking Information Captured**
- Number of guards needed
- Service date and time
- Service duration (start and end time)
- City/location
- Pickup location
- Drop location
- Reason for service
- Special requirements/instructions

### 3.10 Emergency Contacts

**Contact Management**
- Add emergency contacts with:
  - Name
  - Phone number
  - Relationship/relation
  - Optional additional information
- View all saved emergency contacts
- Edit emergency contact information
- Delete emergency contacts
- Quick access to emergency contacts during emergencies

**Emergency Contact Features**
- Secure storage of contact information
- Quick dial functionality
- Contact information available to agents during emergencies
- Contact verification and validation

### 3.11 History & Activity

**History Features**
- View comprehensive activity history including:
  - **Tracking Sessions**: All past location tracking sessions with dates, durations, and locations
  - **Check-Ins**: All scheduled check-ins (completed, missed, overdue)
  - **Emergency Alerts**: All emergency alerts with timestamps and resolution status
  - **Video Calls**: History of video monitoring and call sessions
  - **Audio Calls**: History of audio call sessions
  - **Bodyguard Bookings**: All past and current bookings

**History Details**
- Filter history by type (tracking, check-ins, emergencies, calls, bookings)
- View detailed information for each history item
- Date and time stamps for all activities
- Status indicators for each activity
- Location data for tracking and emergencies
- Duration information for calls and tracking sessions

### 3.12 Additional Features

**Notifications**
- Push notifications for:
  - Emergency alerts
  - Check-in reminders
  - Agent messages
  - Call requests
  - Booking confirmations
  - Subscription updates

**Settings & Preferences**
- Notification preferences
- Location permission management
- Privacy settings
- App preferences and configuration

**Policies & Legal**
- View terms of service
- View privacy policy
- View refund policy
- Legal information and compliance

---

## 4. Agent Dashboard Features

### 4.1 Dashboard Overview

**Main Dashboard**
- Real-time overview of all active operations
- Key metrics and statistics:
  - Active emergencies count
  - Active users count
  - Active calls count
  - Pending check-ins count
  - New bookings count
- Real-time updates via WebSocket connections
- Visual indicators for urgent items

**Dashboard Sections**
- Ready Response Alerts (Emergency management)
- Track Me Console (Location tracking management)
- Scheduled Checks (Check-in management)
- Bodyguard Bookings (Booking management)
- Agent Chat (User communication)

### 4.2 Emergency Management (Ready Response Alerts)

**Emergency Alert Features**
- View all active emergency alerts in real-time
- Emergency alert details:
  - User information (name, phone, email)
  - Emergency description
  - Location (map view and coordinates)
  - Timestamp
  - Priority level
  - Status (active, in-progress, resolved)
- Automatic agent assignment based on routing rules
- Manual emergency claim/assignment
- Emergency escalation capabilities

**Emergency Actions**
- Claim emergency alerts
- Start video call with user
- Start audio call with user
- Resolve emergency alerts
- Add notes to emergencies
- View emergency history
- Escalate to supervisor if needed

**Emergency Routing**
- Intelligent routing based on:
  - Agent availability
  - Agent workload
  - Agent location (if available)
  - Agent expertise/specialization
  - Emergency priority
- Automatic assignment to available agents
- Load balancing across agents
- Fallback routing if primary agent unavailable

### 4.3 Location Tracking Management (Track Me Console)

**Tracking Session Monitoring**
- View all active tracking sessions
- Real-time location updates for tracked users
- User status indicators:
  - Active (tracking in progress)
  - Overdue (missed check-in)
  - Missed (check-in not completed)
- Map view showing user locations
- Location history for each session

**Tracking Features**
- View user details for each tracking session
- Start video call with tracked user
- Start audio call with tracked user
- Send messages to tracked users
- View tracking session duration
- View next check-in time (if scheduled)
- End tracking session (if authorized)

**Tracking Statistics**
- Total users being tracked
- Active tracking sessions count
- Overdue check-ins count
- Missed check-ins count

### 4.4 Scheduled Check-In Management

**Check-In Monitoring**
- View all scheduled check-ins
- Check-in status tracking:
  - Pending (upcoming)
  - Active (check-in time arrived, waiting for completion)
  - Completed (user completed check-in)
  - Missed (user did not complete check-in)
  - Overdue (past due time, not completed)
- Real-time check-in status updates
- Check-in notifications and alerts

**Check-In Features**
- View check-in details:
  - User information
  - Scheduled time
  - Custom message/notes
  - Location (if specified)
  - Response time (if completed)
- Start video call if check-in is missed/overdue
- Start audio call if check-in is missed/overdue
- Send reminder messages
- View check-in history
- Escalate missed check-ins

**Check-In Actions**
- Monitor check-in completion
- Respond to missed check-ins
- Contact user if check-in not completed
- Add notes to check-ins
- View passkey attempt history (if applicable)

### 4.5 Bodyguard Booking Management

**Booking Management Features**
- View all bodyguard booking requests
- Booking status tracking:
  - Pending (awaiting assignment)
  - Confirmed (bodyguard assigned)
  - Active (service in progress)
  - Completed (service finished)
  - Cancelled
- Filter bookings by status
- Sort bookings by date, priority, status

**Booking Details**
- View complete booking information:
  - User/client information
  - Number of guards requested
  - Service date and time
  - Service duration
  - Location (pickup and drop)
  - Reason for service
  - Special requirements
- View assigned bodyguard information
- Booking history and notes

**Bodyguard Assignment**
- View available bodyguards
- Assign bodyguards to bookings
- Create bodyguard assignments with:
  - Guard selection
  - Client information
  - Pickup location
  - Drop location
  - Start and end time
  - Special instructions
- View assignment status
- Update assignment details
- Complete or cancel assignments

**Bodyguard Management**
- View all bodyguards in system
- View bodyguard availability
- View bodyguard assignment history
- Bodyguard status tracking (available, assigned, on-duty)

### 4.6 Agent Chat System

**Chat Management**
- Real-time chat interface with users
- View all active chat conversations
- Chat assignment management:
  - Automatic assignment to available agents
  - Manual assignment/reassignment
  - Load balancing across agents
- Chat request status tracking

**Chat Features**
- Send and receive messages with users
- View conversation history
- Message read receipts
- Chat notifications
- Multiple concurrent chat support
- Chat priority levels
- Chat categories (general, emergency, technical, billing, safety)

**Chat Actions**
- Initiate chat with users
- Respond to chat requests
- Transfer chat to another agent
- Close chat conversations
- Add notes to conversations
- Escalate chat to supervisor if needed

### 4.7 Video & Audio Call Management

**Call Session Management**
- View all active video and audio call sessions
- Call session details:
  - User information
  - Call type (video/audio)
  - Call status (initiating, connecting, active, ended)
  - Call duration
  - Room code/session ID
  - Agent information
- Real-time call status updates

**Call Features**
- Join video calls with users
- Join audio calls with users
- Initiate video calls to users
- Initiate audio calls to users
- End call sessions
- View call history
- Call quality monitoring

**Call Interface**
- Video call interface with:
  - Video feed display
  - Camera controls
  - Microphone controls
  - Screen sharing (if available)
  - Call duration display
- Audio call interface with:
  - Microphone controls
  - Speaker controls
  - Call duration display

### 4.8 User Management

**User Information**
- View user profiles and details
- View user subscription status
- View user activity history
- View user location (if tracking active)
- View user emergency contacts
- View user medical information (if provided)

**User Actions**
- Contact users via chat, video, or audio
- View user tracking sessions
- View user check-in history
- View user emergency history
- View user booking history
- Add notes to user profiles

### 4.9 Agent Settings & Profile

**Agent Profile Management**
- View and update agent profile information
- Update agent availability status
- Set maximum concurrent call limit
- View agent statistics and performance
- View agent assignment history

**Dashboard Settings**
- Theme preferences (light/dark mode)
- Notification preferences
- Dashboard layout customization
- Auto-refresh settings
- Session timeout configuration

**Security Settings**
- Password management
- Two-factor authentication (if available)
- Session management
- Role and permissions view
- Security audit logs

### 4.10 Reporting & Analytics

**Reports Available** (Senior Agent and above)
- Emergency response reports
- Call session reports
- Check-in completion reports
- Booking reports
- Agent performance reports
- User activity reports

**Analytics** (Senior Agent and above)
- Dashboard statistics and trends
- Response time analytics
- Agent workload distribution
- User engagement metrics
- Service utilization statistics

### 4.11 Team Management (Supervisor and above)

**Agent Management**
- View all agents and their status
- Assign agents to users/emergencies
- View agent workload
- Manage agent availability
- Agent performance monitoring

**Incident Escalation**
- Escalate incidents to supervisors
- View escalated incidents
- Resolve escalated incidents
- Add escalation notes

---

## 5. Core System Features

### 5.1 Real-Time Communication

**Real-Time Updates**
- WebSocket connections for instant updates
- Real-time emergency alerts
- Real-time location updates
- Real-time chat messages
- Real-time call session updates
- Real-time check-in status updates
- Real-time booking status updates

**Notification System**
- Push notifications for mobile app
- Browser notifications for dashboard
- Email notifications (if configured)
- SMS notifications (if configured)
- In-app notification badges and indicators

### 5.2 Security & Authentication

**Security Features**
- Secure authentication with token-based sessions
- Passkey system for critical actions
- Row-level security (RLS) for data access
- Encrypted data transmission
- Secure API endpoints
- Role-based access control (RBAC)

**Data Privacy**
- User data encryption
- Secure location data storage
- Privacy controls for users
- GDPR compliance features (if applicable)
- Data retention policies

### 5.3 Payment Processing

**Payment Integration**
- Razorpay payment gateway integration
- Payment gateway integration (Razorpay)
- Secure payment processing
- Subscription payment handling
- Payment verification and validation
- Payment history tracking
- Refund processing (if applicable)
- Coupon code support

**Payment Features**
- Multiple payment methods support
- Payment status tracking
- Automatic subscription renewal
- Payment failure handling
- Invoice generation

### 5.4 Data Management

**Data Storage**
- User profiles and preferences
- Location tracking data
- Emergency alert history
- Check-in records
- Call session records
- Chat message history
- Booking records
- Subscription information

**Data Retention**
- Historical data storage
- Data archival policies
- Data deletion policies
- Backup and recovery

---

## 6. User Flows

### 6.1 New User Onboarding Flow

1. User downloads and opens mobile app
2. User views subscription plans (public view)
3. User selects a subscription plan
4. User registers with email and password
5. User completes profile setup (name, phone)
6. User sets up 4-digit passkey
7. User completes payment
8. Subscription is activated
9. User is taken to home screen
10. User can now access all features

### 6.2 Emergency Response Flow

1. User presses emergency button on home screen
2. Passkey verification prompt appears
3. User enters passkey to confirm emergency
4. Location is automatically captured
5. Emergency alert is created in system
6. Alert is routed to available agent(s)
7. Agent receives notification and alert
8. Agent claims/accepts emergency
9. Agent can:
   - Start video call with user
   - Start audio call with user
   - Send chat message
   - View user location
10. Emergency is resolved by agent
11. Emergency record is saved to history

### 6.3 Location Tracking Flow

1. User starts location tracking session
2. User selects tracking interval (15 min, 30 min, etc.)
3. User selects session duration
4. Tracking session is created
5. Location updates are sent periodically
6. Agent can view real-time location on dashboard
7. Optional: Scheduled check-ins during tracking
8. User can stop tracking manually
9. Session ends automatically when duration expires
10. Session data is saved to history

### 6.4 Scheduled Check-In Flow

1. User schedules a check-in (date, time, message)
2. Check-in is saved and scheduled
3. At scheduled time, user receives notification
4. Check-in modal appears with passkey prompt
5. User enters passkey to complete check-in
6. Location is captured (if enabled)
7. Check-in is marked as completed
8. Agent is notified of completion
9. If check-in is missed:
   - Agent receives notification
   - Agent can start video/audio call
   - Check-in is marked as missed/overdue

### 6.5 Video Monitoring Flow

1. User initiates video monitoring session
2. Call session is created in system
3. Room code is generated
4. Agent is assigned/notified
5. Video call interface opens
6. User and agent connect via WebRTC
7. Video and audio streams are established
8. User can toggle camera/microphone
9. Agent can monitor user via video
10. Either party can end call
11. Call session is saved to history

### 6.6 Bodyguard Booking Flow

1. User opens bodyguard booking feature
2. User enters booking details:
   - Number of guards
   - Date and time
   - Location/city
   - Reason
   - Special requirements
3. Booking request is submitted
4. Booking appears in agent dashboard (pending)
5. Agent reviews booking details
6. Agent assigns available bodyguard(s)
7. Assignment details are created
8. User receives confirmation
9. On service date, bodyguard is dispatched
10. Service is completed
11. Booking is marked as completed

### 6.7 Chat Communication Flow

1. User initiates chat with security agent
2. Chat request is created
3. Available agent is automatically assigned
4. Chat interface opens for user
5. Agent receives chat notification
6. Agent opens chat interface
7. Real-time messaging begins
8. Messages are delivered instantly
9. Chat history is maintained
10. Agent can close chat when resolved
11. Chat record is saved

### 6.8 Family Plan Management Flow

1. Primary user subscribes to family plan
2. Primary user navigates to family management
3. Primary user adds family member (phone, name, email)
4. Family member receives invitation/notification
5. Family member creates their own account
6. Family member is linked to family subscription
7. Family member can access all features
8. Primary user can view all family members
9. Primary user can remove family members
10. Each family member has independent access

---

## 7. Subscription Plans Details

### 7.1 Individual Monthly Plan
- **Price**: ₹149/month
- **Features**:
  - Personal safety tracking
  - Emergency alerts
  - 5 video monitoring sessions per month
  - Location sharing
  - All core security features

### 7.2 Individual Yearly Plan
- **Price**: ₹1,639/year (equivalent to ₹136.58/month)
- **Features**:
  - All Monthly Individual features
  - 2 months free (savings of ₹298)
  - Same feature set as monthly plan

### 7.3 Family Monthly Plan
- **Price**: ₹649/month
- **Features**:
  - Up to 5 family members
  - Family safety tracking for all members
  - Emergency alerts for all members
  - 5 video monitoring sessions per month (shared across family)
  - Location sharing
  - All core security features for all members

### 7.4 Family Yearly Plan
- **Price**: ₹7,139/year (equivalent to ₹594.92/month)
- **Features**:
  - All Monthly Family features
  - 2 months free (savings of ₹1,298)
  - Same feature set as monthly family plan

### 7.5 Subscription Features (All Plans)
- Real-time location tracking
- Emergency response system
- Video and audio calls
- Scheduled check-ins
- Real-time chat with agents
- Bodyguard booking
- Emergency contacts management
- Activity history
- Profile management

### 7.6 Video Session Limits
- All plans include 5 video monitoring sessions per month
- Sessions are counted per subscription (shared for family plans)
- Additional sessions may be available (subject to plan terms)

---

## 8. Key Differentiators

### 8.1 Comprehensive Security Platform
- All-in-one solution combining multiple security services
- Real-time monitoring and response capabilities
- Professional security agent network

### 8.2 Family Safety Focus
- Family plan support for protecting multiple family members
- Independent accounts for each family member
- Shared subscription benefits

### 8.3 Real-Time Communication
- Instant emergency response
- Real-time location tracking
- Live video/audio monitoring
- Instant chat with security agents

### 8.4 Professional Services
- Bodyguard booking and assignment
- Scheduled check-ins with verification
- 24/7 security agent availability
- Intelligent agent routing

### 8.5 User-Centric Design
- Simple, intuitive mobile app interface
- Easy emergency activation
- Comprehensive history and activity tracking
- Flexible subscription options

---

## 9. System Architecture & Third-Party Services

### 9.1 System Architecture Overview

The DeepHorizon platform follows a **client-server architecture** with real-time capabilities:

**Architecture Components:**
1. **Mobile Application** (React Native/Expo) - Client-side mobile app for iOS and Android
2. **Agent Dashboard** (Next.js Web Application) - Web-based dashboard for security agents
3. **Backend Services** - Supabase (Database, Auth, Realtime, Storage) + Custom API routes
4. **Third-Party Services** - Stream.io (Video/Audio), Payment Gateways, Firebase (Push Notifications)

**Communication Flow:**
- Mobile App ↔ Supabase (Database, Auth, Realtime)
- Mobile App ↔ Stream.io (Video/Audio Calls)
- Mobile App ↔ Agent Dashboard API (Custom endpoints)
- Agent Dashboard ↔ Supabase (Database, Auth, Realtime)
- Agent Dashboard ↔ Stream.io (Video/Audio Calls)
- Agent Dashboard ↔ Firebase Admin (Push Notifications)
- Both Apps ↔ Payment Gateways (Razorpay)

### 9.2 Mobile Application Architecture

**Framework & Core Technologies:**
- **Framework**: React Native with Expo SDK 54.0.27
- **Language**: TypeScript 5.9.3
- **Runtime**: Hermes JavaScript Engine (iOS & Android)
- **State Management**: React Context API + React Hooks
- **Navigation**: React Navigation 7.x (Stack Navigator)

**Build & Deployment:**
- **Build System**: Expo Application Services (EAS Build)
- **Development**: Expo Dev Client
- **Production**: EAS Build for App Store and Google Play
- **Project ID**: 27fb532d-c0f0-45e5-919e-0e7b9a62366d

**Mobile App Dependencies:**

**Core React Native:**
- `react`: 19.1.0
- `react-native`: 0.81.5
- `react-dom`: 19.1.0
- `@react-navigation/native`: ^7.1.21
- `@react-navigation/stack`: ^7.6.5

**Expo SDK Modules:**
- `expo`: ~54.0.27 (Core Expo framework)
- `expo-application`: ~7.0.8 (App information)
- `expo-asset`: ~12.0.11 (Asset management)
- `expo-audio`: ~1.1.0 (Audio playback)
- `expo-camera`: ~17.0.10 (Camera access for video calls)
- `expo-constants`: ~18.0.11 (App constants)
- `expo-crypto`: ~15.0.8 (Cryptographic functions)
- `expo-dev-client`: ~6.0.20 (Development client)
- `expo-keep-awake`: ~15.0.8 (Prevent screen sleep)
- `expo-device`: ~8.0.10 (Device information)
- `expo-font`: ~14.0.10 (Custom fonts)
- `expo-linear-gradient`: ~15.0.8 (Gradient UI)
- `expo-location`: ~19.0.8 (Location tracking - **Critical for tracking feature**)
- `expo-notifications`: ^0.32.14 (Push notifications)
- `expo-secure-store`: ~15.0.8 (Secure storage for tokens/passkeys)
- `expo-status-bar`: ~3.0.9 (Status bar control)
- `expo-task-manager`: ~14.0.9 (Background tasks)
- `expo-video`: ~3.0.15 (Video playback)

**Database & Backend:**
- `@supabase/supabase-js`: ^2.84.0 (**Primary backend** - Database, Auth, Realtime)

**Video/Audio Communication:**
- `@stream-io/video-react-native-sdk`: ^1.24.6 (**Video/Audio calls** - Primary communication SDK)
- `@stream-io/react-native-webrtc`: ^137.0.0 (WebRTC implementation for Stream.io)

**Payment Gateways:**
- `react-native-razorpay`: ^2.3.1 (**Payment processing** - Razorpay integration)

**UI & Utilities:**
- `@expo/vector-icons`: ^15.0.3 (Icon library)
- `@react-native-async-storage/async-storage`: 2.2.0 (Local storage)
- `@react-native-community/datetimepicker`: 8.4.4 (Date/time pickers)
- `@react-native-community/netinfo`: ^11.4.1 (Network status)
- `react-native-fast-image`: ^8.6.3 (Optimized image loading)
- `react-native-gesture-handler`: ~2.28.0 (Gesture handling)
- `react-native-safe-area-context`: ~5.6.0 (Safe area handling)
- `react-native-screens`: ~4.16.0 (Native screen management)
- `react-native-svg`: 15.12.1 (SVG rendering)
- `react-native-shadow-2`: ^7.1.2 (Shadow effects)
- `react-native-modal`: ^14.0.0-rc.1 (Modal dialogs)
- `react-native-modal-datetime-picker`: ^18.0.0 (DateTime picker modal)

**Audio/Video Call Management:**
- `react-native-incall-manager`: ^4.2.1 (**Call management** - Audio routing, speaker/earpiece control)

**Security & Authentication:**
- `bcrypt`: ^6.0.0 (Password hashing for passkeys)
- `jsonwebtoken`: ^9.0.3 (JWT token handling)
- `react-native-jwt-io`: ^1.0.0 (JWT utilities)
- `react-native-get-random-values`: ~1.11.0 (Cryptographic random values)
- `uuid`: ^13.0.0 (UUID generation)

**Notifications:**
- `@notifee/react-native`: ^9.1.8 (**Local notifications** - Android foreground notifications)

**Utilities:**
- `dayjs`: ^1.11.19 (Date manipulation)
- `node-fetch`: ^3.3.2 (HTTP requests)
- `react-native-dotenv`: ^3.4.11 (Environment variables)
- `react-native-webview`: 13.15.0 (WebView for payment flows)
- `event-target-shim`: ^6.0.2 (Event target polyfill)
- `patch-package`: ^8.0.1 (Package patching)

**Where Mobile App Services Are Used:**

1. **Supabase** (`@supabase/supabase-js`)
   - **Location**: `src/lib/supabase.ts`
   - **Usage**: 
     - User authentication (login, signup, session management)
     - Database operations (user profiles, emergencies, tracking sessions, check-ins, bookings)
     - Real-time subscriptions (emergency alerts, chat messages, location updates)
     - Row-level security (RLS) policies enforcement
     - File storage (profile photos, documents)

2. **Stream.io** (`@stream-io/video-react-native-sdk`)
   - **Location**: `src/services/streamVideoServiceDedicated.ts`, `src/components/StreamVideoCallDedicated.tsx`
   - **Usage**:
     - Video monitoring sessions
     - Video emergency calls
     - Audio-only calls
     - WebRTC-based real-time communication
     - Call session management

3. **Razorpay** (`react-native-razorpay`)
   - **Location**: `src/screens/SubscriptionPlansScreen.tsx`
   - **Usage**:
     - Subscription payment processing
     - Payment gateway integration
     - Order creation and verification
     - Payment callback handling

4. **Expo Location** (`expo-location`)
   - **Location**: `src/hooks/useLocation.ts`, `src/services/trackingService.ts`
   - **Usage**:
     - Real-time location tracking
     - Background location updates
     - Location permission management
     - GPS coordinate capture

5. **Expo Notifications** (`expo-notifications`)
   - **Location**: `src/services/notification.service.ts`
   - **Usage**:
     - Push notification registration
     - Local notification scheduling
     - Check-in reminders
     - Emergency alerts

6. **Notifee** (`@notifee/react-native`)
   - **Location**: Background notification handling
   - **Usage**:
     - Android foreground service notifications
     - Background location tracking notifications
     - Call notifications

### 9.3 Agent Dashboard Architecture

**Framework & Core Technologies:**
- **Framework**: Next.js 15.5.9 (App Router)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 3.4.1
- **State Management**: React Hooks + Context API
- **UI Components**: Custom components with Lucide React icons

**Agent Dashboard Dependencies:**

**Core Framework:**
- `next`: 15.5.9
- `react`: ^18.3.1
- `react-dom`: ^18.3.1
- `typescript`: ^5

**Database & Backend:**
- `@supabase/supabase-js`: ^2.77.0 (**Primary backend**)
- `@supabase/auth-helpers-nextjs`: ^0.10.0 (Next.js auth helpers)

**Video/Audio Communication:**
- `@stream-io/video-react-sdk`: ^1.23.1 (**Video/Audio calls**)

**Payment Gateways:**
- `razorpay`: ^2.9.6 (**Payment processing**)

**Authentication & Security:**
- `bcryptjs`: ^3.0.2 (Password hashing)
- `jsonwebtoken`: ^9.0.2 (JWT handling)
- `jose`: ^5.10.0 (JWT signing/verification)

**Push Notifications:**
- `firebase-admin`: ^13.6.0 (**Firebase Cloud Messaging** - Push notifications to mobile app)

**UI & Styling:**
- `tailwindcss`: ^3.4.1 (CSS framework)
- `lucide-react`: ^0.525.0 (Icon library)
- `postcss`: ^8 (CSS processing)

**Utilities:**
- `rxjs`: ^7.8.2 (Reactive programming)
- `uuid`: ^13.0.0 (UUID generation)
- `uuid4`: ^2.0.3 (UUID v4 generation)
- `node-fetch`: ^3.3.2 (HTTP requests)
- `dotenv`: ^17.2.1 (Environment variables)

**Testing:**
- `jest`: ^30.1.2 (Testing framework)
- `@testing-library/react`: ^16.3.0 (React testing utilities)
- `@testing-library/jest-dom`: ^6.8.0 (Jest DOM matchers)

**Where Agent Dashboard Services Are Used:**

1. **Supabase** (`@supabase/supabase-js`)
   - **Location**: `src/lib/supabase.ts`, `src/lib/supabaseAdmin.ts`
   - **Usage**:
     - Agent authentication
     - Database queries (emergencies, users, bookings, check-ins)
     - Real-time subscriptions (emergency alerts, call sessions, chat messages)
     - Admin operations (bypassing RLS when needed)

2. **Stream.io** (`@stream-io/video-react-sdk`)
   - **Location**: `src/components/VideoMonitor.tsx`, `src/components/AudioMonitor.tsx`
   - **Usage**:
     - Video call interface for agents
     - Audio call interface for agents
     - WebRTC-based communication with users

3. **Firebase Admin** (`firebase-admin`)
   - **Location**: `src/lib/firebase-admin.ts`, `src/services/fcmService.ts`
   - **Usage**:
     - Push notifications to mobile app users
     - Firebase Cloud Messaging (FCM)
     - Notification delivery to iOS and Android devices

4. **Razorpay** (`razorpay`)
   - **Location**: `src/app/api/payments/razorpay/`
   - **Usage**:
     - Payment order creation
     - Payment verification
     - Subscription payment processing
     - Webhook handling

5. **Payment Gateway** (Razorpay)
   - **Usage**:
     - Alternative payment gateway
     - Payment processing
     - Payment verification

### 9.4 Third-Party Services & APIs

**1. Supabase (Primary Backend Service)**
- **Service Type**: Backend-as-a-Service (BaaS)
- **Services Used**:
  - **PostgreSQL Database**: Primary database for all application data
  - **Supabase Auth**: User and agent authentication
  - **Supabase Realtime**: WebSocket-based real-time updates
  - **Supabase Storage**: File storage for images and documents
  - **Row Level Security (RLS)**: Database-level access control
- **Where Used**:
  - Mobile App: All database operations, authentication, real-time subscriptions
  - Agent Dashboard: All database operations, authentication, real-time subscriptions
- **Configuration**: 
  - Environment variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - Service role key for admin operations

**2. Stream.io (Video/Audio Communication)**
- **Service Type**: Video/Audio Communication Platform
- **Services Used**:
  - **Stream Video SDK**: WebRTC-based video and audio calls
  - **Stream Chat SDK**: Real-time chat (legacy, partially used)
- **Where Used**:
  - Mobile App: Video monitoring, emergency video calls, audio calls
  - Agent Dashboard: Video monitoring interface, audio call interface
- **Configuration**:
  - Stream API Key
  - Stream Secret (server-side only)
  - Stream App ID: `hp84m8c435v6`
  - Token generation endpoints: `/api/stream/video-token`, `/api/stream/audio-token`

**3. Razorpay (Payment Gateway)**
- **Service Type**: Payment Processing
- **Services Used**:
  - Payment gateway integration
  - Subscription payment processing
  - Order management
  - Webhook handling
- **Where Used**:
  - Mobile App: Payment initiation via React Native SDK
  - Agent Dashboard: Payment verification, order creation, webhook processing
- **Configuration**:
  - Razorpay Key ID
  - Razorpay Key Secret
  - Payment callback URLs

**4. Payment Gateway (Razorpay)**
- **Service Type**: Payment Processing (Alternative)
- **Services Used**:
  - Payment gateway integration
  - Payment processing
- **Where Used**:
  - Agent Dashboard: Payment API routes
- **Configuration**:
  - Razorpay API credentials
  - Payment verification endpoints

**5. Firebase Cloud Messaging (FCM)**
- **Service Type**: Push Notification Service
- **Services Used**:
  - Firebase Admin SDK
  - Firebase Cloud Messaging
  - Push notification delivery
- **Where Used**:
  - Agent Dashboard: Sending push notifications to mobile app users
- **Configuration**:
  - Firebase service account JSON file
  - FCM server key
  - Firebase project configuration

**6. Expo Application Services (EAS)**
- **Service Type**: Build & Deployment Service
- **Services Used**:
  - EAS Build: Cloud-based app builds
  - EAS Submit: App store submission
- **Where Used**:
  - Mobile App: Building iOS and Android apps
- **Configuration**:
  - EAS project ID: `27fb532d-c0f0-45e5-919e-0e7b9a62366d`
  - Build profiles: development, preview, production

**7. Google Services (Android)**
- **Service Type**: Mobile Platform Services
- **Services Used**:
  - Google Services (Firebase integration for Android)
  - Google Play Services
- **Where Used**:
  - Mobile App: Android push notifications, Firebase integration
- **Configuration**:
  - `google-services.json` file (Android)

**8. Apple Push Notification Service (APNs)**
- **Service Type**: Push Notification Service
- **Services Used**:
  - APNs for iOS push notifications
- **Where Used**:
  - Mobile App: iOS push notifications
- **Configuration**:
  - APNs certificates/keys
  - Bundle identifier: `com.deephorizon.security`

**9. Vercel (Deployment Platform)**
- **Service Type**: Hosting & Deployment
- **Services Used**:
  - Next.js application hosting
  - Serverless function execution
  - Edge network distribution
- **Where Used**:
  - Agent Dashboard: Production deployment
- **Configuration**:
  - Vercel project settings
  - Environment variables
  - Custom domain: `deep-horizon-dashboard.vercel.app`

### 9.5 Backend Infrastructure

**Database Schema (Supabase PostgreSQL):**
- `mobile_users` - User profiles and settings
- `users` - Agent accounts
- `emergencies` - Emergency alerts and responses
- `call_sessions` - Video/audio call session management
- `tracking_sessions` - Location tracking data
- `tracking_locations` - Individual location points
- `checkins` / `scheduled_checks` - Check-in scheduling and completion
- `bodyguard_bookings` - Bodyguard service bookings
- `bodyguard_assignments` - Bodyguard assignment records
- `bodyguards` - Bodyguard profiles
- `user_subscriptions` - Subscription records
- `family_members` - Family plan members
- `chat_requests` - Chat request management
- `messages` - Chat message storage
- `user_agent_map` - Agent assignment mapping
- `incident_logs` - Audit trail and incident logging

**API Architecture:**
- **Next.js API Routes**: Custom backend endpoints in agent dashboard
- **Supabase RPC Functions**: Database stored procedures
- **Stream.io Token Generation**: Server-side token creation for video/audio calls
- **Payment Gateway Webhooks**: Callback endpoints for payment processing

**Real-Time Communication:**
- **Supabase Realtime**: WebSocket connections for live updates
- **Stream.io WebRTC**: Peer-to-peer video/audio communication
- **Firebase FCM**: Push notification delivery

**Security & Authentication:**
- **Supabase Auth**: JWT-based authentication
- **Row Level Security (RLS)**: Database-level access control
- **API Route Authentication**: Token-based API security
- **Passkey System**: Custom 4-digit passkey verification

### 9.6 Environment Variables & Configuration

**Mobile App Environment Variables:**
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `EXPO_PUBLIC_STREAM_API_KEY` - Stream.io API key
- `EXPO_PUBLIC_STREAM_TOKEN_URL` - Stream token generation endpoint
- `EXPO_PUBLIC_AGENT_DASHBOARD_URL` - Agent dashboard URL
- `EXPO_PUBLIC_STREAM_APP_ID` - Stream application ID
- `EXPO_PUBLIC_DEMO_PASSKEY` - Default passkey for development
- `EXPO_PUBLIC_ENV` - Environment (development/production)

**Agent Dashboard Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (admin)
- `STREAM_API_KEY` - Stream.io API key
- `STREAM_API_SECRET` - Stream.io API secret
- `RAZORPAY_KEY_ID` - Razorpay key ID
- `RAZORPAY_KEY_SECRET` - Razorpay key secret
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Firebase service account file path
- `NEXT_PUBLIC_APP_URL` - Application URL for callbacks

### 9.7 Build & Deployment Architecture

**Mobile App Build Process:**
1. **Development**: Expo Dev Client for local development
2. **Preview Builds**: EAS Build with APK/IPA distribution
3. **Production Builds**: EAS Build for App Store/Play Store
4. **Build Profiles**: Development, Preview, Production
5. **Platforms**: iOS (simulator & device), Android (APK & App Bundle)

**Agent Dashboard Deployment:**
1. **Development**: Local Next.js development server
2. **Production**: Vercel deployment with serverless functions
3. **Build Process**: Next.js build with TypeScript compilation
4. **Environment**: Node.js 18-24 runtime

**CI/CD:**
- EAS Build for mobile app automation
- Vercel automatic deployments for dashboard
- Environment-specific configurations

---

## 10. Platform Requirements

### 9.1 Mobile Application
- **Platforms**: iOS and Android
- **Minimum Requirements**: 
  - iOS: iOS 13.0 or later
  - Android: Android 8.0 (API level 26) or later
- **Permissions Required**:
  - Location services (foreground and background)
  - Camera access (for video calls)
  - Microphone access (for audio/video calls)
  - Notifications
  - Network access

### 9.2 Agent Dashboard
- **Platform**: Web-based (responsive design)
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Requirements**:
  - Internet connection
  - Modern browser with JavaScript enabled
  - WebRTC support (for video/audio calls)

### 9.3 Backend Services
- Real-time database with WebSocket support
- Video/audio calling infrastructure (WebRTC)
- Payment gateway integration
- Push notification services
- Location services
- Authentication and authorization services

---

## 11. Success Metrics

### 11.1 User Engagement
- Active users count
- Daily/weekly/monthly active users
- Feature usage statistics
- Session duration
- Emergency response usage

### 11.2 Service Quality
- Emergency response time
- Check-in completion rate
- Call connection success rate
- Agent response time
- User satisfaction ratings

### 11.3 Business Metrics
- Subscription conversion rate
- Subscription retention rate
- Average revenue per user (ARPU)
- Family plan adoption rate
- Bodyguard booking completion rate

## 12. Complete Database Schema Documentation

This section provides complete details of all database tables, columns, data types, relationships, indexes, and constraints. This documentation is essential for rebuilding the application and ensuring proper communication with the existing database and agent dashboard.

### 12.1 Database Overview

**Database System**: PostgreSQL (via Supabase)
**Schema**: `public`
**Extensions Used**:
- `pgcrypto` - For cryptographic functions (passkey hashing)
- `uuid-ossp` - For UUID generation

**Row Level Security (RLS)**: Enabled on all tables
**Real-time Subscriptions**: Enabled on key tables for live updates

### 12.2 Core User Tables

#### 12.2.1 `mobile_users` Table

**Purpose**: Stores profile information for mobile app users (end users/customers)

**Primary Key**: `id` (UUID, references `auth.users(id)`)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | - | Primary key, references `auth.users(id)` ON DELETE CASCADE |
| `email` | varchar(255) | NOT NULL | - | User's email address |
| `name` | varchar(255) | NULL | - | User's full name |
| `phone` | varchar(20) | NULL | - | User's phone number |
| `emergency_passkey_hash` | varchar(255) | NULL | - | bcrypt hash of 4-digit emergency passkey |
| `passkey_setup_completed` | boolean | NULL | false | Whether user has completed passkey setup |
| `emergency_contact_name` | varchar(255) | NULL | - | Name of emergency contact |
| `emergency_contact_phone` | varchar(20) | NULL | - | Phone number of emergency contact |
| `emergency_contact_relationship` | varchar(100) | NULL | - | Relationship to emergency contact |
| `medical_conditions` | text | NULL | - | Medical conditions information |
| `allergies` | text | NULL | - | Allergies information |
| `medications` | text | NULL | - | Current medications |
| `blood_type` | varchar(10) | NULL | - | Blood type |
| `share_location` | boolean | NULL | true | Privacy setting for location sharing |
| `share_medical_info` | boolean | NULL | false | Privacy setting for medical info sharing |
| `is_verified` | boolean | NULL | false | Account verification status |
| `safety_companion_acknowledged` | boolean | NULL | - | Whether user acknowledged safety companion feature |
| `state_of_residence` | varchar(100) | NULL | - | State of residence (added in migration) |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Record last update timestamp |

**Indexes**:
- `idx_mobile_users_email` ON `email`
- `idx_mobile_users_phone` ON `phone`
- `idx_mobile_users_state` ON `state_of_residence`

**Foreign Keys**:
- `id` â†’ `auth.users(id)` ON DELETE CASCADE

**RLS Policies**:
- Users can access their own records (`auth.uid() = id`)
- Agents can read mobile_users for tracking purposes

**Triggers**:
- `set_updated_at_mobile_users` - Updates `updated_at` on row update

---

#### 12.2.2 `users` Table

**Purpose**: Stores profile information for security agents and administrators

**Primary Key**: `id` (UUID, references `auth.users(id)`)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | - | Primary key, references `auth.users(id)` ON DELETE CASCADE |
| `email` | varchar(255) | NOT NULL | - | Agent's email address |
| `name` | varchar(255) | NOT NULL | - | Agent's full name |
| `role` | varchar(50) | NULL | 'agent' | Role: 'agent' or 'admin' (CHECK constraint) |
| `current_emergency_count` | integer | NULL | 0 | Number of active emergencies assigned |
| `is_available` | boolean | NULL | true | Agent availability status |
| `max_concurrent_calls` | integer | NULL | 3 | Maximum concurrent calls agent can handle |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Record last update timestamp |

**Indexes**:
- `idx_users_email` ON `email`
- `idx_users_role` ON `role`
- `idx_users_available` ON `is_available` WHERE `is_available = true`

**Foreign Keys**:
- `id` â†’ `auth.users(id)` ON DELETE CASCADE

**RLS Policies**:
- Users can access their own records (`auth.uid() = id`)
- Agents can read other users (for team visibility)

**Triggers**:
- `set_updated_at_users` - Updates `updated_at` on row update

---

### 12.3 Call Session Tables

#### 12.3.1 `call_sessions` Table

**Purpose**: Main table tracking all video and audio call sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` ON DELETE CASCADE |
| `user_name` | varchar(255) | NOT NULL | - | User's name at time of call |
| `user_phone` | varchar(20) | NULL | - | User's phone at time of call |
| `agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent |
| `agent_name` | varchar(255) | NULL | - | Agent's name |
| `agent_joined` | boolean | NULL | false | Whether agent has joined the call |
| `call_type` | varchar(20) | NOT NULL | - | 'audio' or 'video' (CHECK constraint) |
| `status` | varchar(20) | NOT NULL | 'initiating' | Status: 'initiating', 'pending', 'connecting', 'active', 'ended', 'cancelled', 'failed' (CHECK constraint) |
| `priority` | varchar(20) | NULL | 'medium' | Priority: 'low', 'medium', 'high', 'emergency' (CHECK constraint) |
| `room_code` | varchar(50) | NOT NULL | - | Stream.io room code for the call |
| `session_id` | varchar(100) | NULL | - | Stream.io session ID |
| `user_location` | jsonb | NULL | - | User's location at call start (JSON object) |
| `context_reason` | text | NULL | - | Reason/context for the call |
| `is_escalated` | boolean | NULL | false | Whether call has been escalated |
| `escalation_reason` | text | NULL | - | Reason for escalation |
| `escalation_timestamp` | timestamptz | NULL | - | When call was escalated |
| `escalated_by_agent_id` | uuid | NULL | - | References `users(id)` - Agent who escalated |
| `escalation_notes` | text | NULL | - | Notes about escalation |
| `user_state_of_residence` | varchar(100) | NULL | - | User's state at time of call (added in migration) |
| `created_at` | timestamptz | NULL | now() | Call creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |
| `started_at` | timestamptz | NULL | - | When call actually started |
| `ended_at` | timestamptz | NULL | - | When call ended |

**Indexes**:
- `idx_call_sessions_mobile_user_id` ON `mobile_user_id`
- `idx_call_sessions_agent_id` ON `agent_id`
- `idx_call_sessions_call_type` ON `call_type`
- `idx_call_sessions_status` ON `status`
- `idx_call_sessions_room_code` ON `room_code`
- `idx_call_sessions_created_at` ON `created_at`

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE
- `agent_id` â†’ `users(id)`
- `escalated_by_agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own call sessions
- Agents can read all call sessions
- Agents can update assigned call sessions

**Triggers**:
- `set_updated_at_call_sessions` - Updates `updated_at` on row update

---

#### 12.3.2 `video_sessions` Table

**Purpose**: Detailed tracking for video call sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `session_id` | uuid | NOT NULL | - | References `call_sessions(id)` ON DELETE CASCADE |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` ON DELETE CASCADE |
| `agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent |
| `session_type` | varchar(20) | NOT NULL | 'emergency' | Type: 'monitoring', 'emergency', 'scheduled' (CHECK constraint) |
| `status` | varchar(20) | NOT NULL | 'waiting' | Status: 'waiting', 'connecting', 'connected', 'ended', 'failed' (CHECK constraint) |
| `room_code` | varchar(50) | NOT NULL | - | Stream.io room code |
| `video_enabled` | boolean | NULL | true | Whether video is enabled |
| `audio_enabled` | boolean | NULL | true | Whether audio is enabled |
| `screen_share_enabled` | boolean | NULL | false | Whether screen sharing is enabled |
| `created_at` | timestamptz | NULL | now() | Session creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |
| `connected_at` | timestamptz | NULL | - | When connection was established |
| `ended_at` | timestamptz | NULL | - | When session ended |

**Indexes**:
- `idx_video_sessions_session_id` ON `session_id`
- `idx_video_sessions_mobile_user_id` ON `mobile_user_id`
- `idx_video_sessions_agent_id` ON `agent_id`
- `idx_video_sessions_status` ON `status`

**Foreign Keys**:
- `session_id` â†’ `call_sessions(id)` ON DELETE CASCADE
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE
- `agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own video sessions
- Agents can read video sessions

**Triggers**:
- `set_updated_at_video_sessions` - Updates `updated_at` on row update

---

#### 12.3.3 `audio_sessions` Table

**Purpose**: Detailed tracking for audio-only call sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `session_id` | uuid | NOT NULL | - | References `call_sessions(id)` ON DELETE CASCADE |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` ON DELETE CASCADE |
| `agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent |
| `session_type` | varchar(20) | NOT NULL | 'emergency' | Type: 'monitoring', 'emergency', 'scheduled' (CHECK constraint) |
| `status` | varchar(20) | NOT NULL | 'waiting' | Status: 'waiting', 'connecting', 'connected', 'ended', 'failed' (CHECK constraint) |
| `room_code` | varchar(50) | NOT NULL | - | Stream.io room code |
| `audio_quality` | varchar(20) | NULL | 'high' | Quality: 'low', 'medium', 'high' (CHECK constraint) |
| `noise_cancellation` | boolean | NULL | true | Whether noise cancellation is enabled |
| `created_at` | timestamptz | NULL | now() | Session creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |
| `connected_at` | timestamptz | NULL | - | When connection was established |
| `ended_at` | timestamptz | NULL | - | When session ended |

**Indexes**:
- `idx_audio_sessions_session_id` ON `session_id`
- `idx_audio_sessions_mobile_user_id` ON `mobile_user_id`
- `idx_audio_sessions_agent_id` ON `agent_id`
- `idx_audio_sessions_status` ON `status`

**Foreign Keys**:
- `session_id` â†’ `call_sessions(id)` ON DELETE CASCADE
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE
- `agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own audio sessions
- Agents can read audio sessions

**Triggers**:
- `set_updated_at_audio_sessions` - Updates `updated_at` on row update

---

### 12.4 Tracking System Tables

#### 12.4.1 `tracking_sessions` Table

**Purpose**: Tracks active location tracking sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` ON DELETE CASCADE |
| `session_name` | varchar(255) | NOT NULL | 'Track Me on the Go' | Name of the tracking session |
| `start_time` | timestamptz | NOT NULL | - | Session start time |
| `end_time` | timestamptz | NOT NULL | - | Scheduled session end time |
| `checkin_interval_minutes` | integer | NOT NULL | 15 | Minutes between scheduled check-ins |
| `use_account_passkey` | boolean | NOT NULL | true | Whether to use account passkey for check-ins |
| `status` | varchar(20) | NOT NULL | 'active' | Status: 'active', 'paused', 'completed', 'emergency' (CHECK constraint) |
| `initial_location` | jsonb | NULL | - | Location at session start (JSON object) |
| `last_known_location` | jsonb | NULL | - | Most recent location (JSON object) |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` - Assigned monitoring agent |
| `emergency_contact_phone` | varchar(20) | NULL | - | Emergency contact phone for this session |
| `agent_call_initiated_at` | timestamptz | NULL | - | When agent call was initiated |
| `agent_call_reason` | text | NULL | - | Reason for agent call |
| `agent_response_time_seconds` | integer | NULL | - | Agent response time in seconds |
| `created_at` | timestamptz | NULL | now() | Session creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |
| `completed_at` | timestamptz | NULL | - | When session was completed |

**Indexes**:
- `idx_tracking_sessions_mobile_user_id` ON `mobile_user_id`
- `idx_tracking_sessions_status` ON `status`
- `idx_tracking_sessions_assigned_agent` ON `assigned_agent_id`
- `idx_tracking_sessions_active` ON `mobile_user_id` WHERE `status = 'active'`
- `idx_tracking_sessions_mobile_user_status` ON `mobile_user_id, status`
- `idx_tracking_sessions_active_time` ON `start_time, end_time` WHERE `status = 'active'`
- `idx_tracking_sessions_agent_emergency` ON `assigned_agent_id, status` WHERE `status = 'emergency'`
- Unique index: `idx_tracking_sessions_unique_active_per_user` ON `mobile_user_id` WHERE `status = 'active'` (ensures one active session per user)

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE
- `assigned_agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own tracking sessions
- Agents can view assigned sessions or emergency sessions

**Triggers**:
- `set_updated_at_tracking_sessions` - Updates `updated_at` on row update
- `tracking_session_seed_checkin` - Automatically creates first check-in after session creation

---

#### 12.4.2 `tracking_checkins` Table

**Purpose**: Tracks scheduled check-ins during tracking sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `tracking_session_id` | uuid | NOT NULL | - | References `tracking_sessions(id)` ON DELETE CASCADE |
| `scheduled_time` | timestamptz | NOT NULL | - | When check-in is scheduled |
| `initiated_at` | timestamptz | NULL | now() | When check-in was initiated |
| `completed_at` | timestamptz | NULL | - | When check-in was completed |
| `status` | varchar(20) | NOT NULL | 'pending' | Status: 'pending', 'success', 'failed', 'timeout', 'missed' (CHECK constraint) |
| `passkey_attempts` | integer | NULL | 0 | Number of passkey attempts |
| `passkey_correct` | boolean | NULL | false | Whether correct passkey was entered |
| `response_time_seconds` | integer | NULL | - | Time taken to complete check-in |
| `location_at_checkin` | jsonb | NULL | - | Location when check-in occurred (JSON object) |
| `agent_call_triggered` | boolean | NULL | false | Whether agent call was triggered |
| `agent_call_reason` | varchar(100) | NULL | - | Reason for agent call |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent |
| `agent_notified_at` | timestamptz | NULL | - | When agent was notified |
| `agent_response_status` | varchar(20) | NULL | 'pending' | Agent response: 'pending', 'acknowledged', 'responding', 'resolved' (CHECK constraint) |
| `created_at` | timestamptz | NULL | now() | Check-in creation timestamp |

**Indexes**:
- `idx_tracking_checkins_session_id` ON `tracking_session_id`
- `idx_tracking_checkins_status` ON `status`
- `idx_tracking_checkins_scheduled_time` ON `scheduled_time`
- `idx_tracking_checkins_agent_calls` ON `assigned_agent_id` WHERE `agent_call_triggered = true`
- `idx_tracking_checkins_session_scheduled` ON `tracking_session_id, scheduled_time`
- `idx_tracking_checkins_status_pending` ON `status, scheduled_time` WHERE `status = 'pending'`

**Foreign Keys**:
- `tracking_session_id` â†’ `tracking_sessions(id)` ON DELETE CASCADE
- `assigned_agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access check-ins for their own sessions
- Agents can view check-ins for assigned sessions or emergency sessions
- Agents can update their assigned check-ins

**Triggers**:
- `tracking_checkin_status_trigger` - Automatically schedules next check-in on success, handles failed check-ins

---

#### 12.4.3 `tracking_locations` Table

**Purpose**: Stores individual location data points during tracking sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `tracking_session_id` | uuid | NOT NULL | - | References `tracking_sessions(id)` ON DELETE CASCADE |
| `latitude` | decimal(10,8) | NOT NULL | - | GPS latitude coordinate |
| `longitude` | decimal(11,8) | NOT NULL | - | GPS longitude coordinate |
| `accuracy` | decimal(8,2) | NULL | - | Location accuracy in meters |
| `altitude` | decimal(8,2) | NULL | - | Altitude in meters |
| `heading` | decimal(5,2) | NULL | - | Direction of travel in degrees |
| `speed` | decimal(8,2) | NULL | - | Speed in meters per second |
| `timestamp` | timestamptz | NULL | now() | When location was recorded |
| `recorded_during` | varchar(20) | NULL | 'tracking' | Context: 'tracking', 'checkin', 'emergency' (CHECK constraint) |
| `battery_level` | integer | NULL | - | Device battery level percentage |
| `network_type` | varchar(20) | NULL | - | Network type (WiFi, cellular, etc.) |

**Indexes**:
- `idx_tracking_locations_session_id` ON `tracking_session_id`
- `idx_tracking_locations_timestamp` ON `timestamp`
- `idx_tracking_locations_session_time` ON `tracking_session_id, timestamp`

**Foreign Keys**:
- `tracking_session_id` â†’ `tracking_sessions(id)` ON DELETE CASCADE

**RLS Policies**:
- Mobile users can access locations for their own sessions
- Agents can view locations for emergency sessions or assigned sessions

---

#### 12.4.4 `tracking_agent_actions` Table

**Purpose**: Logs actions taken by agents during tracking sessions

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `tracking_session_id` | uuid | NOT NULL | - | References `tracking_sessions(id)` ON DELETE CASCADE |
| `agent_id` | uuid | NOT NULL | - | References `users(id)` - Agent who took action |
| `action_type` | varchar(50) | NOT NULL | - | Action type: 'assigned', 'called_client', 'dispatched_help', 'resolved', 'escalated' (CHECK constraint) |
| `action_details` | text | NULL | - | Details about the action |
| `location_at_action` | jsonb | NULL | - | Location when action was taken (JSON object) |
| `created_at` | timestamptz | NULL | now() | Action timestamp |

**Indexes**:
- `idx_tracking_agent_actions_agent_id` ON `agent_id`
- `idx_tracking_agent_actions_session_id` ON `tracking_session_id`
- `idx_tracking_agent_actions_agent_time` ON `agent_id, created_at`

**Foreign Keys**:
- `tracking_session_id` â†’ `tracking_sessions(id)` ON DELETE CASCADE
- `agent_id` â†’ `users(id)`

**RLS Policies**:
- Agents can access their own actions
- Mobile users cannot access agent actions

---

### 12.5 Emergency Management Tables

#### 12.5.1 `emergencies` Table

**Purpose**: Tracks emergency alerts and responses

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NULL | - | References `mobile_users(id)` - User who triggered emergency (legacy field name) |
| `mobile_user_id` | uuid | NULL | - | References `mobile_users(id)` - User who triggered emergency |
| `description` | text | NULL | - | Emergency description/details |
| `status` | varchar(20) | NULL | - | Status: 'active', 'acknowledged', 'in_progress', 'resolved', 'escalated' |
| `priority` | varchar(20) | NULL | - | Priority level |
| `location` | jsonb | NULL | - | Emergency location (JSON object or PostGIS point) |
| `triggered_at` | timestamptz | NULL | now() | When emergency was triggered |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` - Assigned responding agent |
| `claimed_by` | uuid | NULL | - | References `users(id)` - Agent who claimed the emergency |
| `resolved_at` | timestamptz | NULL | - | When emergency was resolved |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- `idx_emergencies_mobile_user_id` ON `mobile_user_id`
- `idx_emergencies_assigned_agent_id` ON `assigned_agent_id`
- `idx_emergencies_status` ON `status`
- `idx_emergencies_triggered_at` ON `triggered_at`

**Foreign Keys**:
- `user_id` / `mobile_user_id` â†’ `mobile_users(id)`
- `assigned_agent_id` â†’ `users(id)`
- `claimed_by` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own emergencies
- Agents can read all emergencies
- Agents can update assigned emergencies

**Triggers**:
- `set_emergencies_updated_at` - Updates `updated_at` on row update

---

### 12.6 Check-In Tables

#### 12.6.1 `checkins` Table

**Purpose**: Tracks scheduled check-ins (separate from tracking check-ins)

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` - User who scheduled check-in |
| `scheduled_at` | timestamptz | NOT NULL | - | When check-in is scheduled |
| `frequency` | varchar(20) | NULL | - | Frequency: 'one-time', 'daily', 'weekly' |
| `status` | varchar(20) | NULL | 'pending' | Status: 'pending', 'completed', 'missed', 'cancelled', 'escalated' |
| `notes` | text | NULL | - | User notes for check-in |
| `passkey_attempts` | integer | NULL | 0 | Number of passkey attempts |
| `passkey_correct` | boolean | NULL | false | Whether correct passkey was entered |
| `response_time_seconds` | integer | NULL | - | Time to complete check-in |
| `location_at_checkin` | jsonb | NULL | - | Location when check-in occurred |
| `agent_call_triggered` | boolean | NULL | false | Whether agent call was triggered |
| `agent_call_reason` | varchar(100) | NULL | - | Reason for agent call |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent |
| `agent_notified_at` | timestamptz | NULL | - | When agent was notified |
| `agent_response_status` | varchar(20) | NULL | 'pending' | Agent response status |
| `completed_at` | timestamptz | NULL | - | When check-in was completed |
| `cancelled_at` | timestamptz | NULL | - | When check-in was cancelled |
| `archived_at` | timestamptz | NULL | - | When check-in was archived |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- `idx_checkins_status_pending` ON `status, scheduled_at` WHERE `status = 'pending'`
- `idx_checkins_agent_assigned` ON `assigned_agent_id, status` WHERE `assigned_agent_id IS NOT NULL`
- `idx_checkins_agent_calls` ON `assigned_agent_id, agent_call_triggered` WHERE `agent_call_triggered = true`
- `idx_checkins_scheduled_at` ON `scheduled_at`

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)`
- `assigned_agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own check-ins
- Agents can read assigned check-ins
- Agents can update assigned check-ins

**Triggers**:
- `handle_checkins_updated_at` - Updates `updated_at` on row update
- `auto_assign_agent_to_checkin_trigger` - Automatically assigns agent to pending check-ins

---

### 12.7 Chat System Tables

#### 12.7.1 `chat_requests` Table

**Purpose**: Manages chat request assignments between users and agents

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` ON DELETE CASCADE |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` ON DELETE SET NULL |
| `status` | varchar(20) | NOT NULL | 'pending' | Status: 'pending', 'assigned', 'active', 'closed' (CHECK constraint) |
| `priority` | varchar(20) | NULL | 'medium' | Priority: 'low', 'medium', 'high', 'emergency' (CHECK constraint) |
| `category` | varchar(20) | NULL | 'general' | Category: 'general', 'emergency', 'technical', 'billing', 'safety' (CHECK constraint) |
| `user_location` | jsonb | NULL | - | User location when chat was initiated |
| `user_info` | jsonb | NULL | - | Additional user information |
| `created_at` | timestamptz | NULL | now() | Request creation timestamp |
| `assigned_at` | timestamptz | NULL | - | When agent was assigned |
| `closed_at` | timestamptz | NULL | - | When chat was closed |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- `idx_chat_requests_status` ON `status`
- `idx_chat_requests_agent_id` ON `assigned_agent_id`
- `idx_chat_requests_mobile_user_id` ON `mobile_user_id`
- `idx_chat_requests_created_at` ON `created_at`

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE
- `assigned_agent_id` â†’ `users(id)` ON DELETE SET NULL

**RLS Policies**:
- Agents can read all chat requests
- Agents can update assigned chat requests
- Agents can insert chat requests

**Triggers**:
- `set_chat_requests_updated_at` - Updates `updated_at` on row update

**Real-time**: Enabled for live updates

---

#### 12.7.2 `agents` Table

**Purpose**: Tracks agent availability and chat load (legacy chat system)

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NOT NULL | - | References `auth.users(id)` ON DELETE CASCADE |
| `name` | text | NOT NULL | - | Agent name |
| `email` | text | NOT NULL | - | Agent email (UNIQUE) |
| `is_online` | boolean | NOT NULL | false | Online status |
| `current_chat_count` | integer | NOT NULL | 0 | Current number of active chats |
| `max_chat_count` | integer | NOT NULL | 3 | Maximum concurrent chats |
| `last_status_change` | timestamptz | NOT NULL | now() | Last status change timestamp |
| `created_at` | timestamptz | NOT NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NOT NULL | now() | Last update timestamp |

**Indexes**:
- Unique index on `email`

**Foreign Keys**:
- `user_id` â†’ `auth.users(id)` ON DELETE CASCADE

**RLS Policies**:
- Agents can access their own records
- Service role has full access

---

#### 12.7.3 `user_agent_map` Table

**Purpose**: Maps users to assigned agents for chat

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NOT NULL | - | References `auth.users(id)` ON DELETE CASCADE |
| `agent_id` | uuid | NOT NULL | - | References `agents(id)` ON DELETE RESTRICT |
| `is_active` | boolean | NOT NULL | true | Whether assignment is active |
| `created_at` | timestamptz | NOT NULL | now() | Assignment creation timestamp |
| `ended_at` | timestamptz | NULL | - | When assignment ended |

**Indexes**:
- `idx_user_agent_map_user_id` ON `user_id`
- `idx_user_agent_map_agent_id` ON `agent_id` WHERE `is_active = true`
- Unique index: `user_agent_map_one_active_per_user` ON `user_id` WHERE `is_active = true` (ensures one active assignment per user)

**Foreign Keys**:
- `user_id` â†’ `auth.users(id)` ON DELETE CASCADE
- `agent_id` â†’ `agents(id)` ON DELETE RESTRICT

**RLS Policies**:
- Users can access their own assignments
- Agents can access assignments where they are assigned
- Service role has full access

---

#### 12.7.4 `messages` Table

**Purpose**: Stores chat messages between users and agents

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NOT NULL | - | References `auth.users(id)` ON DELETE CASCADE |
| `agent_id` | uuid | NULL | - | References `agents(id)` ON DELETE SET NULL |
| `sender` | text | NOT NULL | - | Sender type: 'user', 'agent', 'system' (CHECK constraint) |
| `body` | text | NOT NULL | - | Message content |
| `metadata` | jsonb | NULL | - | Additional message metadata (JSON object) |
| `created_at` | timestamptz | NOT NULL | now() | Message timestamp |
| `read_at` | timestamptz | NULL | - | When message was read |

**Indexes**:
- `idx_messages_user_id_created_at` ON `user_id, created_at DESC`
- `idx_messages_agent_id_created_at` ON `agent_id, created_at DESC`

**Foreign Keys**:
- `user_id` â†’ `auth.users(id)` ON DELETE CASCADE
- `agent_id` â†’ `agents(id)` ON DELETE SET NULL

**RLS Policies**:
- Users can read/insert their own messages
- Agents can read/insert messages for assigned users
- Service role has full access

---

### 12.8 Bodyguard Service Tables

#### 12.8.1 `bodyguard_bookings` Table

**Purpose**: Stores bodyguard service booking requests

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` - User making booking |
| `service_type` | varchar(50) | NOT NULL | 'bodyguard' | Type of service (default: 'bodyguard') |
| `city` | varchar(100) | NULL | - | City where service is needed |
| `number_of_guards` | integer | NULL | - | Number of bodyguards requested |
| `start_date` | timestamptz | NULL | - | Service start date/time |
| `start_time` | timestamptz | NULL | - | Service start time (alternative field) |
| `end_date` | timestamptz | NULL | - | Service end date/time |
| `end_time` | timestamptz | NULL | - | Service end time (alternative field) |
| `location` | jsonb | NULL | - | Service location (JSON object with coordinates) |
| `description` | text | NULL | - | Booking description (includes reason and number of guards) |
| `reason` | text | NULL | - | Reason for bodyguard requirement |
| `special_requirements` | text | NULL | - | Special requirements or instructions |
| `status` | varchar(20) | NULL | 'pending' | Status: 'pending', 'confirmed', 'active', 'completed', 'cancelled' |
| `assigned_agent_id` | uuid | NULL | - | References `users(id)` - Assigned agent/bodyguard |
| `created_at` | timestamptz | NULL | now() | Booking creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `mobile_user_id`, `status`, `assigned_agent_id`

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)`
- `assigned_agent_id` â†’ `users(id)`

**RLS Policies**:
- Mobile users can access their own bookings
- Agents can read all bookings
- Agents can update bookings

---

#### 12.8.2 `bodyguard_assignments` Table

**Purpose**: Tracks bodyguard assignments to bookings

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `booking_id` | uuid | NULL | - | References `bodyguard_bookings(id)` - Related booking |
| `guard_id` | uuid | NOT NULL | - | References `bodyguards(id)` or `users(id)` - Assigned bodyguard |
| `client_name` | varchar(255) | NOT NULL | - | Client name |
| `client_contact` | varchar(20) | NOT NULL | - | Client contact phone |
| `pickup_location` | jsonb | NOT NULL | - | Pickup location (JSON object) |
| `drop_location` | jsonb | NOT NULL | - | Drop location (JSON object) |
| `start_time` | timestamptz | NOT NULL | - | Assignment start time |
| `end_time` | timestamptz | NULL | - | Assignment end time |
| `special_instructions` | text | NULL | - | Special instructions for bodyguard |
| `status` | varchar(20) | NOT NULL | 'active' | Status: 'active', 'completed', 'cancelled' (CHECK constraint, enum) |
| `created_at` | timestamptz | NULL | now() | Assignment creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `booking_id`, `guard_id`, `status`

**Foreign Keys**:
- `booking_id` â†’ `bodyguard_bookings(id)`
- `guard_id` â†’ `bodyguards(id)` or `users(id)`

**RLS Policies**:
- Agents can read assignments
- Agents can create assignments (via API with service role)

---

#### 12.8.3 `bodyguards` Table

**Purpose**: Stores bodyguard profiles and information

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NULL | - | References `auth.users(id)` or `users(id)` - Associated user account |
| `name` | varchar(255) | NOT NULL | - | Bodyguard name |
| `phone` | varchar(20) | NULL | - | Bodyguard phone number |
| `email` | varchar(255) | NULL | - | Bodyguard email |
| `is_available` | boolean | NULL | true | Availability status |
| `specialization` | varchar(100) | NULL | - | Specialization/qualifications |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `user_id`, `is_available`

**Foreign Keys**:
- `user_id` â†’ `auth.users(id)` or `users(id)`

**RLS Policies**:
- Bodyguards can read their own records
- Agents can read all bodyguards

---

### 12.9 Subscription Management Tables

#### 12.9.1 `user_subscriptions` Table

**Purpose**: Tracks user subscription plans and status

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NOT NULL | - | References `mobile_users(id)` - Subscribed user |
| `plan_id` | varchar(100) | NOT NULL | - | Subscription plan ID (e.g., 'plan_RIADHZ91GxVCUn') |
| `plan_name` | varchar(255) | NULL | - | Plan name (e.g., 'Monthly Individual Plan') |
| `plan_type` | varchar(50) | NULL | - | Plan type: 'individual' or 'family' |
| `billing_cycle` | varchar(20) | NULL | - | Billing cycle: 'monthly' or 'yearly' |
| `price` | decimal(10,2) | NULL | - | Subscription price |
| `currency` | varchar(10) | NULL | 'INR' | Currency code |
| `status` | varchar(20) | NULL | 'active' | Status: 'active', 'cancelled', 'expired', 'trial' |
| `trial_start_date` | timestamptz | NULL | - | Trial period start date |
| `trial_end_date` | timestamptz | NULL | - | Trial period end date |
| `start_date` | timestamptz | NULL | now() | Subscription start date |
| `end_date` | timestamptz | NULL | - | Subscription end date |
| `renewal_date` | timestamptz | NULL | - | Next renewal date |
| `payment_method` | varchar(50) | NULL | - | Payment method used |
| `payment_id` | varchar(255) | NULL | - | Payment gateway transaction ID |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `user_id`, `status`, `plan_id`

**Foreign Keys**:
- `user_id` â†’ `mobile_users(id)`

**RLS Policies**:
- Users can read their own subscriptions
- Users can read family subscriptions (for family plans)
- Users can insert/update their own subscriptions

---

#### 12.9.2 `family_members` Table

**Purpose**: Tracks family members added to family subscription plans

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `subscription_id` | uuid | NOT NULL | - | References `user_subscriptions(id)` - Parent subscription |
| `phone` | varchar(20) | NOT NULL | - | Family member phone number |
| `name` | varchar(255) | NULL | - | Family member name |
| `email` | varchar(255) | NULL | - | Family member email |
| `user_id` | uuid | NULL | - | References `mobile_users(id)` - If member has created account |
| `is_active` | boolean | NULL | true | Whether member is active |
| `added_at` | timestamptz | NULL | now() | When member was added |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `subscription_id`, `phone`, `user_id`

**Foreign Keys**:
- `subscription_id` â†’ `user_subscriptions(id)`
- `user_id` â†’ `mobile_users(id)`

**RLS Policies**:
- Users can read family members for their own subscriptions
- Family members can read their own records
- Users can insert/update family members in their subscriptions

---

### 12.10 Additional Tables

#### 12.10.1 `emergency_contacts` Table

**Purpose**: Stores additional emergency contacts (separate from mobile_users emergency contact fields)

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `mobile_user_id` | uuid | NOT NULL | - | References `mobile_users(id)` - Contact owner |
| `name` | varchar(255) | NOT NULL | - | Contact name |
| `phone` | varchar(20) | NOT NULL | - | Contact phone number |
| `relationship` | varchar(100) | NULL | - | Relationship to user |
| `is_primary` | boolean | NULL | false | Whether this is primary emergency contact |
| `created_at` | timestamptz | NULL | now() | Record creation timestamp |
| `updated_at` | timestamptz | NULL | now() | Last update timestamp |

**Indexes**:
- Indexes on `mobile_user_id`, `is_primary`

**Foreign Keys**:
- `mobile_user_id` â†’ `mobile_users(id)` ON DELETE CASCADE

**RLS Policies**:
- Users can access their own emergency contacts
- Users can insert/update/delete their own contacts

---

#### 12.10.2 `incident_logs` Table

**Purpose**: Audit trail for all incidents and system events

**Primary Key**: `id` (UUID)

**Columns**:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `id` | uuid | NOT NULL | gen_random_uuid() | Primary key |
| `user_id` | uuid | NULL | - | References `mobile_users(id)` - User involved |
| `event_type` | varchar(100) | NOT NULL | - | Event type (e.g., 'emergency', 'checkin', 'bodyguard_request') |
| `event_details` | jsonb | NULL | - | Event details (JSON object) |
| `timestamp` | timestamptz | NULL | now() | Event timestamp |
| `agent_id` | uuid | NULL | - | References `users(id)` - Agent involved (if applicable) |
| `location` | jsonb | NULL | - | Location data (JSON object) |

**Indexes**:
- Indexes on `user_id`, `event_type`, `timestamp`

**Foreign Keys**:
- `user_id` â†’ `mobile_users(id)`
- `agent_id` â†’ `users(id)`

**RLS Policies**:
- Users can read their own incident logs
- Agents can read all incident logs

---

### 12.11 Database Views

#### 12.11.1 `active_tracking_sessions` View

**Purpose**: Convenience view showing active tracking sessions with user and agent information

**Columns**: All columns from `tracking_sessions` plus:
- `mobile_user_email` (from `mobile_users`)
- `mobile_user_phone` (from `mobile_users`)
- `agent_email` (from `users`)

**Filter**: `status = 'active'`

**Security**: Uses `security_invoker = true` (RLS applies on base tables)

---

#### 12.11.2 `active_call_sessions` View

**Purpose**: Convenience view showing active call sessions with user and agent information

**Columns**: All columns from `call_sessions` plus:
- `mobile_user_email` (from `mobile_users`)
- `mobile_user_phone` (from `mobile_users`)
- `agent_email` (from `users`)

**Filter**: `status IN ('initiating', 'pending', 'connecting', 'active')`

**Security**: Uses `security_invoker = true` (RLS applies on base tables)

---

### 12.12 Database Functions (RPC)

#### 12.12.1 User Management Functions

**`create_mobile_user(user_id uuid, user_email text, user_name text, user_phone text)`**
- **Purpose**: Creates a new mobile user record
- **Returns**: void
- **Security**: SECURITY DEFINER
- **Usage**: Called during user registration

**`validate_mobile_passkey(user_id uuid, plain_passkey text)`**
- **Purpose**: Validates a passkey against stored hash
- **Returns**: boolean
- **Security**: SECURITY DEFINER
- **Usage**: Validates passkey during emergency/check-in

**`update_mobile_user_passkey_bcrypt(user_id uuid, plain_passkey text)`**
- **Purpose**: Updates user's passkey hash
- **Returns**: void
- **Security**: SECURITY DEFINER
- **Usage**: Updates passkey when user changes it

---

#### 12.12.2 Call Session Functions

**`create_call_session_with_video(p_mobile_user_id UUID, p_user_name TEXT, p_agent_id UUID, p_agent_name TEXT, p_call_type TEXT, p_room_code TEXT)`**
- **Purpose**: Atomically creates call session and video/audio session
- **Returns**: JSON with `call_session_id`, `video_session_id`, `audio_session_id`, `room_code`, `success`
- **Security**: SECURITY DEFINER
- **Usage**: Creates complete call session in one transaction

**`claim_call_session(session_id UUID, claiming_agent_id UUID, claiming_agent_name TEXT)`**
- **Purpose**: Allows agent to claim a call session
- **Returns**: boolean (success)
- **Security**: SECURITY DEFINER
- **Usage**: Agent claims unassigned call session

---

#### 12.12.3 Agent Management Functions

**`increment_agent_emergency_count(agent_id UUID)`**
- **Purpose**: Increments agent's active emergency count
- **Returns**: void
- **Security**: SECURITY DEFINER
- **Usage**: When emergency is assigned to agent

**`decrement_agent_emergency_count(agent_id UUID)`**
- **Purpose**: Decrements agent's active emergency count
- **Returns**: void
- **Security**: SECURITY DEFINER
- **Usage**: When emergency is resolved

---

#### 12.12.4 Tracking Functions

**`schedule_next_checkin(session_id uuid)`**
- **Purpose**: Automatically schedules next check-in for tracking session
- **Returns**: timestamptz (next check-in time) or null
- **Security**: SECURITY DEFINER
- **Usage**: Called after successful check-in completion

**`handle_failed_checkin(checkin_id uuid, failure_reason varchar(100))`**
- **Purpose**: Handles failed check-in, assigns agent, triggers emergency
- **Returns**: uuid (assigned agent ID)
- **Security**: SECURITY DEFINER
- **Usage**: Called when check-in fails or times out

**`auto_schedule_next_checkin()`**
- **Purpose**: Trigger function that schedules next check-in on success
- **Returns**: trigger
- **Usage**: Automatic trigger on check-in status update

**`auto_seed_first_checkin()`**
- **Purpose**: Trigger function that creates first check-in after session creation
- **Returns**: trigger
- **Usage**: Automatic trigger on tracking session creation

---

#### 12.12.5 Check-In Functions

**`select_available_agent()`**
- **Purpose**: Selects available agent with load balancing
- **Returns**: uuid (agent ID)
- **Security**: SECURITY DEFINER
- **Usage**: Auto-assigns agent to check-ins

**`handle_failed_scheduled_checkin(checkin_id uuid, failure_reason varchar(100))`**
- **Purpose**: Handles failed scheduled check-in, escalates to agent
- **Returns**: uuid (assigned agent ID)
- **Security**: SECURITY DEFINER
- **Usage**: Called when scheduled check-in fails

**`auto_assign_agent_to_checkin()`**
- **Purpose**: Trigger function that auto-assigns agent to pending check-ins
- **Returns**: trigger
- **Usage**: Automatic trigger on check-in creation

---

### 12.13 Database Triggers

**Common Triggers**:
- `set_updated_at_*` - Updates `updated_at` column on row update (applied to most tables)
- `tracking_checkin_status_trigger` - Handles check-in status changes
- `tracking_session_seed_checkin` - Creates first check-in after session creation
- `auto_assign_agent_to_checkin_trigger` - Auto-assigns agents to check-ins

---

### 12.14 Real-Time Subscriptions

**Tables with Real-time Enabled**:
- `emergencies` - Real-time emergency alerts
- `call_sessions` - Real-time call status updates
- `chat_requests` - Real-time chat request updates
- `messages` - Real-time message delivery
- `tracking_sessions` - Real-time tracking session updates
- `checkins` - Real-time check-in status updates

**Configuration**: Tables use `REPLICA IDENTITY FULL` for complete change tracking

---

### 12.15 Important Notes for Database Communication

1. **Row Level Security (RLS)**: All tables have RLS enabled. Ensure proper authentication tokens are used.

2. **Foreign Key Relationships**: 
   - `mobile_users.id` = `auth.users.id` (one-to-one)
   - `users.id` = `auth.users.id` (one-to-one)
   - Most tables reference `mobile_users(id)` for user data

3. **UUID Primary Keys**: All tables use UUID primary keys generated with `gen_random_uuid()`

4. **Timestamps**: All tables use `timestamptz` (timestamp with timezone) for consistency

5. **JSONB Columns**: Location and metadata stored as JSONB for flexibility

6. **CHECK Constraints**: Many columns have CHECK constraints for data validation

7. **Cascade Deletes**: Most foreign keys use `ON DELETE CASCADE` to maintain referential integrity

8. **Service Role**: Some operations require service role key to bypass RLS (e.g., agent assignment)

9. **Real-time**: Use Supabase Realtime subscriptions for live updates instead of polling

10. **Indexes**: All foreign keys and frequently queried columns are indexed for performance


---

## Document Version
- **Version**: 1.1
- **Last Updated**: 2025-01-27
- **Status**: Complete PRD for DeepHorizon Security App (Includes Architecture & Third-Party Services)

---

**Note**: This PRD describes the product features and functionality only. Implementation details, technical architecture, and development approaches are intentionally excluded as per requirements.

