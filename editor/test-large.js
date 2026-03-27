var EditorState = {
    selectableElements: [],
    currentSelectedIndex: -1,
    turndownService: new TurndownService(),
    blockClipboard: [],
    undoStack: [],
    redoStack: []
};

let markdownText = `
## Complex Mermaid Graph Test

### E-Commerce Order Processing Pipeline

\`\`\`mermaid
graph TB
    subgraph Customer["Customer Layer"]
        A[Browse Catalog] --> B{Add to Cart?}
        B -->|Yes| C[Shopping Cart]
        B -->|No| A
        C --> D{Checkout?}
        D -->|No| A
        D -->|Yes| E[Enter Shipping Info]
        E --> F[Select Payment Method]
    end

    subgraph Payment["Payment Processing"]
        F --> G{Payment Type}
        G -->|Credit Card| H[Stripe Gateway]
        G -->|PayPal| I[PayPal API]
        G -->|Bank Transfer| J[SEPA Direct]
        H --> K{Authorized?}
        I --> K
        J --> K
        K -->|No| L[Payment Failed]
        L --> F
        K -->|Yes| M[Capture Payment]
    end

    subgraph Fulfillment["Order Fulfillment"]
        M --> N[Create Order Record]
        N --> O{In Stock?}
        O -->|Yes| P[Reserve Inventory]
        O -->|No| Q[Backorder Queue]
        Q --> R[Notify Supplier]
        R --> S{Supplier Confirms?}
        S -->|No| T[Cancel & Refund]
        S -->|Yes| P
        P --> U[Generate Picking List]
        U --> V[Warehouse Pick & Pack]
        V --> W{Quality Check}
        W -->|Fail| X[Return to Shelf]
        X --> U
        W -->|Pass| Y[Print Shipping Label]
    end

    subgraph Shipping["Shipping & Delivery"]
        Y --> Z[Hand to Carrier]
        Z --> AA{Domestic or International?}
        AA -->|Domestic| AB[DPD]
        AA -->|International| AC[DHL Express]
        AB --> AD[Track Shipment]
        AC --> AD
        AD --> AE{Delivered?}
        AE -->|No| AF{Failed Attempt?}
        AF -->|Yes| AG[Schedule Redelivery]
        AG --> AD
        AF -->|No| AD
        AE -->|Yes| AH[Delivery Confirmed]
    end

    subgraph PostSale["Post-Sale"]
        AH --> AI[Send Confirmation Email]
        AI --> AJ{Return Requested?}
        AJ -->|No| AK[Close Order]
        AJ -->|Yes| AL[Generate Return Label]
        AL --> AM[Receive Return]
        AM --> AN{Item OK?}
        AN -->|Yes| AO[Restock]
        AN -->|No| AP[Write Off]
        AO --> AQ[Process Refund]
        AP --> AQ
        AQ --> AK
    end

    T --> AK
\`\`\`

---

### Microservices Architecture

\`\`\`mermaid
graph LR
    subgraph Frontend["Frontend Tier"]
        WEB[Web App<br/>React]
        MOB[Mobile App<br/>React Native]
        ADM[Admin Panel<br/>Vue.js]
    end

    subgraph Gateway["API Gateway"]
        GW[Kong Gateway<br/>Rate Limiting<br/>Auth Validation]
    end

    subgraph Services["Microservices"]
        US[User Service<br/>Node.js]
        PS[Product Service<br/>Go]
        OS[Order Service<br/>Java]
        INV[Inventory Service<br/>Rust]
        PAY[Payment Service<br/>Python]
        NOT[Notification Service<br/>Node.js]
        SEARCH[Search Service<br/>Elasticsearch]
        REC[Recommendation<br/>Service<br/>Python/ML]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL<br/>Users & Orders)]
        MONGO[(MongoDB<br/>Products)]
        REDIS[(Redis<br/>Cache & Sessions)]
        ES[(Elasticsearch<br/>Search Index)]
        S3[(S3<br/>Media Storage)]
    end

    subgraph Messaging["Event Bus"]
        KAFKA[Apache Kafka]
    end

    subgraph Monitoring["Observability"]
        PROM[Prometheus]
        GRAF[Grafana]
        JAEG[Jaeger<br/>Tracing]
        ELK[ELK Stack<br/>Logging]
    end

    WEB --> GW
    MOB --> GW
    ADM --> GW

    GW --> US
    GW --> PS
    GW --> OS
    GW --> INV
    GW --> PAY
    GW --> SEARCH
    GW --> REC

    US --> PG
    US --> REDIS
    OS --> PG
    OS --> REDIS
    PS --> MONGO
    PS --> S3
    INV --> PG
    PAY --> PG
    SEARCH --> ES
    REC --> MONGO
    REC --> REDIS
    NOT --> REDIS

    US --> KAFKA
    OS --> KAFKA
    PAY --> KAFKA
    INV --> KAFKA
    KAFKA --> NOT
    KAFKA --> SEARCH
    KAFKA --> REC

    US --> PROM
    PS --> PROM
    OS --> PROM
    PROM --> GRAF
    GW --> JAEG
    US --> ELK
    PS --> ELK
    OS --> ELK
\`\`\`

---

### CI/CD Pipeline — Detailed

\`\`\`mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant CI as CI Runner
    participant SCAN as Security Scanner
    participant REG as Container Registry
    participant STG as Staging K8s
    participant QA as QA Team
    participant PROD as Production K8s
    participant MON as Monitoring

    Dev->>GH: Push to feature branch
    GH->>CI: Webhook trigger

    rect rgb(240, 248, 255)
        Note over CI: Build Phase
        CI->>CI: Install dependencies
        CI->>CI: Lint (ESLint + Prettier)
        CI->>CI: Unit tests (Jest)
        CI->>CI: Integration tests (Playwright)
        CI->>CI: Build Docker image
    end

    rect rgb(255, 248, 240)
        Note over CI,SCAN: Security Phase
        CI->>SCAN: SAST scan (Semgrep)
        SCAN-->>CI: Findings report
        CI->>SCAN: Dependency audit (Snyk)
        SCAN-->>CI: Vulnerability report
        CI->>SCAN: Container scan (Trivy)
        SCAN-->>CI: Image vulnerabilities
    end

    alt All checks pass
        CI->>REG: Push image (tag: sha-abc123)
        CI->>GH: Status: success
        Dev->>GH: Create Pull Request
        GH->>GH: Code review
        Dev->>GH: Merge to main
        GH->>CI: Main branch webhook

        rect rgb(240, 255, 240)
            Note over CI,STG: Staging Deployment
            CI->>REG: Push image (tag: staging)
            CI->>STG: Helm upgrade --set image.tag=staging
            STG->>STG: Rolling update
            STG->>CI: Health check passed
        end

        CI->>QA: Notify: ready for testing
        QA->>STG: Run acceptance tests
        QA->>STG: Manual exploratory testing

        alt QA Approved
            QA->>GH: Approve release
            GH->>CI: Release webhook

            rect rgb(240, 255, 240)
                Note over CI,PROD: Production Deployment
                CI->>REG: Push image (tag: v1.2.3)
                CI->>PROD: Helm upgrade (canary 10%)
                PROD->>MON: Canary metrics
                MON-->>CI: Error rate < 0.1%
                CI->>PROD: Promote to 100%
            end

            PROD->>MON: Full traffic metrics
            MON-->>Dev: Slack alert: deploy complete
        else QA Rejected
            QA->>Dev: File bug reports
            Dev->>GH: Push fixes
        end
    else Checks fail
        CI->>GH: Status: failure
        CI->>Dev: Slack notification
    end
\`\`\`

---

### Entity Relationship Diagram

\`\`\`mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        int id PK
        string email UK
        string first_name
        string last_name
        string phone
        date created_at
    }
    CUSTOMER ||--o{ ADDRESS : has
    ADDRESS {
        int id PK
        int customer_id FK
        string street
        string city
        string postal_code
        string country
        boolean is_default
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        int id PK
        int customer_id FK
        int shipping_address_id FK
        string status
        decimal total_amount
        string currency
        datetime placed_at
        datetime shipped_at
        datetime delivered_at
    }
    ORDER_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        decimal unit_price
        decimal discount
    }
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    PRODUCT {
        int id PK
        int category_id FK
        string name
        string sku UK
        text description
        decimal price
        int stock_quantity
        boolean active
    }
    CATEGORY ||--o{ PRODUCT : categorizes
    CATEGORY {
        int id PK
        int parent_id FK
        string name
        string slug UK
    }
    ORDER ||--o| PAYMENT : "paid via"
    PAYMENT {
        int id PK
        int order_id FK
        string provider
        string transaction_id UK
        decimal amount
        string status
        datetime processed_at
    }
    ORDER ||--o| SHIPMENT : "shipped as"
    SHIPMENT {
        int id PK
        int order_id FK
        string carrier
        string tracking_number UK
        string status
        datetime shipped_at
        datetime delivered_at
    }
\`\`\`

---

### State Machine — Order Lifecycle

\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Pending: Submit Order
    Pending --> PaymentProcessing: Initiate Payment
    PaymentProcessing --> PaymentFailed: Declined
    PaymentFailed --> PaymentProcessing: Retry
    PaymentFailed --> Cancelled: Max Retries
    PaymentProcessing --> Confirmed: Payment Captured
    Confirmed --> Processing: Begin Fulfillment
    Processing --> ReadyToShip: Packed & Labeled
    ReadyToShip --> Shipped: Carrier Pickup
    Shipped --> InTransit: Tracking Update
    InTransit --> OutForDelivery: Last Mile
    OutForDelivery --> Delivered: POD Confirmed
    OutForDelivery --> FailedDelivery: No Access
    FailedDelivery --> InTransit: Reschedule
    FailedDelivery --> ReturnToSender: 3 Attempts
    ReturnToSender --> Refunded: Refund Issued
    Delivered --> Completed: 14-day Window Passed
    Delivered --> ReturnRequested: Customer Return
    ReturnRequested --> ReturnInTransit: Label Scanned
    ReturnInTransit --> ReturnReceived: Warehouse Intake
    ReturnReceived --> Refunded: Inspection Passed
    ReturnReceived --> Disputed: Inspection Failed
    Disputed --> Refunded: Resolved in Favor
    Disputed --> Completed: Claim Denied
    Cancelled --> [*]
    Completed --> [*]
    Refunded --> [*]
\`\`\`

> This page tests large, complex mermaid diagrams with subgraphs, many nodes, and multiple diagram types.
`;

EditorState.turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
        return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
        );
    },
    replacement: function (content, node, options) {
        const code = node.firstChild;
        const className = code.getAttribute('class') || '';
        const language = className.match(/language-(\w+)/) ? className.match(/language-(\w+)/)[1] : '';

        const fence = options.fence;
        const codeContent = code.textContent || '';

        return '\n\n' + fence + language + '\n' + codeContent + '\n' + fence + '\n\n';
    }
});

EditorState.turndownService.options.codeBlockStyle = 'fenced';
EditorState.turndownService.options.bulletListMarker = '-';

EditorState.turndownService.addRule('mermaidContainer', {
    filter: function (node) {
        return node.nodeName === 'DIV' && node.classList.contains('mermaid-container');
    },
    replacement: function (content, node) {
        const source = node.getAttribute('data-mermaid-source') || '';
        return '\n\n```mermaid\n' + source + '\n```\n\n';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const preview = document.getElementById('preview');

    initMermaid();

    async function renderMarkdown() {
        const html = marked.parse(markdownText);
        preview.innerHTML = html;
        await processMermaidBlocks(preview);
        setupSelectionHandlers();
    }

    let lastKey = null;
    let lastKeyTime = 0;
    document.addEventListener('keydown', function(e) {
        const now = Date.now();
        const isTextarea = e.target.tagName === 'TEXTAREA';
        const isInput = e.target.tagName === 'INPUT' || e.target.isContentEditable;

        if (isTextarea || isInput) return;

        if (e.key === 'd') {
            if (lastKey === 'd' && (now - lastKeyTime) < 1000) {
                const selectedElements = document.querySelectorAll('.selected');
                selectedElements.forEach(el => el.remove());
                lastKey = null;
            } else {
                lastKey = 'd';
                lastKeyTime = now;
            }
        } else {
            lastKey = null;
        }

        const selectedElement = EditorState.selectableElements[EditorState.currentSelectedIndex]
        if (selectedElement && selectedElement.tagName === 'TEXTAREA') {
            if (e.key === 'Enter') {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
                return;
            }
        }

        if (e.shiftKey) {
            if (e.key === 'ArrowUp') handleShiftArrowUp(e);
            else if (e.key === 'ArrowDown') handleShiftArrowDown(e);
        }
        else if (e.key === 'ArrowUp') handleArrowUp(e);
        else if (e.key === 'ArrowDown') handleArrowDown(e);
        else if (e.key === 'Enter') handleEnter(e);
        else if (e.key === 'a') insertTextArea(e, insertBefore = true);
        else if (e.key === 'b') insertTextArea(e, insertBefore = false);
    });

    renderMarkdown();
});
