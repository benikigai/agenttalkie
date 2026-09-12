# AgentTalkie architecture

Status: implementation scaffold plus integration plan, September 12, 2026. Source inspected; no live end-to-end provider verification claimed.

## Product flow

```mermaid
flowchart LR
    A[Open project standup] --> B[Read task and agent context]
    B --> C[Surface blocker or conflicting assumptions]
    C --> D[Review a proposed decision]
    D --> E[Send the authorized instruction]
    E --> F[Verify worker acceptance and workspace outcome]
```

This is the target experience. The current fixture supports a single-worker request, correction, evidence and prepared follow-up. Multi-worker comparison and external writes remain planned.

## Runtime boundaries

```mermaid
flowchart TB
  subgraph Browser[Browser: Next.js workspace]
    Dock[Persistent voice dock]
    Views[Project, finding and decision views]
    State[Client state and current revision]
    Dock <--> State
    Views <--> State
  end
  Dock <-->|WebRTC audio and events| Live[OpenAI GPT-Live]
  Dock -->|Session creation and delegated request| API[Loopback application API]
  API --> Service[Request validation and work controller]
  Service --> Store[Session and operation state]
  Service --> Fixture[Explicit fixture adapter]
  Service --> OpenClaw[Existing-session OpenClaw adapter]
  Service -.-> Exa[Exa Code Context]
  Service -.-> Ori[Ori coding worker runner]
  Service -.-> Ambiguous[Ambiguous tasks and readback]
  Service -->|Normalized result| State
  State -->|Current verified summary| Dock
  Service -.-> AGUI[CopilotKit / AG-UI task events]
  AGUI -.-> Views
```

Solid lines identify scaffold paths in code, not proven live integrations. Dashed lines are planned integration boundaries. The Live broker is disabled by default. The OpenClaw adapter is disconnected by default. CopilotKit is inherited infrastructure; the custom AgentTalkie task event integration remains planned. Current storage is process-local, not durable.

GPT-Live supplies the conversational interface. AgentTalkie owns request interpretation, selected task/session identity, permissions, revision checks and results. OpenRouter can provide a model through an appropriate worker route; it does not import existing CLI sessions. An existing worker session, new Ori job, voice session and application thread are separate identities.

## Correction behavior

```mermaid
sequenceDiagram
  participant User
  participant App as AgentTalkie
  participant Worker
  User->>App: Investigate the blocker
  App->>Worker: Request A, revision 1
  User->>App: Narrow the scope
  App->>Worker: Request B, revision 2
  Worker-->>App: Result B
  App-->>User: Show current result
  Worker-->>App: Late result A
  Note over App: Preserve in history, exclude from current result
```

Scope steering uses only a supported worker interface. Until acknowledgement, the UI must distinguish queued from accepted. Suppressing a late result does not cancel remote work or retract audio already played.

## Files and ownership

```text
apps/web/src/
  app/                         Page, styles and API routes
    api/agenttalkie/           Session, question, follow-up and voice endpoints
  components/agenttalkie/      Workspace, persistent provider and dock
  lib/
    agenttalkie-contract.ts   Executable request/result schema
    agenttalkie-fixture.ts    Non-sensitive sample data
    client/                   API client and current-state selection
    voice/                    GPT-Live browser lifecycle
    server/                   Validation and request lifecycle
      agenttalkie-adapters/   Worker adapters
apps/web/e2e/agenttalkie/      Acceptance and source capture
tools/agenttalkie-runner/     Planned isolated worker runner
```

## Before a public deployment

Provide actual user authentication and trusted origin checks, persist application state, verify provider session cleanup, and prove one authorized worker route. Verify writes with a fresh read. A lost response remains unknown until reconciled. API secrets stay server-side; private workers remain behind their authenticated bridge.

The application should remain useful while a worker is pending, unavailable or fails. Show explicit fixture, checkpoint, source-read and worker-reply evidence. Reconnection must restore the work identity without silently creating another task.
