# DeepHorizon Security — AWS Upscale Plan

## Current Architecture

| Layer | Current Service | Limitation |
|-------|----------------|------------|
| Database | Supabase PostgreSQL | Single region, shared infra, no read replicas |
| Auth | Supabase GoTrue | Limited customization, no MFA policies |
| Real-time | Supabase Realtime | Connection limits on free/pro tiers |
| Edge Functions | Supabase Deno Functions (8) | Cold starts, 60s timeout, no VPC |
| API | Vercel (Next.js dashboard) | Serverless cold starts, no persistent connections |
| Video/Audio | Stream.io WebRTC | Third-party dependency, per-minute pricing |
| Payments | Razorpay + Apple StoreKit | Already optimal, no change needed |
| Push Notifications | Expo Push API | Rate limits, single vendor dependency |
| Storage | None active | No file/media handling yet |
| CDN | None | No edge caching |
| Monitoring | Console logs only | No centralized observability |

---

## Target Architecture (AWS)

```
                         ┌──────────────┐
                         │  CloudFront  │  (CDN + Edge)
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
             ┌──────┴──────┐        ┌───────┴───────┐
             │ API Gateway │        │  ALB (ECS)    │
             │ (REST/WS)   │        │  Dashboard    │
             └──────┬──────┘        └───────┬───────┘
                    │                       │
         ┌──────────┼──────────┐            │
         │          │          │            │
    ┌────┴───┐ ┌────┴───┐ ┌───┴────┐  ┌───┴────┐
    │ Lambda │ │ Lambda │ │ Lambda │  │  ECS   │
    │  Auth  │ │  API   │ │ Events │  │Fargate │
    └────┬───┘ └────┬───┘ └───┬────┘  └───┬────┘
         │          │          │            │
         └──────────┼──────────┘            │
                    │                       │
    ┌───────────────┼───────────────────────┤
    │               │                       │
┌───┴───┐   ┌──────┴──────┐        ┌───────┴──────┐
│Aurora  │   │ ElastiCache │        │     S3       │
│Postgres│   │   (Redis)   │        │  (Storage)   │
└───┬───┘   └─────────────┘        └──────────────┘
    │
┌───┴────────┐
│ Read       │
│ Replicas   │
└────────────┘
```

---

## Phase 1: Foundation (Weeks 1-3)

### 1.1 AWS Account & Infrastructure Setup

**Services**: IAM, VPC, Secrets Manager, CloudWatch

- Create dedicated AWS account with Organizations
- Set up VPC with public/private subnets across 2 AZs (ap-south-1 for India)
- Configure NAT Gateway for private subnet outbound
- Store all secrets in AWS Secrets Manager (Supabase keys, Stream API keys, Razorpay secrets)
- Set up CloudWatch log groups for all services
- Infrastructure as Code: **AWS CDK (TypeScript)** — matches your team's language

```
VPC Layout:
├── Public Subnet A  (ap-south-1a) — ALB, NAT GW
├── Public Subnet B  (ap-south-1b) — ALB
├── Private Subnet A (ap-south-1a) — Lambda, ECS, Aurora
└── Private Subnet B (ap-south-1b) — Lambda, ECS, Aurora (standby)
```

### 1.2 Database Migration: Supabase → Aurora PostgreSQL

**Services**: Aurora PostgreSQL Serverless v2, RDS Proxy

**Why Aurora over RDS**:
- Auto-scales from 0.5 to 128 ACUs based on load
- Multi-AZ by default (automatic failover)
- Read replicas for query-heavy operations (history, tracking)
- Up to 5x PostgreSQL performance

**Migration Steps**:
1. Export Supabase schema (tables, indexes, RLS policies, functions)
2. Create Aurora cluster with Serverless v2 capacity (min 0.5 ACU, max 8 ACU to start)
3. Set up RDS Proxy for connection pooling (Lambda can't hold persistent connections)
4. Migrate data using `pg_dump` / `pg_restore`
5. Re-create RLS policies as PostgreSQL row-level security
6. Set up read replica for dashboard queries
7. Enable automated backups (35-day retention) + point-in-time recovery

**Key Tables to Migrate**:
- `mobile_users`, `user_subscriptions`, `family_members`
- `emergencies`, `emergency_contacts`
- `tracking_sessions`, `tracking_locations`, `tracking_checkins`
- `call_sessions`, `video_sessions`, `messages`
- `checkins`, `user_devices`
- `razorpay_*` tables

**Connection Config**:
```
Writer endpoint → Lambda functions (mutations)
Reader endpoint → Dashboard API, history queries, analytics
RDS Proxy      → All Lambda functions (connection pooling)
```

### 1.3 Caching Layer: ElastiCache (Redis)

**Services**: ElastiCache for Redis (Serverless)

**Purpose**: Reduce database load for frequently accessed data

**Cache Targets**:
| Key Pattern | Data | TTL |
|------------|------|-----|
| `user:{id}:profile` | User profile + subscription status | 5 min |
| `user:{id}:subscription` | Active subscription details | 2 min |
| `user:{id}:trial` | Trial status | 10 min |
| `session:{id}` | Auth session data | matches token expiry |
| `checkin:{id}` | Active check-in details | 1 min |
| `tracking:{session_id}:latest` | Latest location for active tracking | 30 sec |

**Impact**: Eliminates repeated `ensureValidSession()` + subscription queries that currently cause load during app boot.

---

## Phase 2: API & Auth Migration (Weeks 3-6)

### 2.1 API Gateway + Lambda (Replace Supabase Edge Functions + Vercel)

**Services**: API Gateway (HTTP API), Lambda, SQS

**Architecture**: One API Gateway with route-based Lambda integration

```
API Gateway (api.deephorizon.com)
├── POST /auth/verify-otp          → Lambda: auth
├── POST /auth/refresh             → Lambda: auth
├── POST /auth/delete-account      → Lambda: auth
│
├── GET  /user/profile             → Lambda: user
├── PUT  /user/profile             → Lambda: user
│
├── POST /emergency/create         → Lambda: emergency
├── GET  /emergency/{id}           → Lambda: emergency
│
├── POST /checkin/schedule         → Lambda: checkin
├── POST /checkin/{id}/complete    → Lambda: checkin
├── GET  /checkin/pending          → Lambda: checkin
│
├── POST /tracking/start           → Lambda: tracking
├── POST /tracking/{id}/location   → Lambda: tracking
├── POST /tracking/{id}/stop       → Lambda: tracking
│
├── POST /payment/razorpay/order   → Lambda: payment
├── POST /payment/razorpay/verify  → Lambda: payment
├── POST /payment/ios/verify       → Lambda: payment
├── POST /payment/webhook/razorpay → Lambda: payment (no auth)
├── POST /payment/webhook/appstore → Lambda: payment (no auth)
│
├── POST /stream/video-token       → Lambda: stream
├── POST /stream/audio-token       → Lambda: stream
│
├── POST /chat/assign-agent        → Lambda: chat
├── POST /chat/send-message        → Lambda: chat
│
├── POST /notification/send        → Lambda: notification (internal)
│
└── WSS  /realtime                 → Lambda: websocket (see 2.3)
```

**Lambda Configuration**:
- Runtime: Node.js 20.x
- Memory: 256MB (auth, user, checkin) / 512MB (emergency, tracking)
- Timeout: 15s (API calls) / 60s (payment webhooks)
- VPC: Private subnet (Aurora access)
- Layers: Shared `pg` client, auth middleware, response helpers
- Provisioned concurrency: 5 for `/auth/*` and `/emergency/*` (zero cold starts)

**Replaces**:
| Current | AWS Replacement |
|---------|----------------|
| `send_push_notification` Edge Function | Lambda: notification |
| `verify_ios_purchase` Edge Function | Lambda: payment |
| `sync_ios_subscription_status` Edge Function | Lambda: payment |
| `create_razorpay_order` Edge Function | Lambda: payment |
| `verify_razorpay_payment` Edge Function | Lambda: payment |
| `razorpay_webhook` Edge Function | Lambda: payment |
| `app_store_notifications` Edge Function | Lambda: payment |
| `delete_user_account` Edge Function | Lambda: auth |
| Vercel `/api/stream/*` | Lambda: stream |
| Vercel `/api/chat/*` | Lambda: chat |
| Vercel `/api/emergency/*` | Lambda: emergency |
| Vercel `/api/video-call-request` | Lambda: stream |

### 2.2 Authentication: Amazon Cognito

**Services**: Cognito User Pool, Cognito Identity Pool

**Why Cognito**:
- Managed auth with built-in MFA
- JWT tokens compatible with API Gateway authorizer
- Phone number + OTP verification built-in
- Custom auth flows via Lambda triggers
- Scales automatically

**Setup**:
- User Pool: Email + phone sign-up, OTP verification
- Custom Lambda trigger for 2Factor API integration (preserving current OTP provider)
- Cognito Authorizer on API Gateway (replaces manual JWT verification)
- Token refresh handled by Cognito SDK in app

**Migration Path** (backward-compatible):
1. Create Cognito User Pool mirroring Supabase Auth users
2. Migrate users with `AdminCreateUser` (preserving IDs as custom attribute)
3. Update mobile app to use `aws-amplify/auth` or `amazon-cognito-identity-js`
4. Run both auth systems in parallel for 2 weeks
5. Cut over once stable

### 2.3 Real-time: API Gateway WebSockets + Redis Pub/Sub

**Services**: API Gateway (WebSocket API), Lambda, ElastiCache Redis

**Replaces**: Supabase Realtime subscriptions

**Architecture**:
```
Mobile App ←→ WSS API Gateway ←→ Lambda (connect/disconnect/message)
                                      ↕
                               Redis Pub/Sub
                                      ↕
                            Lambda (event publisher)
                                      ↕
                               Aurora (DB changes)
```

**Channels**:
| Channel | Purpose | Current Source |
|---------|---------|---------------|
| `emergency:{user_id}` | Emergency status updates | Supabase Realtime |
| `chat:{request_id}` | Chat messages | Supabase Realtime + polling |
| `tracking:{session_id}` | Location updates | Supabase Realtime |
| `checkin:{user_id}` | Check-in status | Supabase Realtime |
| `call:{session_id}` | Call state changes | Supabase Realtime |

**Benefits over Supabase Realtime**:
- No connection limits (API Gateway scales to millions)
- Redis Pub/Sub is sub-millisecond
- Custom message filtering (don't send full row, just deltas)
- Connection management with DynamoDB ($connectionId → userId mapping)

---

## Phase 3: Push Notifications & Storage (Weeks 6-8)

### 3.1 Push Notifications: SNS + Pinpoint

**Services**: SNS (Simple Notification Service), Pinpoint

**Architecture**:
```
Lambda (trigger) → SNS Topic → Platform Application
                                 ├── APNs (iOS)
                                 └── FCM (Android)
```

**Why SNS over Expo Push**:
- Direct APNs/FCM integration (no middleman)
- No rate limits from third party
- Built-in delivery tracking
- Integrates with Pinpoint for analytics
- Cost: ~$0.50 per million notifications

**Migration**:
1. Register APNs certificate and FCM server key in SNS
2. Create SNS Platform Applications (iOS + Android)
3. On app launch, register device token with SNS (create platform endpoint)
4. Store SNS endpoint ARN in `user_devices` table
5. Lambda sends via `SNS.publish()` with platform-specific payloads
6. Keep Expo notifications as fallback during transition

**Notification Lambda** (replaces `send_push_notification` Edge Function):
```
Input:  { userId, type, title, body, data }
Steps:  1. Look up user's SNS endpoint ARN from user_devices
        2. Build platform-specific payload (APNs/FCM)
        3. SNS.publish() with MessageStructure: 'json'
        4. Handle disabled endpoints (re-register or remove)
```

### 3.2 File Storage: S3 + CloudFront

**Services**: S3, CloudFront, Lambda@Edge

**Buckets**:
| Bucket | Purpose | Access |
|--------|---------|--------|
| `deephorizon-media-{env}` | Profile images, chat attachments | CloudFront (signed URLs) |
| `deephorizon-evidence-{env}` | Emergency photos/videos | Private (signed URLs, 24h expiry) |
| `deephorizon-backups-{env}` | DB backups, exports | Private (no public access) |

**Upload Flow**:
1. App requests pre-signed upload URL from Lambda
2. Lambda generates S3 pre-signed PUT URL (5 min expiry, 10MB limit)
3. App uploads directly to S3 (no server relay)
4. S3 Event → Lambda → resize/process → store processed version
5. Serve via CloudFront for fast delivery

**Security**:
- All buckets: Block all public access
- Evidence bucket: Server-side encryption (SSE-KMS)
- Pre-signed URLs for all access (upload + download)
- Lifecycle policy: Move evidence to Glacier after 90 days

---

## Phase 4: Observability & Security (Weeks 8-10)

### 4.1 Monitoring & Alerting

**Services**: CloudWatch, X-Ray, CloudWatch Alarms, SNS (for alerts)

**Dashboards**:
```
CloudWatch Dashboard: "DeepHorizon Production"
├── API Latency (p50, p95, p99 per endpoint)
├── Lambda Errors & Throttles
├── Aurora CPU, Connections, IOPS
├── Redis Memory, Connections, Hits/Misses
├── WebSocket Active Connections
├── Push Notification Delivery Rate
└── Emergency Response Time (custom metric)
```

**Critical Alarms**:
| Alarm | Threshold | Action |
|-------|-----------|--------|
| Emergency Lambda Errors | > 0 in 1 min | PagerDuty + SMS |
| API Gateway 5xx | > 5% in 5 min | Slack + Email |
| Aurora CPU | > 80% for 5 min | Auto-scale ACU |
| Lambda Duration (emergency) | > 5s p95 | Slack |
| WebSocket Disconnections | > 100 in 1 min | Slack |
| Redis Memory | > 80% | Email |
| Push Delivery Failures | > 10% in 5 min | Slack |

**X-Ray Tracing**:
- Enabled on all Lambdas
- Trace emergency flow end-to-end: API → Lambda → Aurora → SNS → APNs/FCM
- Custom subsegments for Stream.io token generation, Razorpay calls

### 4.2 Security Hardening

**Services**: WAF, Shield, KMS, GuardDuty

| Service | Purpose |
|---------|---------|
| WAF on API Gateway | Rate limiting (100 req/s per IP), SQL injection protection, geo-blocking |
| WAF on CloudFront | Bot protection, DDoS mitigation |
| Shield Standard | DDoS protection (free tier) |
| KMS | Encryption keys for S3, Aurora, Redis |
| GuardDuty | Threat detection on AWS account |
| Secrets Manager | Rotate DB passwords, API keys automatically |

**WAF Rules**:
```
1. Rate limit: 100 requests/second per IP (blanket)
2. Rate limit: 10 requests/second per IP on /auth/* (brute force)
3. Rate limit: 5 requests/minute per IP on /emergency/create (abuse prevention)
4. Block known bad user agents
5. Geo-restrict to operating countries (India initially)
6. SQL injection rule set (AWS managed)
7. XSS rule set (AWS managed)
```

---

## Phase 5: Scaling & Optimization (Weeks 10-12)

### 5.1 Auto-Scaling Configuration

**Aurora**:
- Serverless v2: min 0.5 ACU → max 32 ACU
- Read replica auto-scaling: 1-3 replicas based on CPU

**Lambda**:
- Reserved concurrency on critical paths:
  - Emergency: 50
  - Auth: 25
  - Payment webhooks: 10
- Provisioned concurrency (zero cold starts):
  - Emergency: 5
  - Auth: 5

**ECS Fargate** (Dashboard):
- Min: 2 tasks, Max: 10 tasks
- Scale on CPU (target 60%) and request count

### 5.2 Multi-Region Readiness

**Phase 5+ (when expanding beyond India)**:
```
Primary: ap-south-1 (Mumbai)
DR/Expansion: ap-southeast-1 (Singapore) or me-south-1 (Bahrain)
```

- Aurora Global Database (async replication, <1s lag)
- API Gateway edge-optimized endpoints
- CloudFront with regional edge caches
- S3 Cross-Region Replication for evidence bucket
- Route 53 latency-based routing

---

## Phase 6: Mobile App Changes

### 6.1 SDK/Client Updates

**Replace in app**:

| Current | New | File(s) |
|---------|-----|---------|
| `@supabase/supabase-js` (DB queries) | Direct REST calls to API Gateway | All services |
| `@supabase/supabase-js` (Auth) | `amazon-cognito-identity-js` | `auth.context.tsx`, `auth.service.ts` |
| `@supabase/supabase-js` (Realtime) | Native WebSocket to API Gateway WSS | `streamChat.service.ts`, tracking |
| Expo Push token registration | SNS endpoint registration | `notification.service.ts` |
| `supabase.from('table')` queries | `fetch()` to API Gateway endpoints | All services |

### 6.2 API Client Refactor

Create a centralized API client:

```typescript
// src/lib/api.ts
class DeepHorizonAPI {
  private baseUrl = 'https://api.deephorizon.com';

  async request(path: string, options: RequestInit) {
    const token = await getAuthToken(); // Cognito JWT
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  // Typed methods for each endpoint
  emergency = {
    create: (data) => this.request('/emergency/create', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => this.request(`/emergency/${id}`, { method: 'GET' }),
  };

  checkin = {
    schedule: (data) => this.request('/checkin/schedule', { method: 'POST', body: JSON.stringify(data) }),
    complete: (id) => this.request(`/checkin/${id}/complete`, { method: 'POST' }),
  };
  // ... etc
}
```

### 6.3 WebSocket Client

```typescript
// src/lib/realtime.ts
class RealtimeClient {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, (data: any) => void> = new Map();

  connect(token: string) {
    this.ws = new WebSocket(`wss://ws.deephorizon.com?token=${token}`);
    this.ws.onmessage = (event) => {
      const { channel, data } = JSON.parse(event.data);
      this.subscriptions.get(channel)?.(data);
    };
  }

  subscribe(channel: string, callback: (data: any) => void) {
    this.subscriptions.set(channel, callback);
    this.ws?.send(JSON.stringify({ action: 'subscribe', channel }));
  }
}
```

---

## Cost Estimate (Monthly)

### Low Traffic (1,000 users, 100 DAU)

| Service | Config | Cost/month |
|---------|--------|------------|
| Aurora Serverless v2 | 0.5-2 ACU | ~$45 |
| ElastiCache Redis | Serverless (low usage) | ~$15 |
| Lambda | ~500K invocations | ~$5 |
| API Gateway | ~1M requests | ~$3.50 |
| S3 | 10 GB | ~$0.25 |
| CloudFront | 50 GB transfer | ~$5 |
| SNS (Push) | 100K notifications | ~$0.05 |
| CloudWatch | Logs + metrics | ~$10 |
| Secrets Manager | 10 secrets | ~$4 |
| NAT Gateway | 1 AZ | ~$32 |
| **Total** | | **~$120/month** |

### Medium Traffic (10,000 users, 1,000 DAU)

| Service | Config | Cost/month |
|---------|--------|------------|
| Aurora Serverless v2 | 1-8 ACU + read replica | ~$200 |
| ElastiCache Redis | Serverless (moderate) | ~$50 |
| Lambda | ~5M invocations | ~$25 |
| API Gateway | ~10M requests | ~$35 |
| S3 | 100 GB | ~$2.50 |
| CloudFront | 500 GB transfer | ~$45 |
| SNS (Push) | 1M notifications | ~$0.50 |
| CloudWatch | Logs + metrics + alarms | ~$30 |
| WAF | Basic rules | ~$10 |
| NAT Gateway | 2 AZ | ~$64 |
| **Total** | | **~$462/month** |

### High Traffic (100,000 users, 10,000 DAU)

| Service | Config | Cost/month |
|---------|--------|------------|
| Aurora Serverless v2 | 4-32 ACU + 2 read replicas | ~$800 |
| ElastiCache Redis | r7g.large | ~$200 |
| Lambda | ~50M invocations | ~$150 |
| API Gateway | ~100M requests | ~$350 |
| ECS Fargate (Dashboard) | 2-10 tasks | ~$150 |
| S3 | 1 TB | ~$25 |
| CloudFront | 5 TB transfer | ~$400 |
| SNS (Push) | 10M notifications | ~$5 |
| CloudWatch + X-Ray | Full observability | ~$100 |
| WAF + Shield | Full protection | ~$50 |
| NAT Gateway | 2 AZ | ~$64 |
| **Total** | | **~$2,294/month** |

---

## Migration Timeline

```
Week 1-2:   AWS account, VPC, CDK setup, Secrets Manager
Week 2-3:   Aurora PostgreSQL setup + data migration
Week 3-4:   Lambda functions (auth, emergency, checkin, payment)
Week 4-5:   Lambda functions (tracking, chat, stream, notification)
Week 5-6:   API Gateway setup, Cognito auth migration
Week 6-7:   WebSocket real-time, SNS push notifications
Week 7-8:   S3 storage, CloudFront CDN
Week 8-9:   Mobile app API client refactor
Week 9-10:  CloudWatch dashboards, WAF, security hardening
Week 10-11: Load testing, performance tuning
Week 11-12: Staged rollout (10% → 50% → 100%)
Week 12+:   Decommission Supabase, Vercel
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Run Aurora + Supabase in parallel for 2 weeks; dual-write |
| Auth disruption | Support both Supabase + Cognito tokens during transition |
| Cold start latency (Lambda) | Provisioned concurrency on emergency + auth functions |
| WebSocket reliability | Keep polling fallback in chat; auto-reconnect logic |
| Cost overrun | Set AWS Budgets alerts at 80% and 100% of estimate |
| Stream.io vendor lock | Keep Stream.io for now; evaluate Amazon Chime SDK later |

---

## What NOT to Migrate (Keep As-Is)

| Service | Reason |
|---------|--------|
| **Stream.io** (Video/Audio) | WebRTC infrastructure is complex; Stream.io handles it well. Evaluate Amazon Chime SDK in Phase 7+ |
| **Razorpay** (Android payments) | Payment provider is business decision, not infrastructure |
| **Apple StoreKit** (iOS payments) | Required by Apple, no alternative |
| **Expo EAS** (Build/Deploy) | Best-in-class for React Native builds |
| **Expo Push** (during transition) | Keep as fallback while SNS ramps up |

---

## Prerequisites Before Starting

1. **AWS Account**: Create with billing alerts enabled
2. **Domain**: Point `api.deephorizon.com` and `ws.deephorizon.com` to Route 53
3. **SSL Certificates**: ACM certificates for API Gateway + CloudFront
4. **CI/CD**: GitHub Actions → deploy Lambda + CDK (or use CodePipeline)
5. **Staging Environment**: Full AWS stack in separate account for testing
