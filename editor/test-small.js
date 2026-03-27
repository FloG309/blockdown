// Test page: small mermaid diagrams
// Only overrides markdownText — all behavior comes from base.js

var markdownText = `
## Small Mermaid Graph Test

A simple login flow:

\`\`\`mermaid
graph LR
    A[User] --> B[Login Page]
    B --> C{Valid?}
    C -->|Yes| D[Dashboard]
    C -->|No| B
\`\`\`

### Sequence Diagram

A basic API call:

\`\`\`mermaid
sequenceDiagram
    Client->>Server: GET /api/data
    Server->>DB: SELECT * FROM items
    DB-->>Server: rows
    Server-->>Client: 200 OK (JSON)
\`\`\`

### Pie Chart

\`\`\`mermaid
pie title Browser Market Share
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 4
    "Other" : 8
\`\`\`

### Some regular content

- Item one
- Item two
- Item three

> This page tests small, simple mermaid diagrams.
`;
