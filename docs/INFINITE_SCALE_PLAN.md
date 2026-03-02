# DeepHorizon Security — Infinite Scale Architecture

## Design Principles

1. **Zero single points of failure** — Every component has a standby
2. **Horizontally scalable** — Add capacity by adding instances, not upgrading
3. **Queue everything** — Decouple producers from consumers; never drop requests
4. **Cache aggressively** — Never hit the database for the same data twice
5. **Fail gracefully** — Circuit breakers, retries, fallbacks at every layer
6. **Self-healing** — Auto-detect failures, auto-recover, auto-scale
7. **Observe everything** — If you can't measure it, you can't fix it

---

## Architecture Overview

```
Users (Unlimited)
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Route 53   │────▶│  CloudFront │  Global Edge (400+ PoPs)
│  (DNS)      │     │  + WAF      │  DDoS protection, caching
└─────────────┘     └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────┴──────┐  ┌─┴──────┐  ┌──┴─────────┐
       │ API Gateway │  │  ALB   │  │ API Gateway │
       │  (REST)     │  │(Dash)  │  │ (WebSocket) │
       └──────┬──────┘  └──┬─────┘  └──────┬──────┘
              │            │               │
       ┌──────┴──────┐  ┌─┴──────┐  ┌─────┴──────┐
       │   Lambda    │  │  ECS   │  │  Lambda    │
       │ (API Tier)  │  │Fargate │  │ (WS Tier)  │
       └──────┬──────┘  └──┬─────┘  └─────┬──────┘
              │            │               │
    ┌─────────┴────────────┴───────────────┘
    │
    ▼
┌─────────┐  ┌───────────┐  ┌────────┐  ┌──────┐  ┌─────┐
│ Aurora  │  │ElastiCache│  │  SQS   │  │  S3  │  │ SNS │
│ Global  │  │  Redis    │  │Queues  │  │      │  │     │
│ DB      │  │  Cluster  │  │        │  │      │  │     │
└────┬────┘  └───────────┘  └────┬───┘  └──────┘  └──┬──┘
     │                           │                    │
┌────┴────┐                 ┌────┴───┐           ┌────┴───┐
│ Read    │                 │ Lambda │           │ APNs / │
│Replicas │                 │Workers │           │  FCM   │
│ (Auto)  │                 └────────┘           └────────┘
└─────────┘
```

---

## Layer 1: Edge — Never Let Bad Traffic In

### Route 53 (DNS)

- **Health-checked endpoints** — Auto-failover to DR region if primary is down
- **Latency-based routing** — Users hit closest region
- **Weighted routing** — Canary deployments (5% → 25% → 100%)

### CloudFront (CDN + Shield)

- **400+ edge locations** globally
- **Shield Advanced** ($3K/mo) — DDoS protection with 24/7 response team
- **WAF rules**:

```
Layer 1: Rate limiting
├── Global: 1,000 req/s per IP
├── /auth/*: 10 req/s per IP (brute force)
├── /emergency/create: 5 req/min per user (abuse)
└── /payment/*: 3 req/min per IP

Layer 2: Bot protection
├── AWS Managed Bot Control
├── Block known bad user agents
└── CAPTCHA challenge on suspicious patterns

Layer 3: Geo-restriction
├── Allow: IN, US, UK, AE, SG (expand as needed)
└── Block: Known attack source countries

Layer 4: Input validation
├── SQL injection rule set
├── XSS rule set
└── Request size limit: 10KB body
```

### Why This Matters
- CloudFront absorbs DDoS attacks at the edge — your servers never see the traffic
- WAF blocks bad requests before they reach Lambda — saves cost and protects DB
- Shield Advanced guarantees uptime even under nation-state level attacks

---

## Layer 2: Compute — Infinitely Scalable API

### API Gateway (REST + WebSocket)

**REST API** (`api.deephorizon.com`):
- Burst limit: 10,000 req/s (can request increase to 100K+)
- Steady-state: 5,000 req/s default
- Cognito Authorizer: JWT validation at gateway level (Lambda never touched for bad tokens)
- Request/response caching: 5 min TTL for read endpoints
- Throttling per API key for B2B partners

**WebSocket API** (`ws.deephorizon.com`):
- 500K concurrent connections default (can increase)
- Connection tracked in DynamoDB (connectionId → userId)
- Idle timeout: 10 min (client sends ping every 5 min)
- Auto-reconnect logic in mobile app

### Lambda Functions (Stateless Compute)

**Architecture: Domain-separated functions**

```
Functions (each independently scalable):
├── auth-handler          (256MB, 15s, provisioned: 10)
├── user-handler          (256MB, 10s)
├── emergency-handler     (512MB, 15s, provisioned: 20)  ← CRITICAL
├── checkin-handler       (256MB, 10s)
├── tracking-handler      (256MB, 10s)
├── chat-handler          (256MB, 10s)
├── payment-handler       (512MB, 60s)
├── notification-worker   (256MB, 30s)  ← SQS triggered
├── tracking-worker       (256MB, 15s)  ← SQS triggered
├── stream-token-handler  (256MB, 10s)
├── websocket-connect     (128MB, 5s)
├── websocket-disconnect  (128MB, 5s)
└── websocket-message     (256MB, 10s)
```

**Scaling Config**:
| Function | Reserved Concurrency | Provisioned Concurrency | Max Burst |
|----------|---------------------|------------------------|-----------|
| emergency-handler | 200 | 20 | 3,000 |
| auth-handler | 100 | 10 | 3,000 |
| notification-worker | 500 | 0 | 3,000 |
| tracking-worker | 300 | 0 | 3,000 |
| All others | 50 each | 0 | 3,000 |

**Why Lambda scales infinitely**:
- Each request = 1 Lambda instance
- AWS spins up new instances in milliseconds
- Default: 3,000 concurrent executions (can request 10,000+)
- You only pay for what you use
- Zero servers to manage

### ECS Fargate (Dashboard)

- Min: 3 tasks (multi-AZ), Max: 50 tasks
- Auto-scale on CPU (target 50%) and request count
- Rolling deployment: 1 task at a time, health check before proceeding
- Circuit breaker: Auto-rollback if 50% of tasks fail health check

---

## Layer 3: Data — The Most Critical Layer

### Aurora PostgreSQL Global Database

**Why Aurora Global over standard RDS**:
- Writes replicate to secondary region in < 1 second
- Automatic failover: Promote secondary to primary in < 1 minute
- Up to 15 read replicas per region
- Storage auto-scales to 128 TB
- Continuous backup to S3 (point-in-time recovery to the second)

**Cluster Architecture**:

```
Primary Region (ap-south-1 Mumbai)
├── Writer Instance (db.r6g.xlarge) — All writes
├── Read Replica 1 (db.r6g.large)  — App reads
├── Read Replica 2 (db.r6g.large)  — Dashboard queries
└── Read Replica 3 (auto-added)    — Scales under load

Secondary Region (ap-southeast-1 Singapore)  [DR]
├── Reader Instance (db.r6g.large) — Promoted to writer on failover
└── Read Replica 1 (db.r6g.large)  — Regional reads
```

**Connection Management — RDS Proxy (CRITICAL)**:

Lambda functions are stateless — each invocation opens a new DB connection. Without pooling, 1,000 concurrent Lambdas = 1,000 DB connections = database crash.

```
RDS Proxy (writer)  → Aurora Writer    (max 200 connections)
RDS Proxy (reader)  → Read Replicas   (max 500 connections)
```

RDS Proxy pools connections: 10,000 Lambda instances share 200 actual DB connections. This is what makes Lambda + PostgreSQL work at scale.

**Read/Write Splitting**:
| Operation | Target | Why |
|-----------|--------|-----|
| Emergency create | Writer | Must be consistent |
| Subscription check | Reader (cached) | Read-heavy, cacheable |
| Profile load | Reader (cached) | Read-heavy, cacheable |
| Location insert | Writer (via SQS) | Write, but async is OK |
| History queries | Reader | Read-only |
| Chat messages | Writer | Must be consistent |
| Check-in complete | Writer | Must be consistent |

**Database Optimization**:
```sql
-- Partition large tables by time (tracking_locations grows fast)
CREATE TABLE tracking_locations (
    id UUID PRIMARY KEY,
    tracking_session_id UUID,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    recorded_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (recorded_at);

-- Monthly partitions — old data auto-archived
CREATE TABLE tracking_locations_2026_01 PARTITION OF tracking_locations
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Archive partitions older than 6 months to S3 via pg_dump
-- Query performance stays constant regardless of total data size
```

### ElastiCache Redis (Cluster Mode)

**Why cluster mode**:
- Data sharded across nodes — no single node bottleneck
- Auto-failover: Replica promoted in < 30 seconds
- Scale by adding shards (horizontal) not bigger instances

**Cluster Config**:
```
Redis Cluster (3 shards, 1 replica each = 6 nodes)
├── Shard 1: user data, profiles, subscriptions
├── Shard 2: sessions, auth tokens, rate limits
└── Shard 3: real-time state (tracking, WebSocket connections)
```

**Caching Strategy**:

| Pattern | Key | TTL | Invalidation |
|---------|-----|-----|-------------|
| **User profile** | `user:{id}:profile` | 5 min | On profile update (write-through) |
| **Subscription** | `user:{id}:sub` | 2 min | On payment event |
| **Trial status** | `user:{id}:trial` | 10 min | On subscription create |
| **Session** | `session:{token_hash}` | Matches JWT expiry | On logout/refresh |
| **Rate limit** | `rl:{ip}:{endpoint}` | 1 min | Auto-expire |
| **Active tracking** | `track:{session_id}:loc` | 30 sec | Overwrite on new location |
| **WebSocket map** | `ws:{connection_id}` | 12 hours | On disconnect |
| **Check-in status** | `checkin:{id}:status` | 1 min | On status change |

**Cache-Aside Pattern** (used in all Lambda functions):
```
1. Check Redis → if hit, return cached data
2. If miss → query Aurora Reader → store in Redis → return
3. On write → update Aurora → delete Redis key (next read refills)
```

**Impact**: Reduces database load by 80-90%. Most reads never touch Aurora.

### DynamoDB (WebSocket Connection Registry)

**Why DynamoDB for WebSocket**:
- Millisecond reads at any scale
- No connection pooling needed
- Pay per request (perfect for spiky WebSocket traffic)
- TTL auto-deletes stale connections

```
Table: websocket-connections
├── PK: connectionId (API Gateway connection ID)
├── userId: string
├── connectedAt: number
├── ttl: number (auto-delete after 12 hours)
└── GSI: userId-index (find all connections for a user)
```

**Broadcast pattern** (e.g., emergency status update):
```
1. Query DynamoDB GSI: all connectionIds for userId
2. For each connectionId: API Gateway postToConnection()
3. If connection gone (410): delete from DynamoDB
```

---

## Layer 4: Async Processing — Never Drop a Request

### SQS Queues (Decouple Everything)

**The #1 rule for never crashing**: Never process heavy work synchronously. Queue it.

```
Queues:
├── emergency-queue (FIFO, dedup)     ← Emergency creation pipeline
├── notification-queue (Standard)      ← Push notification delivery
├── tracking-location-queue (Standard) ← Location point ingestion
├── payment-webhook-queue (FIFO)       ← Payment event processing
├── chat-message-queue (Standard)      ← Message delivery pipeline
└── dead-letter-queue (Standard)       ← Failed messages for investigation
```

**Emergency Flow (Zero-Loss Guarantee)**:

```
App → API Gateway → Lambda (validate + respond 200) → SQS FIFO
                         │                               │
                    Return to user               Lambda Worker
                    in < 500ms                        │
                                              ┌──────┴──────┐
                                              │ Aurora      │
                                              │ (create)    │
                                              ├─────────────┤
                                              │ SNS Push    │
                                              │ (notify)    │
                                              ├─────────────┤
                                              │ WebSocket   │
                                              │ (real-time) │
                                              ├─────────────┤
                                              │ Dashboard   │
                                              │ (alert)     │
                                              └─────────────┘
```

**Why this never fails**:
1. API Lambda validates input and immediately puts message on SQS → responds 200 to user
2. User gets instant confirmation (< 500ms)
3. SQS guarantees message delivery (retries 3 times, then dead-letter queue)
4. Worker Lambda processes asynchronously — if it fails, SQS retries
5. Dead-letter queue catches truly broken messages for manual review
6. **Result**: Even if Aurora is down, the emergency is queued and processed when DB recovers

**Location Ingestion (High Volume)**:

During active tracking, each user sends location every 5-30 seconds. With 10,000 users tracking simultaneously = 2,000 location writes/second.

```
App → API Gateway → Lambda → SQS (batch) → Lambda Worker → Aurora (batch INSERT)
```

- Lambda worker receives batch of 10 messages → single batch INSERT
- Reduces DB writes by 10x
- SQS absorbs traffic spikes — DB never overwhelmed

### EventBridge (Event Bus)

Cross-domain events without coupling:

```
Events:
├── emergency.created    → Triggers: notification, dashboard alert, agent assignment
├── emergency.resolved   → Triggers: notification, status update
├── checkin.missed       → Triggers: notification, escalation
├── subscription.created → Triggers: cache invalidation, welcome email
├── subscription.expired → Triggers: cache invalidation, reminder
├── tracking.started     → Triggers: dashboard update
└── user.deleted         → Triggers: data cleanup across all services
```

**Why EventBridge over direct Lambda calls**:
- Publisher doesn't know about subscribers
- Add new reactions without changing existing code
- Built-in retry and dead-letter support
- Event archive for replay and debugging

---

## Layer 5: Notifications — Guaranteed Delivery

### Architecture

```
Trigger (Lambda/EventBridge)
       │
       ▼
  SQS Queue (notification-queue)
       │
       ▼
  Lambda Worker (notification-worker)
       │
       ├──▶ SNS → APNs (iOS)
       ├──▶ SNS → FCM (Android)
       ├──▶ WebSocket (in-app real-time)
       └──▶ Pinpoint (email/SMS fallback)
```

**Delivery Guarantees**:

| Priority | Type | Strategy |
|----------|------|----------|
| P0 (Critical) | Emergency alerts | SNS + WebSocket + SMS fallback (Pinpoint) |
| P1 (High) | Incoming calls, check-in due | SNS + WebSocket |
| P2 (Normal) | Chat messages | WebSocket primary, SNS if offline |
| P3 (Low) | General updates | SNS only, batched |

**Fallback Chain for P0 (Emergency)**:
```
1. WebSocket push (instant, if connected)
2. SNS → APNs/FCM (< 2 seconds)
3. If no delivery confirmation in 30s → SMS via Pinpoint
4. If SMS fails → Email via SES
5. Log all delivery attempts for audit
```

**SNS Delivery Status Logging**:
- Enable delivery status for APNs and FCM
- CloudWatch metrics: delivery rate, failure rate, latency
- Alarm if delivery rate drops below 95%

---

## Layer 6: Security — Defense in Depth

### Authentication (Cognito + Custom)

```
Mobile App → API Gateway Cognito Authorizer → Lambda
                    │
                    ├── Token validation at gateway (zero Lambda cost for bad tokens)
                    ├── Token refresh handled by Cognito SDK
                    ├── MFA enforcement for sensitive operations
                    └── Custom Lambda triggers for 2Factor OTP integration
```

**Token Strategy**:
- Access token: 15 min expiry (short-lived)
- Refresh token: 30 days
- ID token: 1 hour (user claims)
- Tokens cached in Redis on first use → subsequent API calls skip Cognito

### Encryption

| Data State | Method |
|-----------|--------|
| In transit | TLS 1.3 everywhere (CloudFront, API Gateway, Aurora, Redis) |
| At rest (DB) | Aurora encryption (AES-256 via KMS) |
| At rest (S3) | SSE-KMS (customer-managed key) |
| At rest (Redis) | In-transit + at-rest encryption |
| At rest (SQS) | SSE-KMS |
| Secrets | AWS Secrets Manager (auto-rotation) |
| Emergency evidence | S3 + KMS + Object Lock (WORM — tamper-proof) |

### Network Security

```
VPC Layout:
├── Public Subnets (2 AZs)
│   ├── NAT Gateways (for Lambda outbound)
│   └── ALB (Dashboard)
│
├── Private Subnets (2 AZs)
│   ├── Lambda functions (all)
│   ├── ECS Fargate tasks
│   ├── Aurora instances
│   └── ElastiCache nodes
│
└── Security Groups:
    ├── lambda-sg → Aurora:5432, Redis:6379 only
    ├── aurora-sg → Accept from lambda-sg, ecs-sg only
    ├── redis-sg  → Accept from lambda-sg, ecs-sg only
    └── alb-sg    → Accept 443 from CloudFront IPs only
```

No database or cache is accessible from the internet. Period.

---

## Layer 7: Observability — See Everything

### CloudWatch Dashboards

**Dashboard 1: Executive Overview**
```
┌─────────────────┬────────────────┬──────────────────┐
│ Active Users    │ Emergencies    │ System Health    │
│ (real-time)     │ (last 24h)     │ (all services)   │
├─────────────────┼────────────────┼──────────────────┤
│ API Latency     │ Error Rate     │ Push Delivery    │
│ (p50/p95/p99)   │ (4xx/5xx)      │ Rate (%)         │
├─────────────────┼────────────────┼──────────────────┤
│ DB Connections  │ Cache Hit Rate │ Queue Depth      │
│ (used/max)      │ (%)            │ (messages)       │
└─────────────────┴────────────────┴──────────────────┘
```

**Dashboard 2: Emergency Response (Critical)**
```
┌──────────────────────────────────────────────────────┐
│ Emergency Create → Agent Assign → User Notified     │
│ (end-to-end latency in real-time)                    │
├─────────────────┬────────────────┬──────────────────┤
│ Active          │ Mean Response  │ Failed            │
│ Emergencies     │ Time           │ Notifications     │
└─────────────────┴────────────────┴──────────────────┘
```

### Alarms (PagerDuty Integration)

**Severity 1 — Page immediately (24/7)**:
| Alarm | Condition | Action |
|-------|-----------|--------|
| Emergency Lambda errors | Any error in 1 min | PagerDuty + SMS to on-call |
| Emergency latency | p99 > 3s for 2 min | PagerDuty |
| Aurora writer down | Failover event | PagerDuty |
| Push delivery rate | < 90% for 5 min | PagerDuty |
| Dead letter queue | Any message arrives | PagerDuty |

**Severity 2 — Alert team (business hours)**:
| Alarm | Condition | Action |
|-------|-----------|--------|
| API 5xx rate | > 1% for 5 min | Slack |
| Lambda throttles | Any throttle | Slack |
| Aurora CPU | > 70% for 10 min | Slack (auto-scale kicks in) |
| Redis memory | > 75% | Slack |
| SQS queue depth | > 1,000 for 5 min | Slack |
| Cache hit rate | < 80% | Slack |

**Severity 3 — Informational**:
| Alarm | Condition | Action |
|-------|-----------|--------|
| Daily active users | Change > 20% | Email |
| Monthly cost | > budget threshold | Email |
| Certificate expiry | < 30 days | Email |

### X-Ray Distributed Tracing

Every request traced end-to-end:
```
User Request
└── API Gateway (2ms)
    └── Lambda: auth-handler (15ms)
        ├── Redis: get session (1ms)
        ├── Aurora: query user (5ms)
        └── Response (total: 23ms)
```

**Custom trace for emergency flow**:
```
Emergency Create
└── API Gateway (2ms)
    └── Lambda: emergency-handler (45ms)
        ├── Redis: check subscription (1ms)
        ├── Aurora: insert emergency (8ms)
        ├── SQS: send notification message (3ms)
        └── SQS: send dashboard alert (2ms)
            ·
            · (async, separate trace)
            ·
            └── Lambda: notification-worker (120ms)
                ├── Aurora: get user devices (5ms)
                ├── SNS: publish to APNs (80ms)
                ├── SNS: publish to FCM (60ms)
                └── WebSocket: push to dashboard (15ms)
```

---

## Layer 8: Disaster Recovery — Zero Data Loss

### RPO and RTO Targets

| Metric | Target | How |
|--------|--------|-----|
| **RPO** (max data loss) | < 1 second | Aurora Global DB async replication |
| **RTO** (max downtime) | < 5 minutes | Automated failover + Route 53 health checks |

### Failover Architecture

```
Normal Operation:
  Users → Route 53 → ap-south-1 (Mumbai) → Aurora Writer + Read Replicas

Disaster (Mumbai down):
  Users → Route 53 (health check fails)
       → ap-southeast-1 (Singapore)
       → Aurora Secondary promoted to Writer (< 1 min)
       → Lambda + API Gateway (already deployed in both regions)
       → Full service restored (< 5 min total)
```

### Backup Strategy

| Data | Method | Retention | Recovery |
|------|--------|-----------|----------|
| Aurora | Continuous backup + snapshots | 35 days PITR | Restore to any second |
| Aurora | Daily snapshot to S3 (cross-region) | 90 days | Restore from snapshot |
| Redis | Daily snapshot | 7 days | Restore from snapshot |
| S3 evidence | Cross-region replication | Indefinite | Already replicated |
| SQS dead-letter | Alarm + manual review | 14 days | Replay messages |
| DynamoDB | Point-in-time recovery | 35 days | Restore to any second |

### Chaos Engineering (Quarterly)

Run these tests to prove resilience:
1. **Kill a read replica** → Verify traffic routes to remaining replicas
2. **Throttle Lambda** → Verify SQS queues absorb traffic and retry
3. **Redis node failure** → Verify auto-failover and cache rebuild
4. **Block Aurora writer** → Verify auto-failover to standby
5. **Spike 10x traffic** → Verify auto-scaling responds in < 2 minutes
6. **Kill NAT Gateway** → Verify multi-AZ NAT handles failover

---

## Layer 9: Mobile App Architecture for Scale

### API Client with Resilience

```typescript
// src/lib/api.ts — Production API client

class DeepHorizonAPI {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;
  private retryConfig = { maxRetries: 3, backoff: [1000, 2000, 4000] };

  async request<T>(path: string, options: RequestInit): Promise<T> {
    // 1. Circuit breaker — stop calling if server is down
    if (this.circuitBreaker.isOpen()) {
      return this.fallbackResponse(path);
    }

    // 2. Retry with exponential backoff
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const token = await this.getAuthToken();
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Request-ID': generateUUID(), // For tracing
          },
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (response.ok) {
          this.circuitBreaker.recordSuccess();
          return response.json();
        }

        if (response.status === 401) {
          await this.refreshToken();
          continue; // Retry with new token
        }

        if (response.status >= 500) {
          this.circuitBreaker.recordFailure();
          if (attempt < this.retryConfig.maxRetries) {
            await sleep(this.retryConfig.backoff[attempt]);
            continue;
          }
        }

        throw new APIError(response.status, await response.text());
      } catch (error) {
        if (attempt === this.retryConfig.maxRetries) throw error;
        await sleep(this.retryConfig.backoff[attempt]);
      }
    }
  }
}
```

### Circuit Breaker Pattern

```typescript
// Prevents cascade failures when backend is down

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly FAILURE_THRESHOLD = 5;    // Open after 5 failures
  private readonly RECOVERY_TIME = 30000;     // Try again after 30s

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if recovery time has passed
      if (Date.now() - this.lastFailure > this.RECOVERY_TIME) {
        this.state = 'half-open'; // Allow one test request
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.FAILURE_THRESHOLD) {
      this.state = 'open';
    }
  }
}
```

### Offline-First for Critical Features

```typescript
// Emergency creation works even offline

async createEmergency(data: EmergencyData): Promise<void> {
  try {
    // Try online first
    await api.emergency.create(data);
  } catch (error) {
    // Network failed — queue locally
    await AsyncStorage.setItem(
      `offline_emergency_${Date.now()}`,
      JSON.stringify(data)
    );

    // Register background task to retry when online
    BackgroundFetch.registerTask('sync-offline-emergencies');

    // Still show user confirmation
    Alert.alert('Emergency Sent',
      'Your emergency has been queued and will be sent when connection is restored.');
  }
}

// Background sync worker
async function syncOfflineEmergencies() {
  const keys = await AsyncStorage.getAllKeys();
  const emergencyKeys = keys.filter(k => k.startsWith('offline_emergency_'));

  for (const key of emergencyKeys) {
    try {
      const data = JSON.parse(await AsyncStorage.getItem(key));
      await api.emergency.create(data);
      await AsyncStorage.removeItem(key);
    } catch {
      break; // Still offline, try again later
    }
  }
}
```

### WebSocket with Auto-Reconnect

```typescript
// Never lose real-time connection

class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000; // Max 30s between retries
  private subscriptions = new Map<string, Set<Function>>();

  connect(token: string) {
    this.ws = new WebSocket(`wss://ws.deephorizon.com?token=${token}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Re-subscribe to all channels after reconnect
      for (const channel of this.subscriptions.keys()) {
        this.ws.send(JSON.stringify({ action: 'subscribe', channel }));
      }
    };

    this.ws.onclose = () => {
      // Exponential backoff reconnect
      const delay = Math.min(
        1000 * Math.pow(2, this.reconnectAttempts),
        this.maxReconnectDelay
      );
      this.reconnectAttempts++;
      setTimeout(() => this.connect(token), delay);
    };

    this.ws.onmessage = (event) => {
      const { channel, data } = JSON.parse(event.data);
      const handlers = this.subscriptions.get(channel);
      handlers?.forEach(fn => fn(data));
    };
  }
}
```

---

## Layer 10: CI/CD — Safe Deployments

### Pipeline

```
GitHub Push
    │
    ▼
GitHub Actions
    ├── Lint + Type Check (2 min)
    ├── Unit Tests (3 min)
    ├── CDK Diff (show infra changes)
    │
    ▼ (on merge to main)
    ├── Build Lambda packages
    ├── CDK Deploy to Staging
    ├── Integration Tests on Staging (5 min)
    │
    ▼ (manual approval for production)
    ├── CDK Deploy to Production (canary)
    │   ├── 5% traffic for 10 minutes
    │   ├── Monitor error rate + latency
    │   ├── Auto-rollback if errors > 1%
    │   └── Promote to 100% if healthy
    │
    └── Post-deploy smoke tests
```

### Infrastructure as Code (AWS CDK)

```
cdk/
├── lib/
│   ├── vpc-stack.ts          — VPC, subnets, NAT
│   ├── database-stack.ts     — Aurora, RDS Proxy
│   ├── cache-stack.ts        — ElastiCache Redis
│   ├── api-stack.ts          — API Gateway, Lambda functions
│   ├── websocket-stack.ts    — WebSocket API, DynamoDB
│   ├── queue-stack.ts        — SQS queues, dead-letter
│   ├── notification-stack.ts — SNS, Pinpoint
│   ├── storage-stack.ts      — S3, CloudFront
│   ├── security-stack.ts     — WAF, KMS, Cognito
│   └── monitoring-stack.ts   — CloudWatch, alarms
├── bin/
│   └── app.ts                — Stack composition
└── test/
    └── *.test.ts             — Infrastructure tests
```

Every infrastructure change is code-reviewed, tested, and deployed through the pipeline. No manual AWS console changes.

---

## Cost at Scale

### 100K Users / 10K DAU

| Service | Config | Monthly |
|---------|--------|---------|
| Aurora Global | Writer r6g.xl + 3 readers + DR | $1,200 |
| RDS Proxy | 2 endpoints | $150 |
| ElastiCache Redis | 3-shard cluster (6 nodes) | $600 |
| Lambda | ~100M invocations | $300 |
| API Gateway (REST) | ~200M requests | $700 |
| API Gateway (WS) | ~50K concurrent | $200 |
| DynamoDB | WS connections | $50 |
| SQS | ~500M messages | $200 |
| SNS Push | ~50M notifications | $25 |
| S3 + CloudFront | 5 TB transfer | $450 |
| CloudWatch + X-Ray | Full observability | $200 |
| WAF + Shield Standard | Protection | $60 |
| Cognito | 100K MAU | $275 |
| NAT Gateway | 2 AZ | $64 |
| Secrets Manager | 15 secrets | $6 |
| Route 53 | Hosted zone + health checks | $5 |
| **Total** | | **~$4,485/mo** |

### 1M Users / 100K DAU

| Service | Config | Monthly |
|---------|--------|---------|
| Aurora Global | Writer r6g.2xl + 5 readers + DR | $3,500 |
| RDS Proxy | 4 endpoints | $300 |
| ElastiCache Redis | 6-shard cluster (12 nodes) | $1,800 |
| Lambda | ~1B invocations | $2,000 |
| API Gateway | ~2B requests | $7,000 |
| DynamoDB | WS connections (high traffic) | $300 |
| SQS | ~5B messages | $2,000 |
| SNS Push | ~500M notifications | $250 |
| S3 + CloudFront | 50 TB transfer | $4,000 |
| CloudWatch + X-Ray | Full observability | $500 |
| WAF + Shield Advanced | Enterprise protection | $3,500 |
| Cognito | 1M MAU | $2,750 |
| **Total** | | **~$27,900/mo** |

### 10M Users / 1M DAU

At this scale, negotiate AWS Enterprise Discount Program (EDP):
- 20-30% discount on committed spend
- Dedicated Solutions Architect
- Estimated: **~$150K-200K/mo** (before EDP discount)

---

## Migration Priority Order

**Do first** (biggest impact, least risk):
1. SQS queues for emergency + notifications (decouple, never lose requests)
2. ElastiCache Redis (reduce Supabase DB load by 80%)
3. Aurora PostgreSQL (remove Supabase DB limits)
4. Lambda functions (replace Edge Functions + Vercel)

**Do second** (important but more complex):
5. API Gateway + Cognito (full API layer)
6. WebSocket real-time (replace Supabase Realtime)
7. SNS push notifications (replace Expo Push)
8. S3 + CloudFront (storage and CDN)

**Do last** (polish):
9. WAF + security hardening
10. CloudWatch + X-Ray observability
11. CI/CD pipeline
12. DR region setup
13. Mobile app refactor (new API client)

---

## The Bottom Line

| Metric | Current (Supabase) | After AWS |
|--------|-------------------|-----------|
| Max concurrent users | ~250 | Unlimited |
| Max total users | ~5,000 | Unlimited |
| Emergency response time | 2-5s (variable) | < 500ms (consistent) |
| Uptime SLA | None (Supabase Pro) | 99.99% (Aurora + Lambda) |
| Data durability | 99.9% | 99.999999999% (S3 eleven 9s) |
| Disaster recovery | Manual | Automated < 5 min |
| DDoS protection | None | Shield Advanced |
| Push delivery guarantee | Best-effort (Expo) | Multi-channel fallback |
| Observability | Console logs | Full distributed tracing |
