var markdownText = `
# Platform Engineering Handbook — Full Architecture Reference

This document covers the complete architecture of a large-scale distributed platform: networking, compute, data, CI/CD, observability, security, and incident response. It includes detailed diagrams for every layer.

---

## 1. Network Topology

The platform spans three regions with dedicated transit links, edge PoPs, and per-region service meshes.

\`\`\`mermaid
graph TB
    subgraph Internet["Public Internet"]
        USER[End Users]
        PARTNER[Partner APIs]
    end

    subgraph Edge["Edge Layer"]
        CF[Cloudflare CDN]
        CF_WAF[WAF Rules]
        CF_LB[Global Load Balancer]
        CF --> CF_WAF --> CF_LB
    end

    subgraph Region_EU["EU-West-1"]
        direction TB
        NLB_EU[Network LB]
        MESH_EU[Istio Service Mesh]
        subgraph K8s_EU["Kubernetes Cluster"]
            API_EU[API Gateway]
            SVC_EU_1[User Service]
            SVC_EU_2[Order Service]
            SVC_EU_3[Inventory Service]
            SVC_EU_4[Payment Service]
            SVC_EU_5[Search Service]
            SVC_EU_6[Notification Service]
        end
        NLB_EU --> MESH_EU --> API_EU
        API_EU --> SVC_EU_1 & SVC_EU_2 & SVC_EU_3
        API_EU --> SVC_EU_4 & SVC_EU_5 & SVC_EU_6
    end

    subgraph Region_US["US-East-1"]
        direction TB
        NLB_US[Network LB]
        MESH_US[Istio Service Mesh]
        subgraph K8s_US["Kubernetes Cluster"]
            API_US[API Gateway]
            SVC_US_1[User Service]
            SVC_US_2[Order Service]
            SVC_US_3[Inventory Service]
            SVC_US_4[Payment Service]
            SVC_US_5[Search Service]
            SVC_US_6[Notification Service]
        end
        NLB_US --> MESH_US --> API_US
        API_US --> SVC_US_1 & SVC_US_2 & SVC_US_3
        API_US --> SVC_US_4 & SVC_US_5 & SVC_US_6
    end

    subgraph Region_AP["AP-Southeast-1"]
        direction TB
        NLB_AP[Network LB]
        MESH_AP[Istio Service Mesh]
        subgraph K8s_AP["Kubernetes Cluster"]
            API_AP[API Gateway]
            SVC_AP_1[User Service]
            SVC_AP_2[Order Service]
            SVC_AP_3[Inventory Service]
            SVC_AP_4[Payment Service]
            SVC_AP_5[Search Service]
        end
        NLB_AP --> MESH_AP --> API_AP
        API_AP --> SVC_AP_1 & SVC_AP_2 & SVC_AP_3
        API_AP --> SVC_AP_4 & SVC_AP_5
    end

    USER --> CF
    PARTNER --> CF
    CF_LB --> NLB_EU & NLB_US & NLB_AP

    MESH_EU <-.->|Cross-region sync| MESH_US
    MESH_US <-.->|Cross-region sync| MESH_AP
    MESH_EU <-.->|Cross-region sync| MESH_AP
\`\`\`

Each region runs an identical Kubernetes cluster behind an Istio service mesh. Cross-region traffic uses mTLS over dedicated transit links. The edge layer (Cloudflare) handles DDoS mitigation, WAF rules, and geo-routing.

### Key design decisions

- **No single region is primary.** All regions are active-active with conflict-free replicated data types (CRDTs) for session state.
- **Service mesh sidecars** handle retries, circuit breaking, and mutual TLS — application code is unaware of cross-service auth.
- **Edge WAF** blocks OWASP Top 10 patterns before traffic reaches the network load balancers.

---

## 2. Data Architecture

### 2a. Storage Layer

\`\`\`mermaid
erDiagram
    TENANT ||--o{ WORKSPACE : owns
    TENANT {
        uuid id PK
        string name
        string plan
        date created_at
        boolean active
    }
    WORKSPACE ||--o{ PROJECT : contains
    WORKSPACE {
        uuid id PK
        uuid tenant_id FK
        string name
        string slug UK
        jsonb settings
    }
    PROJECT ||--o{ DOCUMENT : has
    PROJECT ||--o{ MEMBER : includes
    PROJECT {
        uuid id PK
        uuid workspace_id FK
        string name
        string status
        date deadline
    }
    MEMBER {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string role
        date joined_at
    }
    USER ||--o{ MEMBER : participates
    USER ||--o{ AUDIT_LOG : generates
    USER {
        uuid id PK
        string email UK
        string display_name
        string avatar_url
        jsonb preferences
        timestamp last_login
    }
    DOCUMENT ||--o{ REVISION : versioned_by
    DOCUMENT ||--o{ COMMENT : has
    DOCUMENT {
        uuid id PK
        uuid project_id FK
        uuid author_id FK
        string title
        text content
        string status
        timestamp published_at
    }
    REVISION {
        uuid id PK
        uuid document_id FK
        uuid author_id FK
        int version_number
        text diff_patch
        timestamp created_at
    }
    COMMENT ||--o{ COMMENT : replies_to
    COMMENT {
        uuid id PK
        uuid document_id FK
        uuid author_id FK
        uuid parent_id FK
        text body
        boolean resolved
        timestamp created_at
    }
    AUDIT_LOG {
        uuid id PK
        uuid user_id FK
        string action
        string resource_type
        uuid resource_id
        jsonb metadata
        timestamp created_at
    }
    TENANT ||--o{ BILLING_EVENT : incurs
    BILLING_EVENT {
        uuid id PK
        uuid tenant_id FK
        string event_type
        decimal amount
        string currency
        timestamp occurred_at
    }
\`\`\`

The schema is multi-tenant with row-level security enforced at the database layer via Postgres policies. Every table includes \`tenant_id\` in its RLS predicate. The \`AUDIT_LOG\` table is append-only and partitioned by month.

### 2b. Data Flow

\`\`\`mermaid
graph LR
    subgraph Ingestion["Data Ingestion"]
        API[REST API]
        WH[Webhooks]
        STREAM[Event Stream]
    end

    subgraph Processing["Stream Processing"]
        KAFKA[Apache Kafka<br/>12 partitions]
        FLINK[Apache Flink<br/>Windowed Aggregation]
        DEDUPE[Deduplication<br/>Service]
    end

    subgraph Storage["Storage Tier"]
        PG[(PostgreSQL<br/>Primary + 2 Replicas)]
        ES[(Elasticsearch<br/>3-node cluster)]
        S3[(S3 / MinIO<br/>Object Store)]
        REDIS[(Redis Cluster<br/>6 nodes)]
        TS[(TimescaleDB<br/>Metrics)]
    end

    subgraph Consumers["Downstream"]
        SEARCH[Search Index Updater]
        NOTIFY[Notification Fanout]
        ANALYTICS[Analytics Pipeline]
        EXPORT[Data Export Worker]
        ML[ML Feature Store]
    end

    API & WH & STREAM --> KAFKA
    KAFKA --> DEDUPE --> FLINK
    FLINK --> PG & ES & TS
    FLINK --> S3
    KAFKA --> SEARCH & NOTIFY & ANALYTICS
    ANALYTICS --> S3
    ANALYTICS --> ML
    EXPORT --> S3
    PG --> REDIS
    SEARCH --> ES
\`\`\`

All writes flow through Kafka before reaching storage. This decouples producers from consumers and gives us replay capability. Flink handles windowed aggregations (5-minute tumbling windows for metrics, session windows for user activity). The deduplication service uses a Bloom filter backed by Redis to catch duplicate webhook deliveries.

---

## 3. Authentication & Authorization

\`\`\`mermaid
sequenceDiagram
    participant Browser
    participant CDN as Cloudflare Edge
    participant GW as API Gateway
    participant IDP as Identity Provider<br/>(Auth0)
    participant RBAC as Policy Engine<br/>(OPA)
    participant SVC as Backend Service
    participant DB as PostgreSQL
    participant CACHE as Redis

    Browser->>CDN: GET /app (with cookie)
    CDN->>GW: Forward (strip non-essential headers)
    GW->>GW: Extract JWT from cookie

    alt JWT missing or expired
        GW->>Browser: 302 Redirect to /auth/login
        Browser->>IDP: Authorization Code Flow (PKCE)
        IDP->>IDP: Verify credentials + MFA
        IDP->>Browser: Auth code redirect
        Browser->>GW: POST /auth/callback (code)
        GW->>IDP: Exchange code for tokens
        IDP->>GW: Access token + ID token + Refresh token
        GW->>CACHE: Store session (sid -> tokens, 30min TTL)
        GW->>Browser: Set-Cookie (HttpOnly, Secure, SameSite=Strict)
    end

    GW->>GW: Validate JWT signature + claims
    GW->>CACHE: Check token blacklist
    CACHE-->>GW: Not blacklisted

    GW->>RBAC: Authorize (user, action, resource)
    RBAC->>RBAC: Evaluate Rego policies
    RBAC-->>GW: Allow / Deny

    alt Authorized
        GW->>SVC: Forward request + user context header
        SVC->>DB: Query with RLS (SET app.current_tenant = ?)
        DB-->>SVC: Filtered results
        SVC-->>GW: 200 OK (response)
        GW-->>Browser: 200 OK
    else Denied
        GW-->>Browser: 403 Forbidden
    end
\`\`\`

Authentication uses OAuth 2.0 Authorization Code Flow with PKCE via Auth0. Sessions are stored server-side in Redis (not in JWTs) to support instant revocation. The API gateway validates the JWT signature, checks the token blacklist in Redis, then forwards to OPA for fine-grained authorization.

### Security layers

1. **Edge:** Cloudflare WAF blocks SQLi, XSS, and known bot signatures.
2. **Transport:** All inter-service traffic uses mTLS via Istio sidecars.
3. **Application:** OPA Rego policies enforce tenant isolation and role-based access.
4. **Database:** PostgreSQL RLS policies ensure queries never leak cross-tenant data.
5. **Audit:** Every mutation is logged to the append-only \`AUDIT_LOG\` table.

---

## 4. CI/CD Pipeline

\`\`\`mermaid
graph TB
    subgraph Trigger["Trigger"]
        PR[Pull Request]
        MERGE[Merge to main]
        TAG[Git Tag v*]
    end

    subgraph CI["Continuous Integration"]
        LINT[Lint<br/>ESLint + Prettier + Ruff]
        UNIT[Unit Tests<br/>Jest + pytest]
        INT[Integration Tests<br/>Playwright + Testcontainers]
        BUILD[Docker Build<br/>Multi-stage]
        SAST[SAST Scan<br/>Semgrep]
        DEP[Dependency Audit<br/>Snyk]
        IMG[Container Scan<br/>Trivy]
        COV[Coverage Gate<br/>>= 80%]
    end

    subgraph Artifacts["Artifact Store"]
        ECR[ECR Registry]
        HELM[Helm Chart Repo]
        SBOM[SBOM Store]
    end

    subgraph CD_Staging["Staging"]
        STG_DEPLOY[Helm Upgrade<br/>staging namespace]
        STG_SMOKE[Smoke Tests]
        STG_PERF[Load Test<br/>k6 baseline]
    end

    subgraph CD_Canary["Production — Canary"]
        CAN_5[Canary 5%]
        CAN_MON[Monitor<br/>Error rate + p99]
        CAN_25[Canary 25%]
        CAN_50[Canary 50%]
        CAN_100[Full Rollout 100%]
        CAN_ROLL[Rollback]
    end

    subgraph Notify["Notifications"]
        SLACK[Slack Channel]
        PD[PagerDuty]
        JIRA[Jira Ticket Update]
    end

    PR --> LINT & UNIT & SAST & DEP
    LINT & UNIT & SAST & DEP --> INT
    INT --> BUILD --> IMG & COV
    IMG & COV --> ECR & HELM & SBOM

    MERGE --> STG_DEPLOY --> STG_SMOKE --> STG_PERF
    STG_PERF --> SLACK

    TAG --> CAN_5 --> CAN_MON
    CAN_MON -->|Healthy| CAN_25 --> CAN_50 --> CAN_100
    CAN_MON -->|Degraded| CAN_ROLL
    CAN_100 --> SLACK & JIRA
    CAN_ROLL --> PD & SLACK
\`\`\`

Every pull request triggers lint, unit tests, SAST, and dependency audit in parallel. Integration tests run after all fast checks pass. Docker images go through Trivy container scanning before being pushed to ECR. Staging deploys happen automatically on merge to main. Production uses a progressive canary rollout (5% -> 25% -> 50% -> 100%) with automatic rollback if error rate exceeds the baseline by 2x.

### Deployment SLAs

| Stage | Target Duration | Rollback Time |
|-------|----------------|---------------|
| CI (full pipeline) | < 8 minutes | N/A |
| Staging deploy | < 3 minutes | < 1 minute |
| Canary 5% | 10 minutes soak | < 30 seconds |
| Full rollout | < 20 minutes total | < 30 seconds |

---

## 5. Observability Stack

\`\`\`mermaid
graph LR
    subgraph Sources["Signal Sources"]
        APP[Application Code]
        MESH[Istio Sidecars]
        K8S[Kubelet / cAdvisor]
        DB_M[DB Exporters]
        SYNTH[Synthetic Probes]
    end

    subgraph Collection["Collection Layer"]
        OTEL[OpenTelemetry<br/>Collector]
        PROM[Prometheus<br/>Scrape]
        FLUENTBIT[Fluent Bit<br/>Log Shipper]
        JAEGER_AGENT[Jaeger Agent]
    end

    subgraph Storage_Obs["Storage"]
        MIMIR[Grafana Mimir<br/>Metrics TSDB]
        LOKI[Grafana Loki<br/>Log Aggregation]
        TEMPO[Grafana Tempo<br/>Trace Storage]
        ALERT_DB[(AlertManager<br/>State Store)]
    end

    subgraph Visualization["Visualization & Alerting"]
        GRAFANA[Grafana Dashboards]
        ALERTMGR[AlertManager]
        ONCALL[Grafana OnCall]
        PD2[PagerDuty]
        SLACK2[Slack Alerts]
    end

    APP -->|traces| OTEL
    APP -->|metrics| OTEL
    APP -->|logs| FLUENTBIT
    MESH -->|metrics| PROM
    MESH -->|traces| JAEGER_AGENT
    K8S -->|metrics| PROM
    DB_M -->|metrics| PROM
    SYNTH -->|metrics| PROM

    OTEL --> MIMIR & TEMPO
    PROM --> MIMIR
    FLUENTBIT --> LOKI
    JAEGER_AGENT --> TEMPO

    MIMIR --> GRAFANA
    LOKI --> GRAFANA
    TEMPO --> GRAFANA
    MIMIR --> ALERTMGR --> ONCALL --> PD2 & SLACK2
    ALERTMGR --> ALERT_DB
\`\`\`

We run a unified observability stack based on the Grafana LGTM stack (Loki, Grafana, Tempo, Mimir). OpenTelemetry collectors are deployed as sidecars alongside every application pod. Structured logs go through Fluent Bit to Loki. Metrics are scraped by Prometheus and remote-written to Mimir for long-term storage.

### SLO definitions

- **Availability:** 99.95% measured as successful requests / total requests over a 30-day rolling window.
- **Latency:** p99 < 500ms for API endpoints, p99 < 2s for search queries.
- **Error budget:** 0.05% of requests per month (~21.6 minutes of downtime equivalent).

\`\`\`javascript
// SLO burn rate alerting — multi-window approach
const sloConfig = {
  target: 0.9995,        // 99.95%
  windows: [
    { duration: '5m',  burnRate: 14.4, severity: 'critical' },
    { duration: '30m', burnRate: 6.0,  severity: 'critical' },
    { duration: '1h',  burnRate: 3.0,  severity: 'warning' },
    { duration: '6h',  burnRate: 1.0,  severity: 'info' },
  ],
  evaluate: (window) => {
    const errorRate = 1 - (successCount / totalCount);
    const consumptionRate = errorRate / (1 - sloConfig.target);
    if (consumptionRate >= window.burnRate) {
      alert(window.severity, \\\`Burn rate \${consumptionRate.toFixed(1)}x in \${window.duration}\\\`);
    }
  }
};
\`\`\`

---

## 6. Incident Response Workflow

\`\`\`mermaid
stateDiagram-v2
    [*] --> Detected
    Detected --> Triaged: Acknowledge alert
    Triaged --> Investigating: Assign on-call
    Investigating --> Identified: Root cause found
    Investigating --> Escalated: > 30 min without progress
    Escalated --> Identified: Senior engineer joins
    Identified --> Mitigating: Apply fix / rollback
    Mitigating --> Monitoring: Fix deployed
    Monitoring --> Resolved: Metrics normal for 15 min
    Monitoring --> Mitigating: Regression detected
    Resolved --> PostMortem: Schedule within 48h
    PostMortem --> ActionItems: Write blameless review
    ActionItems --> [*]: All items completed

    state Investigating {
        [*] --> CheckDashboards
        CheckDashboards --> QueryLogs
        QueryLogs --> InspectTraces
        InspectTraces --> FormHypothesis
        FormHypothesis --> TestHypothesis
        TestHypothesis --> FormHypothesis: Disproved
        TestHypothesis --> [*]: Confirmed
    }
\`\`\`

All incidents follow this state machine. The on-call engineer is paged via PagerDuty and must acknowledge within 5 minutes. If no root cause is identified within 30 minutes, the incident is automatically escalated to the senior on-call.

### Severity levels

| Level | Response Time | Example |
|-------|-------------|---------|
| SEV-1 | < 5 min | Complete service outage, data loss |
| SEV-2 | < 15 min | Partial outage, degraded performance > 10x baseline |
| SEV-3 | < 1 hour | Non-critical feature broken, workaround exists |
| SEV-4 | Next business day | Cosmetic issue, documentation error |

---

## 7. Machine Learning Pipeline

\`\`\`mermaid
graph TB
    subgraph Ingest["Feature Ingestion"]
        RAW[Raw Event Stream]
        BATCH[Batch ETL<br/>Airflow DAGs]
        REALTIME[Real-time Features<br/>Flink]
    end

    subgraph FeatureStore["Feature Store"]
        OFFLINE[(Offline Store<br/>Parquet on S3)]
        ONLINE[(Online Store<br/>Redis)]
        REGISTRY[Feature Registry<br/>Metadata]
    end

    subgraph Training["Model Training"]
        NOTEBOOK[Jupyter Notebooks<br/>Exploration]
        TRAIN[Training Job<br/>PyTorch / XGBoost]
        HYPERPARAM[Hyperparameter<br/>Tuning<br/>Optuna]
        EVAL[Evaluation<br/>Holdout + Cross-val]
        MODELREG[Model Registry<br/>MLflow]
    end

    subgraph Serving["Model Serving"]
        SHADOW[Shadow Mode<br/>Log predictions only]
        CANARY_ML[Canary 10%<br/>A/B split]
        PROD_ML[Production<br/>Full traffic]
        TRITON[Triton Inference<br/>Server]
    end

    subgraph Monitoring_ML["Model Monitoring"]
        DRIFT[Data Drift<br/>Detection]
        PERF[Performance<br/>Tracking]
        BIAS[Fairness<br/>Metrics]
        RETRAIN[Auto-retrain<br/>Trigger]
    end

    RAW --> REALTIME --> ONLINE
    RAW --> BATCH --> OFFLINE
    BATCH --> REGISTRY
    REALTIME --> REGISTRY

    OFFLINE --> NOTEBOOK --> TRAIN
    TRAIN --> HYPERPARAM --> EVAL --> MODELREG

    MODELREG --> SHADOW --> CANARY_ML --> PROD_ML
    PROD_ML --> TRITON
    TRITON --> ONLINE

    PROD_ML --> DRIFT & PERF & BIAS
    DRIFT --> RETRAIN --> TRAIN
\`\`\`

The ML pipeline uses a two-tier feature store: offline features (Parquet on S3) for training and online features (Redis) for low-latency inference. Models are trained on Kubernetes via PyTorch or XGBoost, with Optuna for hyperparameter search. New models go through shadow mode (predictions logged but not served) before canary deployment.

### Model catalog

\`\`\`python
# Model registry configuration
models = {
    "recommendation-v3": {
        "framework": "pytorch",
        "input_features": ["user_embedding", "item_embedding", "context_vector"],
        "output": "relevance_score",
        "latency_budget_ms": 50,
        "retrain_trigger": "drift_score > 0.15",
        "serving": {
            "replicas": 4,
            "gpu": "nvidia-t4",
            "batch_size": 32,
            "max_queue_ms": 100,
        },
    },
    "fraud-detection-v2": {
        "framework": "xgboost",
        "input_features": [
            "transaction_amount", "merchant_category", "device_fingerprint",
            "velocity_1h", "velocity_24h", "geo_distance_km",
            "card_age_days", "is_recurring", "time_since_last_txn",
        ],
        "output": "fraud_probability",
        "latency_budget_ms": 20,
        "retrain_trigger": "weekly OR precision < 0.92",
        "serving": {
            "replicas": 8,
            "gpu": None,
            "batch_size": 1,
            "max_queue_ms": 10,
        },
    },
    "search-ranking-v4": {
        "framework": "pytorch",
        "input_features": ["query_embedding", "doc_features", "user_context"],
        "output": "ranking_score",
        "latency_budget_ms": 100,
        "retrain_trigger": "ndcg@10 < 0.45",
    },
}
\`\`\`

---

## 8. Kubernetes Cluster Architecture

\`\`\`mermaid
graph TB
    subgraph ControlPlane["Control Plane (3 nodes)"]
        ETCD[(etcd cluster<br/>3 replicas)]
        APISERVER[kube-apiserver<br/>HA behind LB]
        SCHED[kube-scheduler]
        CM[controller-manager]
        APISERVER --> ETCD
        SCHED --> APISERVER
        CM --> APISERVER
    end

    subgraph WorkerPool1["Worker Pool — General (12 nodes)"]
        W1[m5.2xlarge]
        W2[m5.2xlarge]
        W3[m5.2xlarge]
        W4[...]
    end

    subgraph WorkerPool2["Worker Pool — GPU (4 nodes)"]
        G1[p3.2xlarge<br/>NVIDIA V100]
        G2[p3.2xlarge<br/>NVIDIA V100]
        G3[p3.2xlarge<br/>NVIDIA V100]
        G4[p3.2xlarge<br/>NVIDIA V100]
    end

    subgraph WorkerPool3["Worker Pool — High-Memory (6 nodes)"]
        HM1[r5.4xlarge<br/>128GB RAM]
        HM2[r5.4xlarge<br/>128GB RAM]
        HM3[r5.4xlarge<br/>128GB RAM]
        HM4[...]
    end

    subgraph SystemPods["System DaemonSets"]
        ISTIO_PROXY[istio-proxy]
        FLUENTBIT_DS[fluent-bit]
        NODE_EXPORTER[node-exporter]
        CALICO[calico-node]
    end

    APISERVER --> W1 & W2 & W3
    APISERVER --> G1 & G2 & G3 & G4
    APISERVER --> HM1 & HM2 & HM3

    W1 --> ISTIO_PROXY & FLUENTBIT_DS & NODE_EXPORTER & CALICO
\`\`\`

The cluster uses three worker pools with different instance types. General workloads run on m5.2xlarge, ML inference on p3.2xlarge with NVIDIA V100 GPUs, and data-intensive services (Elasticsearch, Redis) on r5.4xlarge high-memory nodes. Calico provides network policy enforcement.

### Resource quotas per namespace

\`\`\`yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-platform
  namespace: platform
spec:
  hard:
    requests.cpu: "64"
    requests.memory: 256Gi
    limits.cpu: "128"
    limits.memory: 512Gi
    persistentvolumeclaims: "50"
    services.loadbalancers: "5"
    pods: "200"
\`\`\`

---

## 9. Domain-Driven Design — Bounded Contexts

\`\`\`mermaid
graph TB
    subgraph Identity["Identity Context"]
        direction LR
        ID_USER[User Aggregate]
        ID_TENANT[Tenant Aggregate]
        ID_SESSION[Session Entity]
        ID_USER --> ID_SESSION
        ID_TENANT --> ID_USER
    end

    subgraph Catalog["Catalog Context"]
        direction LR
        CAT_PRODUCT[Product Aggregate]
        CAT_CATEGORY[Category Entity]
        CAT_PRICE[Price Value Object]
        CAT_PRODUCT --> CAT_CATEGORY
        CAT_PRODUCT --> CAT_PRICE
    end

    subgraph Ordering["Ordering Context"]
        direction LR
        ORD_ORDER[Order Aggregate]
        ORD_LINE[OrderLine Entity]
        ORD_ADDR[Address VO]
        ORD_ORDER --> ORD_LINE
        ORD_ORDER --> ORD_ADDR
    end

    subgraph Fulfillment["Fulfillment Context"]
        direction LR
        FUL_SHIPMENT[Shipment Aggregate]
        FUL_TRACKING[Tracking Entity]
        FUL_CARRIER[Carrier VO]
        FUL_SHIPMENT --> FUL_TRACKING
        FUL_SHIPMENT --> FUL_CARRIER
    end

    subgraph Billing["Billing Context"]
        direction LR
        BILL_INVOICE[Invoice Aggregate]
        BILL_LINE[InvoiceLine Entity]
        BILL_PAYMENT[Payment Entity]
        BILL_INVOICE --> BILL_LINE
        BILL_INVOICE --> BILL_PAYMENT
    end

    subgraph Notification["Notification Context"]
        direction LR
        NOT_TEMPLATE[Template Aggregate]
        NOT_CHANNEL[Channel Entity]
        NOT_DELIVERY[Delivery Entity]
        NOT_TEMPLATE --> NOT_CHANNEL
        NOT_TEMPLATE --> NOT_DELIVERY
    end

    Identity -->|UserCreated| Notification
    Identity -->|UserCreated| Billing
    Catalog -->|PriceChanged| Ordering
    Ordering -->|OrderPlaced| Fulfillment
    Ordering -->|OrderPlaced| Billing
    Ordering -->|OrderPlaced| Notification
    Fulfillment -->|Shipped| Notification
    Fulfillment -->|Delivered| Ordering
    Billing -->|PaymentFailed| Ordering
    Billing -->|InvoiceGenerated| Notification
\`\`\`

Each bounded context owns its data and communicates via domain events published to Kafka. There are no shared databases between contexts. Anti-corruption layers translate between context-specific models at the boundaries.

### Event schema conventions

\`\`\`typescript
interface DomainEvent<T = unknown> {
  eventId: string;           // UUIDv7
  eventType: string;         // e.g. "ordering.order_placed"
  aggregateId: string;       // ID of the aggregate that produced the event
  aggregateType: string;     // e.g. "Order"
  version: number;           // Schema version for evolution
  timestamp: string;         // ISO 8601
  correlationId: string;     // Trace ID for distributed tracing
  causationId: string;       // ID of the event/command that caused this
  payload: T;
  metadata: {
    producerService: string;
    tenantId: string;
  };
}

// Example: OrderPlaced event
type OrderPlacedPayload = {
  orderId: string;
  customerId: string;
  lines: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    currency: string;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  totalAmount: number;
};
\`\`\`

---

## 10. Disaster Recovery

\`\`\`mermaid
sequenceDiagram
    participant MON as Monitoring
    participant ONCALL as On-Call Engineer
    participant DNS as Route53 / DNS
    participant PRIMARY as Primary Region<br/>(EU-West-1)
    participant DR as DR Region<br/>(US-East-1)
    participant DB_P as Primary DB
    participant DB_R as Replica DB
    participant S3_P as Primary S3
    participant S3_R as Replicated S3

    Note over MON: Region health check fails 3x
    MON->>ONCALL: SEV-1 Alert: EU-West-1 unreachable
    ONCALL->>ONCALL: Verify not a monitoring false positive

    rect rgb(255, 240, 240)
        Note over ONCALL,DR: Failover Decision (< 5 min)
        ONCALL->>DNS: Initiate DNS failover
        DNS->>DNS: Update weighted routing<br/>EU-West-1: 0%, US-East-1: 100%
    end

    rect rgb(240, 255, 240)
        Note over DR,DB_R: DR Activation
        ONCALL->>DR: Scale up DR pods (3x normal)
        DR->>DB_R: Promote read replica to primary
        DB_R->>DB_R: Accept writes
        DR->>S3_R: Verify cross-region replication lag
        S3_R-->>DR: Lag < 15 seconds
    end

    Note over DNS: TTL expires (60s)
    DNS-->>MON: Traffic flowing to US-East-1
    MON->>ONCALL: DR region healthy, serving traffic

    rect rgb(240, 248, 255)
        Note over PRIMARY,DB_P: Recovery Phase
        PRIMARY->>ONCALL: EU-West-1 back online
        ONCALL->>DB_P: Rebuild replication from US-East-1
        DB_P->>DB_R: Catch up via WAL streaming
        ONCALL->>DNS: Gradual traffic shift<br/>US: 75%, EU: 25%
        Note over DNS: Monitor for 30 min
        ONCALL->>DNS: Restore normal routing<br/>US: 50%, EU: 50%
    end
\`\`\`

RPO (Recovery Point Objective): < 30 seconds (async replication lag). RTO (Recovery Time Objective): < 5 minutes (DNS failover + pod scaling). Cross-region S3 replication runs continuously with a typical lag of 5-15 seconds.

### DR runbook checklist

1. Verify the alert is genuine (check from multiple vantage points)
2. Notify the incident channel: \`@oncall Region failover initiated for EU-West-1\`
3. Execute DNS failover via Route53 health check override
4. Scale DR region pods to handle full traffic
5. Promote read replica to primary
6. Monitor error rates for 15 minutes
7. Begin recovery of primary region when available
8. Gradual traffic shift back over 2 hours
9. Schedule post-mortem within 48 hours

---

## 11. API Gateway Configuration

\`\`\`mermaid
graph TB
    subgraph Clients["API Clients"]
        WEB[Web App]
        MOBILE[Mobile App]
        THIRD[3rd Party<br/>Partners]
        INTERNAL[Internal<br/>Services]
    end

    subgraph Gateway["Kong API Gateway"]
        RL[Rate Limiting<br/>10k req/min per key]
        AUTH_PLG[JWT Auth Plugin]
        CORS[CORS Plugin]
        LOG_PLG[Request Logging]
        TRANSFORM[Response Transform]
        CIRCUIT[Circuit Breaker<br/>50% error threshold]

        RL --> AUTH_PLG --> CORS --> LOG_PLG --> TRANSFORM --> CIRCUIT
    end

    subgraph Routes["Route Configuration"]
        R1["/api/v1/users<br/>→ user-service:8080"]
        R2["/api/v1/orders<br/>→ order-service:8080"]
        R3["/api/v1/products<br/>→ product-service:8080"]
        R4["/api/v1/search<br/>→ search-service:8080"]
        R5["/api/v1/payments<br/>→ payment-service:8080"]
        R6["/api/v1/notifications<br/>→ notification-service:8080"]
        R7["/api/v2/graphql<br/>→ graphql-gateway:4000"]
        R8["/internal/*<br/>→ admin-service:8080"]
    end

    WEB & MOBILE & THIRD & INTERNAL --> RL
    CIRCUIT --> R1 & R2 & R3 & R4
    CIRCUIT --> R5 & R6 & R7 & R8
\`\`\`

The API gateway handles cross-cutting concerns so individual services don't have to. Rate limiting uses a sliding window algorithm with limits per API key. The circuit breaker trips at 50% error rate and half-opens after 30 seconds.

### Rate limit tiers

\`\`\`json
{
  "tiers": {
    "free":       { "requests_per_minute": 60,    "burst": 10  },
    "starter":    { "requests_per_minute": 600,   "burst": 50  },
    "business":   { "requests_per_minute": 6000,  "burst": 200 },
    "enterprise": { "requests_per_minute": 60000, "burst": 1000 },
    "internal":   { "requests_per_minute": null,   "burst": null }
  },
  "headers": {
    "X-RateLimit-Limit": "requests_per_minute",
    "X-RateLimit-Remaining": "remaining_in_window",
    "X-RateLimit-Reset": "unix_timestamp_window_reset",
    "Retry-After": "seconds_until_retry"
  }
}
\`\`\`

---

## 12. Database Migration Strategy

\`\`\`mermaid
stateDiagram-v2
    [*] --> Planning
    Planning --> Development: Write migration SQL

    state Development {
        [*] --> WriteMigration
        WriteMigration --> LocalTest
        LocalTest --> PeerReview
        PeerReview --> WriteMigration: Changes requested
        PeerReview --> [*]: Approved
    }

    Development --> Staging: Deploy to staging
    Staging --> StagingValidation: Run migration

    state StagingValidation {
        [*] --> CheckSchema
        CheckSchema --> CheckData
        CheckData --> CheckPerformance
        CheckPerformance --> CheckRollback
        CheckRollback --> [*]
    }

    StagingValidation --> ProductionWindow: Schedule maintenance window
    ProductionWindow --> PreFlight: Backup + health check

    state PreFlight {
        [*] --> TakeBackup
        TakeBackup --> VerifyBackup
        VerifyBackup --> CheckReplication
        CheckReplication --> PauseWriters
        PauseWriters --> [*]
    }

    PreFlight --> Executing: Run migration

    state Executing {
        [*] --> ApplyMigration
        ApplyMigration --> VerifySchema
        VerifySchema --> ResumeWriters
        ResumeWriters --> SmokeTest
        SmokeTest --> [*]
    }

    Executing --> PostValidation: Validate
    PostValidation --> Complete: All checks pass
    PostValidation --> Rollback: Checks fail
    Rollback --> PreFlight: Restore from backup
    Complete --> [*]
\`\`\`

All database migrations follow this workflow. Migrations must be backward-compatible (expand-and-contract pattern) so that the old application version can still run during the rollout. Destructive operations (dropping columns, changing types) are split into separate migrations applied after the new code is fully rolled out.

> **Rule:** No migration may hold a lock on a table with > 1M rows for more than 5 seconds. Use \`CREATE INDEX CONCURRENTLY\`, \`ALTER TABLE ... ADD COLUMN ... DEFAULT\` (Postgres 11+ is lock-free for this), and backfill in batches.

---

## Summary

This document covered 12 major architectural areas of the platform. Each section includes both prose explanations and detailed diagrams. The system handles:

- **3 geographic regions** with active-active replication
- **8+ microservices** per region behind an Istio service mesh
- **10+ data stores** including PostgreSQL, Elasticsearch, Redis, S3, TimescaleDB, and Kafka
- **Progressive deployment** with automated canary analysis
- **Full observability** via the Grafana LGTM stack
- **Sub-5-minute disaster recovery** with automated DNS failover
- **ML pipeline** with feature store, model registry, and drift detection

The architecture prioritizes **operational safety** (circuit breakers, rate limiting, progressive rollouts, automated rollback) over raw performance, on the principle that a system that stays up at p95 speeds beats one that's fast but fragile.
`;
