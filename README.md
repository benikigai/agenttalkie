# AgentTalkie

Hold a standup with your agents. Find what needs your decision and keep the work moving.

AgentTalkie is a web workspace with a persistent voice interface, attributed agent findings and reviewable next steps. It is being built for the Agents Everywhere hackathon.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev:web
```

Open `http://127.0.0.1:3100`. The initial workspace uses clearly labeled sample evidence and needs no credentials. Fixture mode does not activate the microphone or contact a worker.

```sh
npm run typecheck
npm test
```

## Current implementation

- Next.js web workspace with a root-mounted voice dock.
- Validated request/session contracts, question revisions and obsolete-result suppression.
- Attributed findings, evidence history and prepared follow-ups.
- GPT-Live WebRTC controller and server broker, disabled by default.
- OpenClaw adapter code, disconnected until an authorized existing-session route is configured.

Local fixture checks exercise application logic. They do not establish live audio, an authenticated worker reply or production readiness. Follow-ups are prepared, not sent.

## Planned workflow

Start from an Ambiguous task, consult the responsible agent, retrieve missing technical evidence with Exa, review a decision, and verify its saved workspace outcome. Ori-backed coding workers and CopilotKit state views are part of the integration plan. See [architecture](docs/architecture.md) for current versus planned boundaries.

## Known gaps

See [docs/starter.md](docs/starter.md) for the retained starter setup and [docs/architecture.md](docs/architecture.md) for current scope boundaries.

Live GPT-Live account access and end-to-end microphone behavior are not verified. Existing-worker connection, automatic trusted delegation, Ambiguous task writeback/readback, Exa retrieval and durable thread restoration remain integration milestones. Current API access is restricted to loopback, and application state lasts only for the server process. Public deployment requires authentication, a trusted-origin policy and durable storage.

Inject credentials through your secret manager. Never commit `.env` files, tokens, runtime state or private agent transcripts. Enabling live voice incurs provider usage; it is deliberately off in the sample configuration.

## Built from

The [CopilotKit Agents Everywhere starter](https://github.com/CopilotKit/agents-everywhere-starter-kit), MIT, at `86f547d74e8bd32e047226b0e1fb862cca02a5c7`. `STARTER-PROVENANCE.json` records the inherited snapshot and local baseline. AgentTalkie's workflow and interface are event work after that baseline. Pearl's persistent-dock interaction informed the design; its branding, media and application are not included.

The original starter setup documentation is retained in `docs/starter.md` when this publication package is integrated.
