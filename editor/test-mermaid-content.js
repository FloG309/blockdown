var markdownText = `
## Mermaid Diagram Types — Dark Theme Test

### 1. Flowchart (TB)

\`\`\`mermaid
graph TB
    A[Start] --> B{Decision}
    B -->|Yes| C[Process A]
    B -->|No| D[Process B]
    C --> E[Result 1]
    D --> E
    E --> F((End))
    subgraph Group1["Primary Group"]
        C
        E
    end
    subgraph Group2["Secondary Group"]
        D
    end
\`\`\`

### 2. Flowchart (LR) with styles

\`\`\`mermaid
graph LR
    A([Rounded]) --> B[[Subroutine]]
    B --> C[(Database)]
    C --> D{Diamond}
    D --> E>Asymmetric]
    D --> F[/Parallelogram/]
    F --> G[\\Trapezoid\\]
    G --> H{{Hexagon}}
    H --> I((Circle))
\`\`\`

### 3. Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    participant C as Charlie
    A->>B: Hello Bob
    activate B
    B-->>A: Hi Alice
    B->>C: Forward to Charlie
    activate C
    C-->>B: Response
    deactivate C
    deactivate B
    Note over A,B: This is a note
    rect rgb(100, 100, 140)
        A->>B: Inside a box
        B-->>A: Reply
    end
    alt success
        A->>B: Great
    else failure
        A->>B: Oh no
    end
    loop Every minute
        B->>C: Heartbeat
    end
\`\`\`

### 4. Class Diagram

\`\`\`mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +String breed
        +fetch() void
    }
    class Cat {
        +bool isIndoor
        +purr() void
    }
    class Shelter {
        +List~Animal~ animals
        +adopt(Animal a) bool
    }
    Animal <|-- Dog
    Animal <|-- Cat
    Shelter "1" --> "*" Animal : houses
\`\`\`

### 5. State Diagram

\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Success: Complete
    Processing --> Error: Fail
    Error --> Processing: Retry
    Error --> [*]: Abort
    Success --> [*]

    state Processing {
        [*] --> Validating
        Validating --> Executing
        Executing --> [*]
    }
\`\`\`

### 6. Entity Relationship Diagram

\`\`\`mermaid
erDiagram
    USER ||--o{ POST : writes
    USER {
        int id PK
        string username UK
        string email
    }
    POST ||--|{ COMMENT : has
    POST {
        int id PK
        int author_id FK
        string title
        text body
        date published_at
    }
    COMMENT {
        int id PK
        int post_id FK
        int user_id FK
        text content
    }
    USER ||--o{ COMMENT : writes
    TAG ||--o{ POST : "tagged in"
    TAG {
        int id PK
        string name UK
    }
\`\`\`

### 7. Gantt Chart

\`\`\`mermaid
gantt
    title Project Plan
    dateFormat  YYYY-MM-DD
    section Design
    Research         :done, d1, 2024-01-01, 7d
    Wireframes       :done, d2, after d1, 5d
    Mockups          :active, d3, after d2, 7d
    section Development
    Frontend         :d4, after d3, 14d
    Backend          :d5, after d3, 14d
    Integration      :d6, after d4, 7d
    section Testing
    Unit Tests       :d7, after d5, 5d
    E2E Tests        :d8, after d6, 5d
    UAT              :d9, after d8, 7d
\`\`\`

### 8. Pie Chart

\`\`\`mermaid
pie title Browser Market Share
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 4
    "Other" : 8
\`\`\`

### 9. Git Graph

\`\`\`mermaid
gitGraph
    commit
    commit
    branch feature-a
    checkout feature-a
    commit
    commit
    checkout main
    branch feature-b
    checkout feature-b
    commit
    checkout main
    merge feature-a
    commit
    merge feature-b
    commit
\`\`\`

### 10. Flowchart with subgraphs (stress test)

\`\`\`mermaid
graph TB
    subgraph Outer["Outer Layer"]
        subgraph Inner1["Service A"]
            A1[Handler] --> A2[Logic]
            A2 --> A3[(DB)]
        end
        subgraph Inner2["Service B"]
            B1[Handler] --> B2[Logic]
            B2 --> B3[(Cache)]
        end
        subgraph Inner3["Service C"]
            C1[Handler] --> C2[Logic]
            C2 --> C3>Queue]
        end
    end
    LB[Load Balancer] --> A1
    LB --> B1
    LB --> C1
    A2 --> B2
    B2 --> C2
    C3 --> A1
\`\`\`

### 11. Sequence Diagram with notes and activation

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant API
    participant Auth
    participant DB
    Client->>API: POST /login
    activate API
    API->>Auth: Validate credentials
    activate Auth
    Auth->>DB: Query user
    activate DB
    DB-->>Auth: User record
    deactivate DB
    Auth-->>API: Token
    deactivate Auth
    API-->>Client: 200 OK + JWT
    deactivate API
    Note right of Client: Stores JWT
    Client->>API: GET /data (Bearer token)
    activate API
    API->>Auth: Verify JWT
    Auth-->>API: Valid
    API->>DB: Fetch data
    DB-->>API: Results
    API-->>Client: 200 OK + data
    deactivate API
\`\`\`

### 12. Mindmap

\`\`\`mermaid
mindmap
    root((Project))
        Frontend
            React
            CSS Modules
            Playwright
        Backend
            Node.js
            PostgreSQL
            Redis
        Infrastructure
            Docker
            Kubernetes
            CI/CD
        Design
            Figma
            Design System
\`\`\`
`;
