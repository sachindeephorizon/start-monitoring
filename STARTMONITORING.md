# StartMonitoring Feature — Developer Reference

> **Complete documentation** for the StartMonitoring feature in the DeepHorizon Security app.
> Covers DB schema, Redis keys, APIs, tier system, foreground/background processes, escalation flow, and SecureStore keys.

Generated: August 2026 · Repos: `sachindeephorizon/start-monitoring` + `sachindeephorizon/rewp2`

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [How to Start](#2-how-to-start)
3. [Mobile App File Structure](#3-mobile-app-file-structure)
4. [Backend File Structure](#4-backend-file-structure)
5. [PostgreSQL Database Schema](#5-postgresql-database-schema)
6. [Redis Keys](#6-redis-keys)
7. [API Reference — Mobile Client](#7-api-reference--mobile-client)
8. [API Reference — Backend Routes](#8-api-reference--backend-routes)
9. [Tier System](#9-tier-system)
10. [Foreground Processes](#10-foreground-processes)
11. [Background Processes](#11-background-processes)
12. [Escalation Flow](#12-escalation-flow)
13. [SecureStore Keys](#13-securestore-keys)

---

## 1. System Overview

StartMonitoring is a **personal safety monitoring feature** inside the DeepHorizon Security mobile app. When a user starts a session, the app continuously pings GPS location to a dedicated backend (rewp2). The backend detects route deviations, inactivity, and missed check-ins — escalating through three tiers and, if needed, a 5-step emergency chain.

| Component | Repo | Tech | URL |
|-----------|------|------|-----|
| Mobile App | start-monitoring | React Native · Expo · TypeScript | App Store / Play Store |
| Backend API | rewp2 | Node.js · Express · TypeScript | rewp2-production.up.railway.app |
| Database | rewp2 | PostgreSQL (pg pool) | Railway Postgres |
| Cache / PubSub | rewp2 | Redis | Railway Redis |
| Real-time | rewp2 | Socket.IO + Redis Adapter | Same server |
| SOC Dashboard | rewp2 socket | Browser websocket client | Internal |

### High-Level Flow
1. User taps **Start Monitoring**
2. `POST /handling/entry` → session created in memory
3. App starts GPS watcher + background location task
4. Every N seconds: `POST /{userId}/ping` → backend records location
5. Backend checks: deviation? inactivity? missed check-in?
6. Tier computed (1/2/3) → returned in ping response
7. If T3 or missed check-in → escalation triggered (5 steps)
8. User taps 'I'm Safe' or 'Stop Monitoring' → session ends

---

## 2. How to Start

### Prerequisites
- Node.js 18+ and npm
- `npm install -g expo-cli` and `npm install -g eas-cli`
- iOS Simulator / Android Emulator or physical device
- PostgreSQL database (Railway or local)
- Redis instance (`docker run -p 6379:6379 redis`)

### Mobile App (start-monitoring)
```bash
git clone ... && cd start-monitoring && npm install
# Set EXPO_PUBLIC_LOCATION_SERVICE_URL in .env
npx expo start        # Press 'i' for iOS, 'a' for Android
```

### Backend (rewp2)
```bash
git clone ... && cd rewp2 && npm install
cp .env.example .env  # Set DATABASE_URL, REDIS_URL, PORT=9001
npm run dev           # Hot-reload dev mode
npm run build && npm start  # Production
docker-compose up --build   # Docker
```

### Environment Variables
| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | rewp2 | PostgreSQL connection string |
| `REDIS_URL` | rewp2 | Redis connection string |
| `PORT` | rewp2 | HTTP port (default 9001) |
| `EXPO_PUBLIC_LOCATION_SERVICE_URL` | start-monitoring | Backend URL |
| `PUBLIC_URL` | rewp2 | Keepalive self-ping URL |

---

## 3. Mobile App File Structure

**Repo:** `sachindeephorizon/start-monitoring`

| File / Folder | Role | Description |
|---------------|------|-------------|
| `App.tsx` | Root component | Bootstraps the app. Registers background tasks, sets up push notifications, iOS StoreKit, and mounts all providers. Splash screen gating here. |
| `src/features/monitoring/MonitoringSession.tsx` | Main session screen | ~1,500-line core. Manages foreground GPS watcher, check-in timer, tier display, SOS button, deviation banner, arrival detection, session stop. |
| `src/features/monitoring/backgroundLocation.ts` | Background GPS task | Registers OS task `monitoring-background-location`. No React, no useState — reads SecureStore for session state, pings backend, fires missed check-in notifications. |
| `src/features/monitoring/tierSignal.ts` | Tier engine (client) | `TierSignalService` class. Receives signals, computes tier (1/2/3), runs decay timers and anchor-based inactivity detection. |
| `src/features/monitoring/CheckInWatcher.tsx` | Check-in countdown | Manages periodic check-in prompt. Schedules OS notification at `nextCheckinAt`. Escalates on missed response. |
| `src/features/monitoring/stubSignalSource.ts` | Dev helper | Fake signal emitter for testing tier transitions without real GPS. |
| `src/api/monitoring.ts` | API client | Axios client for rewp2. All typed calls: `pingLocation`, `stopTracking`, `setDestination`, `entryStart`, `checkinRespond`, `escalationTrigger`, etc. |
| `src/api/config.ts` | Axios instance | Shared axios instance for main DeepHorizon API. |
| `src/api/interceptors.ts` | Auth interceptor | Attaches JWT; handles 401 → logout. |
| `src/core/auth/` | Authentication | `AuthContext`, `useAuth`, `BootGuard`. |
| `src/core/notifications/` | Push notifications | Expo notification channels, handlers, routing. |
| `src/core/in-app-alerts/` | In-app alert banner | `InAppAlertBanner` + `InAppAlertBridge` — toast-style alerts from background tasks. |
| `src/features/tracking/tracking.task.ts` | TrackMe BG task | **Separate** background task for TrackMe — different task name and SecureStore keys. |
| `src/navigation/RootNavigator.tsx` | Navigation | React Navigation stack including `MonitoringSession` and `EscalationScreen`. |

---

## 4. Backend File Structure

**Repo:** `sachindeephorizon/rewp2`

| File | Role | Description |
|------|------|-------------|
| `src/index.ts` | Server entry | Bootstraps Express, connects Redis + Postgres, inits Socket.IO, starts SOC retry worker and ping-gap watcher. Self-pings /health every 13 min (Railway keepalive). |
| `src/db.ts` | PostgreSQL pool | `pg.Pool` (max 10). Creates all 6 tables on startup. Logs pool stats every 5 min. |
| `src/redis.ts` | Redis clients | 4 clients: main, subscriber, ioPub, ioSub (Socket.IO adapter). |
| `src/config.ts` | Constants | `LOCATION_TTL=3600`, `SESSION_TTL=86400`, `TRAIL_MIN_DISTANCE=5`, `CHANNEL='location_updates'`, `ACTIVE_SET='active_users'`, SOC config. |
| `src/types.ts` | TypeScript types | All shared interfaces: `PingBody`, `SessionMeta`, `DestinationData`, `DeviationAlert`, `LocationPayload`, etc. |
| `src/socket.ts` | Socket.IO server | Redis adapter, event handlers, `getIo()` export. |
| `src/routes/tracking.ts` | Core ping & stop | `POST /:id/ping` (Kalman filter, snap-to-road, H3, deviation, inactivity, tier). `POST /:id/stop` (tears down live signal immediately, persists Postgres in background). |
| `src/routes/entry.ts` | Session lifecycle | `POST /handling/entry`, `PUT .../details`, `PUT .../end`, `GET .../summary`. |
| `src/routes/checkin.ts` | Check-in logic | `checkinStore`, tier management. `escalateOnDeviation`, `escalateOnInactivity`, `getCheckinSnapshot`. |
| `src/routes/escalation.ts` | 5-step escalation | `POST /trigger`, `PUT /advance`, `PUT /safe` (resets tier+Redis), `GET /status`. |
| `src/routes/destination.ts` | Destination mgmt | Set/clear/get destination; builds H3 corridor from OSRM route. |
| `src/routes/sessions.ts` | Session history | Historical sessions + location_logs from Postgres. |
| `src/services/soc.dispatch.service.ts` | SOC dispatcher | `dispatchToSoc()` — writes soc_events + emits to Socket.IO SOC room. Retry worker. |
| `src/services/ping-gap.watcher.ts` | Ping gap detector | Scans active users every 30s; publishes `ping_gap` warning if gap > 90s. |
| `src/utils/gps.ts` | GPS processing | Kalman filter 2D, haversine, spike rejection, Redis-backed state. |
| `src/utils/h3corridor.ts` | H3 geofencing | Build inner/outer H3 corridor. Deviation = ping cell not in Redis sets. |
| `src/utils/snapToRoad.ts` | Road snapping | OSRM `/nearest` and `/match` for clean trail visuals. |
| `src/utils/geocode.ts` | Reverse geocoding | Nominatim → human-readable address for session start/end. |
| `cluster.ts` | Process cluster | Optional multi-core scaling (not used on Railway single dyno). |
| `simulator.js` | Load tester | Simulates N fake users pinging at configurable intervals. |

---

## 5. PostgreSQL Database Schema

### `app_users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Auto-increment |
| name | VARCHAR(100) | NOT NULL | Full name |
| email | VARCHAR(255) | UNIQUE NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hash |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Account creation |

### `sessions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Session row ID |
| user_id | VARCHAR(100) | NOT NULL, INDEX | Supabase user UUID |
| session_name | VARCHAR(100) | NOT NULL | e.g. 'session3' |
| status | TEXT | DEFAULT 'active' | 'active' \| 'completed' |
| trip_type | TEXT | NULL | 'cab'\|'walking'\|'meeting'\|'custom' |
| started_at | TIMESTAMPTZ | NOT NULL | Session start |
| ended_at | TIMESTAMPTZ | NOT NULL | Session end |
| duration_secs | INTEGER | NOT NULL | Total duration |
| total_pings | INTEGER | DEFAULT 0 | GPS pings recorded |
| start_location | VARCHAR(255) | NULL | Reverse-geocoded start |
| end_location | VARCHAR(255) | NULL | Reverse-geocoded end |
| origin_lat / lng | DOUBLE PRECISION | NULL | Trip start coords |
| dest_lat / lng | DOUBLE PRECISION | NULL | Destination coords |
| dest_label | TEXT | NULL | Destination name |
| route_polyline | TEXT | NULL | OSRM route JSON |
| route_h3_corridor | TEXT | NULL | H3 corridor JSON |
| total_distance_m | DOUBLE PRECISION | DEFAULT 0 | Traveled distance (m) |
| deviation_count | INTEGER | DEFAULT 0 | Number of deviation events |

### `location_logs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Log entry ID |
| session_id | INTEGER | FK → sessions(id) CASCADE | Parent session |
| lat | DOUBLE PRECISION | NOT NULL | Latitude (Kalman-smoothed) |
| lng | DOUBLE PRECISION | NOT NULL | Longitude (Kalman-smoothed) |
| h3_cell | VARCHAR(20) | NULL, INDEX | H3 cell at resolution 10 |
| speed_kmh | DOUBLE PRECISION | NULL | Speed in km/h |
| accuracy_m | DOUBLE PRECISION | NULL | GPS accuracy (m) |
| deviation_flag | BOOLEAN | DEFAULT FALSE | Outside H3 corridor |
| inactivity_flag | BOOLEAN | DEFAULT FALSE | Inactivity detected |
| recorded_at | TIMESTAMPTZ | NOT NULL, INDEX | GPS timestamp |

### `deviations`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Deviation record ID |
| user_id | VARCHAR(100) | User who deviated |
| session_id | INTEGER FK | Parent session |
| lat / lng | DOUBLE PRECISION | Detection coordinates |
| h3_cell | VARCHAR(20) | H3 cell at detection point |
| zone | VARCHAR(20) | 'OUTSIDE_SHORT' (streak 3–7) \| 'OUTSIDE_LONG' (streak ≥ 8) |
| consecutive | INTEGER | Streak count at detection |
| detected_at | TIMESTAMPTZ | When detected |
| destination_name | VARCHAR(255) | Destination label |
| resolved_at | TIMESTAMPTZ | Cleared on return or /escalation/safe |

> Only inserted at threshold crossings (streak=3 and streak=8), not every outside ping.

### `session_events`
Event types: `session_started`, `session_ended`, `deviation_detected`, `deviation_cleared`, `inactivity_detected`, `arrival_detected`

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL PK | Event ID |
| session_id | INTEGER FK | Parent session |
| user_id | VARCHAR(100) | User ID |
| event_type | TEXT | See event types above |
| occurred_at | TIMESTAMPTZ | Event time |
| lat / lng | DOUBLE PRECISION | Location if relevant |
| metadata | JSONB | Arbitrary event data |

### `soc_events`
Outbox table for the SOC dashboard. Rows with `delivered_at IS NULL` are pending delivery.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Event UUID |
| user_id | VARCHAR(100) | Affected user |
| event_type | TEXT | escalation_triggered, tier_shifted, missed_checkin, etc. |
| severity | TEXT | 'info' \| 'warning' \| 'critical' |
| payload | JSONB | Full event detail |
| idempotency_key | TEXT UNIQUE | Prevents duplicate events |
| delivered_at | TIMESTAMPTZ | NULL = pending |
| attempts | INTEGER | Delivery retry count (max 50) |

### `h3_risk_scores`
| Column | Type | Description |
|--------|------|-------------|
| h3_cell | VARCHAR(20) PK | H3 cell identifier |
| resolution | INTEGER | Default 9 |
| risk_score | DOUBLE PRECISION | Computed risk (0.0–1.0) |
| total_sessions | INTEGER | Sessions passing through |
| deviation_events | INTEGER | Deviations in this cell |
| escalation_events | INTEGER | Escalations in this cell |
| last_updated | TIMESTAMPTZ | Last recalculation |

---

## 6. Redis Keys

| Key Pattern | Type | TTL | Description |
|-------------|------|-----|-------------|
| `user:{userId}` | STRING (JSON) | 1 hr | Latest LocationPayload — live dashboard reads this |
| `session:{userId}:start` | STRING | 24 hr | ISO timestamp of session start |
| `session:{userId}:meta` | STRING (JSON) | 24 hr | SessionMeta: streamKey, roomNames, startedAt, appState |
| `session:{userId}:logs` | LIST (JSON) | 24 hr | Every GPS ping. Drained to Postgres on stop |
| `trail:{userId}` | LIST (JSON) | 24 hr | Sparse trail dots (every 5m). Map replay |
| `marker:{userId}:start` | STRING (JSON) | 24 hr | First GPS fix — start marker |
| `active_users` | SET | ∞ | All currently active userIds |
| `nav:dest:{userId}` | STRING (JSON) | 24 hr | DestinationData: origin, destination, name, distance |
| `nav:route:{userId}` | STRING (JSON) | 24 hr | OSRM route polyline |
| `nav:corridor:{userId}` | STRING (JSON) | 24 hr | Full H3 corridor JSON |
| `nav:inner:{userId}` | SET | 24 hr | Inner corridor H3 cells → ping inside = streak reset |
| `nav:outer:{userId}` | SET | 24 hr | Outer corridor H3 cells → buffer zone |
| `devstreak:{userId}` | STRING (JSON) | 24 hr | `{count: N}` consecutive outside pings |
| `deviation:{userId}` | STRING (JSON) | 24 hr | Last DeviationAlert snapshot |
| `inactwin:{userId}` | LIST (JSON) | 24 hr | 10-min sliding window: `{t, lat, lng}` samples |
| `gpsstate:{userId}` | STRING (JSON) | 24 hr | Kalman filter state (survives server restarts) |
| `lastPingAt:{userId}` | STRING | 24 hr | Epoch ms of last ping — read by ping-gap watcher |
| `stopped:{userId}` | STRING | 5 min | Post-stop gate: rejects zombie pings |
| `locreq:{userId}` | STRING | 60 sec | Pending force-location-refresh flag |
| `location_updates` | PUB/SUB channel | — | Every ping publishes here; Socket.IO fans out to dashboards |

---

## 7. API Reference — Mobile Client

**Base URL:** `EXPO_PUBLIC_LOCATION_SERVICE_URL` (default: `https://rewp2-production.up.railway.app`)
**File:** `src/api/monitoring.ts` · **Client:** `monitoringClient` (axios, timeout 15s)

### Location / Tracking
| Call | Method + Path | Key Payload | Returns |
|------|--------------|-------------|----------|
| `pingLocation(userId, payload)` | `POST /{userId}/ping` | lat, lng, accuracy, speed, heading, moving, source, appState, sequence, sessionId | `PingResponse`: ok, tier, tierName, deviationAlert, deviationFlag, inactivityFlag, arrivalDetected, missedCheckin, nextCheckinAt |
| `stopTracking(userId)` | `POST /{userId}/stop` | (none) | `StopResponse`: ok, pending, durationSecs, totalPings, startMarker, stopMarker |
| `setDestination(userId, origin, dest, name?, tripType?)` | `POST /destination/{userId}/set` | origin, destination, name, tripType | ok, distance(m), duration(s), routePoints |
| `clearDestination(userId)` | `POST /destination/{userId}/clear` | (none) | `{ok: bool}` |
| `getDestination(userId)` | `GET /destination/{userId}` | ?includeRoute, ?includeCorridor | DestinationInfo |
| `getUserStream(userId)` | `GET /user/{userId}/stream` | (none) | StreamInfo: sessionMeta, startMarker, trail[] |

### Handling — Entry
| Call | Method + Path | Returns |
|------|--------------|----------|
| `entryStart(userId)` | `POST /handling/entry` | user_id, session_id, status, started_at |
| `entryDetails(userId, body)` | `PUT /handling/entry/{userId}/details` | Updated session with destination/trip_type/contacts |
| `entryEnd(userId)` | `PUT /handling/entry/{userId}/end` | status='ended', ended_at |
| `entrySummary(userId)` | `GET /handling/entry/{userId}/summary` | stats, timeline, trusted_contacts |

### Handling — Check-in
| Call | Method + Path | Returns |
|------|--------------|----------|
| `checkinStart(userId)` | `POST /handling/checkin/{userId}/start` | tier, tier_name, interval_minutes, next_checkin_at |
| `checkinRespond(userId, isSafe)` | `POST /handling/checkin/{userId}/respond` | `CheckinRespondResponse`: status, tier, next_checkin_at, trigger_escalation |
| `checkinMissed(userId)` | `POST /handling/checkin/{userId}/missed` | Tier → T3, trigger_escalation=true |

### Handling — Escalation
| Call | Method + Path | Returns |
|------|--------------|----------|
| `escalationTrigger(userId, reason)` | `POST /handling/escalation/{userId}/trigger` | escalation_id, current_step, steps[] |
| `escalationCancel(userId)` | `PUT /handling/escalation/{userId}/safe` | resolved, tier_reset_to=1, resolved_at |
| `escalationStatus(userId)` | `GET /handling/escalation/{userId}/status` | active, resolved, current_step, steps[], current_tier |

---

## 8. API Reference — Backend Routes

### Tracking Routes (`/:id/*`)
- `POST /:id/ping` — Main GPS ping. Kalman filter → snap-to-road → H3 assignment → deviation streak → inactivity window → arrival check → tier snapshot. Returns enriched payload.
- `POST /:id/stop` — Tears down live Redis session immediately, responds to client, persists Postgres in background.

### Destination Routes (`/destination/*`)
- `POST /destination/:id/set` — OSRM route → H3 inner/outer corridor → stored in Redis sets.
- `POST /destination/:id/clear` — Clear destination + corridor from Redis.
- `GET /destination/:id` — Get destination data.
- `GET /destination/:id/remaining` — Haversine distance remaining to destination.

### Handling Routes (`/handling/*`)
- `POST /handling/entry` — Start session (resets check-in state, creates in-memory session).
- `PUT /handling/entry/:id/details` — Add destination/trip_type/trusted_contacts.
- `PUT /handling/entry/:id/end` — End session.
- `POST /handling/checkin/:id/start` — Activate check-in tracking.
- `POST /handling/checkin/:id/respond` — User check-in response.
- `POST /handling/escalation/:id/trigger` — Start 5-step escalation.
- `PUT /handling/escalation/:id/advance` — Move to next escalation step.
- `PUT /handling/escalation/:id/safe` — User confirms safe → reset tier + Redis.

---

## 9. Tier System

### Tier Definitions

| Tier | Name | GPS Mode | Ping Interval | Check-in Interval | Battery |
|------|------|----------|--------------|-------------------|---------|
| **T1** | Passive | Cell tower / WiFi (NO continuous GPS) | 60 seconds | 30 minutes | Max-save |
| **T2** | Active | GPS balanced (foreground: 5s, BG: 15s) | 5–15 seconds | 15 minutes | Moderate |
| **T3** | Emergency | GPS at full power (max accuracy) | 3–5 seconds | 5 minutes | High drain |

### How Tiers Change

| Transition | Trigger |
|-----------|---------|
| **T1 → T2** | `short_deviation` (streak ≥ 3) OR `inactivity` (< 30m in 10 min, not near dest) |
| **T1/T2 → T3** | `long_deviation` (streak ≥ 8) OR `missed_checkin` OR `user_needs_help` |
| **Any → T1** | User responds 'I'm Safe' OR confirms safe on escalation screen |
| **T2 decay** | No new signal within **5 minutes** → drops to T1 (client-side only) |
| **T3 decay** | No new signal within **10 minutes** → drops to T1 (client-side only) |

### Deviation Streak Thresholds

| Streak | Severity | Tier Bump | DB Insert? |
|--------|----------|-----------|------------|
| 1–2 | None | No change | No |
| 3–7 | `short_deviation` | T1 → T2 | Once at streak=3 |
| ≥ 8 | `long_deviation` | T1/T2 → T3 | Once at streak=8 |
| Reset to 0 | Cleared | Back to T1 | `deviations.resolved_at` set |

### Inactivity Detection
- **Window:** 10 minutes
- **Threshold:** < 30m max displacement from anchor point (not cumulative distance)
- **Suppressed when:** user is within 400m of destination
- **Backend:** `INACTIVITY_WINDOW_S=600`, `INACTIVITY_DISTANCE_M=30` in `src/routes/tracking.ts`
- **Client:** `INACTIVITY_WINDOW_MS=600000`, `INACTIVITY_DISTANCE_M=30` in `src/features/monitoring/tierSignal.ts`

---

## 10. Foreground Processes

| Process | Tech | Description |
|---------|------|-------------|
| **GPS Watcher** | `expo-location watchPositionAsync` | Streams GPS fixes. Tier-controlled accuracy (T1=Balanced, T2=BestForNavigation, T3=Highest). Calls `pingLocation()` per fix. Feeds `TierSignalService.reportPosition()`. |
| **Check-in Timer** | `setInterval` + `Expo Notifications` | Counts down to `nextCheckinAt`. Shows in-app modal at T=0. Escalates if no response in 30s. Schedules OS notification as backup alarm. |
| **Tier Signal Engine** | `TierSignalService` (in-memory) | Receives deviation/inactivity/missedCheckin signals from ping responses. Computes tier. Runs decay timers. Emits tier-change callbacks. |
| **InAppAlertBridge** | `AppState` listener | On foreground return, checks `BG_KEYS.missedCheckin` SecureStore flag. If set → pushes `missed_checkin` signal to tier engine immediately. |
| **SOC Retry Worker** | `setInterval` 30s (backend) | Scans `soc_events WHERE delivered_at IS NULL` → re-emits to SOC Socket.IO room. Up to 50 attempts. |
| **Keepalive Pinger** | `setInterval` 13 min (backend) | Self-pings `/health` to prevent Railway cold starts. |

---

## 11. Background Processes

| Process | Task Name / Tech | Description |
|---------|-----------------|-------------|
| **Background Location Task** | `monitoring-background-location` | OS wakes isolated JS on GPS batch delivery. No React, no useState. Reads SecureStore → pings backend → updates `nextCheckinAt` → fires notification on `missedCheckin: true`. |
| **Distance Accumulator** | `updateTraveledDistance()` in BG task | Reads `lastLat/lastLng` from SecureStore. Computes haversine step (filtered: accuracy > 50m and jumps > 1km dropped). Writes cumulative distance back. |
| **Ping-Gap Watcher** | `setInterval` 30s (backend) | Scans `active_users`. If `lastPingAt:{userId}` gap > 90s → `ping_gap` warning. If gap > 5 min → `ping_gap` critical. Tells SOC user has gone dark. |
| **SOC Dispatch Worker** | `setInterval` 30s (backend) | Re-emits unacked SOC events. Ensures SOC dashboard recovers if briefly disconnected during an escalation. |

---

## 12. Escalation Flow

Triggered when: (a) user misses a check-in, (b) user taps 'I Need Help', (c) SOS button, (d) SOC manual trigger.

### 5-Step Chain

| Step | Name | What Happens |
|------|------|-------------|
| **1** | Push Notification | Expo push notification: "Are you safe?" |
| **2** | SMS to Phone | SMS to registered phone number |
| **3** | AI Safety Call | Automated AI phone call |
| **4** | Human SOC Agent | Live SOC agent takes over |
| **5** | Trusted Contacts | All `trusted_contacts` with `notify=true` are notified |

### Escalation Reasons
- `missed_checkin` — No response within 30s of check-in prompt
- `need_help` — User tapped 'I Need Help' (`is_safe: false`)
- `sos` — SOS panic button
- `manual` — SOC agent triggered manually

### Resolution (`PUT /handling/escalation/:userId/safe`)
1. Sets `escalation.resolved = true`, `resolved_by = 'user'`
2. Resets tier to 1, interval to 30 min
3. Deletes `devstreak:{userId}`, `deviation:{userId}`, `inactwin:{userId}` from Redis
4. Sets `deviations.resolved_at = NOW()` in Postgres
5. Dispatches `escalation_resolved` event to SOC
6. Client pushes `clear_all` signal to `TierSignalService` → tier drops to 1

---

## 13. SecureStore Keys (BG_KEYS)

Defined in `src/features/monitoring/backgroundLocation.ts → BG_KEYS`.
**Written by:** `MonitoringSession` + `updateTraveledDistance()`. **Read by:** Background task + `MonitoringSession` on rehydration.

| Key | Type | Written By | Description |
|-----|------|-----------|-------------|
| `monitoring_bg_active` | `'true'\|'false'` | MonitoringSession | Master gate — background task no-ops if not 'true' |
| `monitoring_bg_user_id` | string (UUID) | MonitoringSession | Supabase user UUID for `pingLocation()` |
| `monitoring_bg_session_id` | string | MonitoringSession | Session ID from `entryStart()` |
| `monitoring_bg_app_state` | `'foreground'\|'background'` | AppState listener | Included in every ping as `appState` field |
| `monitoring_bg_sequence` | number (string) | Background task | Monotonic counter per ping |
| `monitoring_bg_started_at` | epoch ms (string) | MonitoringSession | Session start — rehydration restores elapsed time |
| `monitoring_bg_trip_type` | TripType string | MonitoringSession | 'cab'\|'walking'\|'meeting'\|'custom' |
| `monitoring_bg_distance_m` | number (string) | `updateTraveledDistance()` | Cumulative traveled distance in meters |
| `monitoring_bg_last_lat` | number (string) | `updateTraveledDistance()` | Last stored latitude for step computation |
| `monitoring_bg_last_lng` | number (string) | `updateTraveledDistance()` | Last stored longitude |
| `monitoring_bg_next_checkin_at` | ISO string | MonitoringSession + BG task | Next check-in deadline — BG task updates from ping response |
| `monitoring_bg_last_checkin_at` | epoch ms (string) | MonitoringSession | Last check-in time |
| `monitoring_bg_destination_lat` | number (string) | MonitoringSession | Destination lat — persisted across app kills |
| `monitoring_bg_destination_lng` | number (string) | MonitoringSession | Destination lng |
| `monitoring_bg_destination_name` | string | MonitoringSession | User-entered destination name |
| `monitoring_bg_missed_checkin` | `'true'\|null` | Background task | Set when ping returns `missedCheckin: true`. Cleared on foreground return. |

### Important Developer Notes
- **Never rename a BG_KEY** without updating both MonitoringSession (writer) and backgroundLocation.ts (reader).
- **Always clear `BG_KEYS.active` on session end.** Stale 'true' causes background task to keep pinging.
- **Background JS context has no React, no useState, no hooks.** All communication via SecureStore + OS notifications.
- **`BG_KEYS.missedCheckin` is a flag, not a count.** Once 'true' it fires escalation every app open until cleared.

---

*Deep Horizon Security · StartMonitoring Feature · Internal Developer Reference · August 2026*