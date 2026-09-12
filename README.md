# AgentTalkie

Talk to your whole agent fleet in one place, and find out what actually needs you.

## The problem

Agents are everywhere now, and that is the problem. A working operator ends up running Grokbot, OpenClaw, Hermes, Claude Code, Codex, Sunny and Instinct at the same time. Some are cloud services, some are local processes on different machines. Each one holds its own session, its own memory and its own interface.

There is no central place to ask the only three questions that matter: what changed, what is blocked, and what needs my decision.

So coordination falls back to the human. You open seven tools, re-read the context each one already has, copy state between them by hand, and try to remember which agent you told what. The agents are capable individually. The fleet is not coordinated, because you are the only thing connecting it.

## What AgentTalkie does

AgentTalkie is a persistent voice standup over the fleet. You open the workspace, press talk, and hold a short spoken conversation: what changed, what is blocked, what needs me. It reads each agent's own working context through an adapter, so nothing has to be pasted in. Every statement it makes carries the agent identity and the evidence behind it.

The interaction it enables is steering. You interrupt, narrow the scope, ask for the source, or correct a proposed next step, and the current answer changes while you are still talking.

## Why this belongs in a voice workspace

Remove the environment and the value goes with it. The entire point is that you do not want to type the same question into seven different tools and reconcile the answers yourself. The context that makes the answer useful already lives inside each agent's session; a standalone chatbox would need you to fetch and paste all of it first, which is the work being eliminated.

## What makes it more than a chat wrapper

- **Attributed evidence.** Every finding names the agent and the kind of evidence it came from. A dated checkpoint, a source read and an actual worker reply are different kinds and are never presented as the same thing.
- **Question revisions.** Correcting the scope increments a revision. Results that answered an older revision are kept in history and excluded from the current answer, so a late reply never gets narrated as the current one.
- **Honest failure states.** An agent that cannot be reached is shown as unavailable. The application does not invent a standup answer for it.
- **Prepared is not sent.** A follow-up is prepared with its recipient, scope and revision. It becomes delivered only when an authorized route returns an acknowledgement.

## Status

This is hackathon software built during the Agents Everywhere event on September 12, 2026. What is real today:

| Area | State |
|---|---|
| Web workspace, persistent voice dock | Working |
| Request and session contracts, revisions, obsolete-result suppression | Working, covered by local tests |
| Attributed findings, evidence history, prepared follow-ups | Working |
| Sample fixture evidence, clearly labeled, no credentials needed | Working |
| GPT-Live WebRTC controller and server broker | Wired, disabled by default |
| OpenClaw adapter | Code present, disconnected until an authorized existing-session route is configured |
| Ambiguous AI task write and read-back | Planned |
| Exa retrieval | Planned |
| CopilotKit task event views, durable threads | Planned |

Local tests exercise application logic. They do not establish live audio, an authenticated worker reply, or production readiness.

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

## Architecture

See [docs/architecture.md](docs/architecture.md) for the runtime boundaries, the correction sequence, and which paths are scaffold versus planned integration.

AgentTalkie owns request interpretation, task identity, permissions, revision checks and results. GPT-Live supplies the conversational interface. Existing agents keep their own context and model routing; the application never calls a raw provider API and labels the response as one of your agents.

## Where this goes

The web workspace is the build surface, not the destination. The interaction is designed for a phone home screen: open it, talk for ninety seconds, know what your fleet did overnight and what is waiting on you.

## Known gaps

Live GPT-Live account access and end-to-end microphone behavior are not verified. Existing-worker connection, automatic trusted delegation, Ambiguous task writeback and read-back, Exa retrieval and durable thread restoration remain integration milestones. Current API access is restricted to loopback, and application state lasts only for the server process. Public deployment requires authentication, a trusted-origin policy and durable storage.

Inject credentials through your secret manager. Never commit `.env` files, tokens, runtime state or private agent transcripts. Enabling live voice incurs provider usage; it is deliberately off in the sample configuration.

## Built from

The [CopilotKit Agents Everywhere starter](https://github.com/CopilotKit/agents-everywhere-starter-kit), MIT, at `86f547d74e8bd32e047226b0e1fb862cca02a5c7`. `STARTER-PROVENANCE.json` records the inherited snapshot and local baseline. AgentTalkie's workflow and interface are event work after that baseline. Pearl's persistent-dock interaction informed the design; its branding, media and application are not included.

The original starter setup documentation is retained in [docs/starter.md](docs/starter.md).
