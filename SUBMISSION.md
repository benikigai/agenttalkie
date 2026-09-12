# AgentTalkie submission

AI Tinkerers "Agents Everywhere" global hackathon, San Francisco, September 12, 2026. Portal deadline 4:30 p.m. PDT.

Every claim below is written against captured evidence in `08_Demo-Submission/agenttalkie/evidence/` and `apps/web/src/lib/server/agenttalkie-adapters/activity-proof.json`. Where a capability is not verified, this document says so rather than implying it.

## Title and description

**AgentTalkie: talk to your whole agent fleet in one place.**

Agents are everywhere now, and that is the problem. One operator ends up running Grokbot, OpenClaw, Hermes, Claude Code, Codex, Sunny and Instinct at once, some cloud, some local, each holding its own session, memory and interface. There is no central place to ask the only three questions that matter: what changed, what is blocked, and what needs my decision. Coordination falls back to the human, who opens seven tools, re-reads context each one already has, and copies state between them by hand.

AgentTalkie is a persistent voice workspace over that fleet. You ask one question, it reads the relevant agent's own working context, and every statement it makes carries the agent identity and the evidence behind it. When you correct the scope mid-flight, the question revision increments and results that answered the older revision stay in history instead of being narrated as current.

**Who it is for.** An operator running parallel agent work across machines and providers who needs to know what needs a decision before anything else.

**Why the environment matters.** Remove the surface and the value goes with it. The point is not typing the same question into seven tools and reconciling the answers yourself. The context that makes an answer useful already lives inside each agent's session, so a standalone chatbox would require fetching and pasting all of it first, which is precisely the work being eliminated.

## Build eligibility

- [x] Net-new build created during the official hackathon period
- [x] Core functionality built during the event
- [x] Inherited code identified separately from event work

**What we inherited.** The CopilotKit Agents Everywhere starter, MIT, at commit `86f547d74e8bd32e047226b0e1fb862cca02a5c7`, recorded in `STARTER-PROVENANCE.json`. The inherited baseline commit in this repository is `c08df8aa949d7a88ce0fcd23864beea78eba0cc3`. We kept its Next.js web app, model resolver, Exa search capability and Ambiguous MCP client shape.

**What we built during the hackathon.** Everything under the `agenttalkie` namespace: the executable request and result contract (`agenttalkie-contract.ts`), the request lifecycle and revision service (`agenttalkie-service.ts`), the HTTP boundary (`agenttalkie-http.ts`), the worker adapters including the OpenClaw route and provider receipts (`agenttalkie-adapters/`), the GPT-Live browser controller (`voice/live-controller.ts`), and the workspace, fleet rail, provenance surface and persistent voice dock (`components/agenttalkie/`). The starter's incident demo is not our submission.

## Sponsor technologies and what each actually did

| Sponsor | State | Evidence |
|---|---|---|
| **Ambiguous AI** | **Live provider proof.** One demo task was created and confirmed by exact readback through a managed integration identity. | One create and one readback. The provider returned no safe task URL, so the public app does not construct one. Exact correlation stays in the local evidence bundle. |
| **Exa** | **Live.** One completed retrieval against `api.exa.ai/context` returning ten results with linked sources. | Provider ref `26ff394d654cb8c6c8139d1748c007cb`, observed 2026-09-12T20:47:50Z, 1.0s search time, $0.007. |
| **CopilotKit / AG-UI** | **Integrated, runtime not running.** The workspace is wired to the CopilotKit runtime and AG-UI. `/api/copilotkit/info` currently returns a typed 500 because no OpenAI credential is present. | Commit `0202785`. Limitation recorded in `components/agenttalkie/verification.json`. |
| **OpenRouter** | **Attempted, not confirmed.** An Ori coding-harness job was requested through Ori's OpenRouter OAuth route for `openai/gpt-5.4-mini` and was interrupted. The upstream provider and actual model were never confirmed. | The public receipt records the interrupted state and `actualModelConfirmed: false` without exposing the internal run ID. |
| **OpenAI GPT-Live** | **Not verified.** The WebRTC controller and server broker are implemented and covered by simulated tests. Physical microphone capture and remote playback were not completed. | `components/agenttalkie/verification.json`, `notVerified`. |

Sponsor count is not a judging criterion. Two integrations are real and evidenced; the rest are stated at their actual level.

## Evidence for the judging criteria

**Core Requirements & Functionality.** The labeled public fixture runs question, attributed answer, correction, history, prepared follow-up and End in one browser tab. Separate live provider evidence records an Ambiguous task whose saved state was confirmed by re-reading the provider record rather than trusting the write response. 165 automated tests pass; typecheck is clean.

**Innovation & Theme Alignment.** The interaction only exists because the agent lives beside the fleet's own sessions. The demo shows existing agent context before any prompt, and the fleet rail shows per-agent availability, including an agent that cannot be reached.

**Technical Execution & Integration.** Three failure paths are deliberate and visible. A corrected question increments the revision and an older result that lands late is preserved in history instead of being presented as current. An unreachable agent is shown as unavailable rather than answered on its behalf. The Ambiguous write refuses to proceed if the connected workspace or identity changed since the proposal, validates arguments against the live tool schema before calling, and reports an uncertain outcome rather than creating a duplicate.

**Usefulness & Agentic Experience.** The work saved is the manual reconciliation pass across seven tools. Control stays with the operator: a follow-up is prepared, not sent, and remains labeled prepared until an authorized route returns an acknowledgement.

## Honest limitations

- Live microphone capture, remote playback, and a reply from an existing OpenClaw worker session are not verified. The OpenClaw gateway request was not attempted with a live credential.
- The demonstrated conversation uses a labeled fixture worker. The evidence kind is displayed on every result, and fixture results are marked `Fixture`.
- CopilotKit's runtime route needs an OpenAI credential to respond.
- The public deployment allows the labeled client fixture only. Live sessions stay blocked until authentication, durable state and an admitted provider route are implemented.

## Deliverables

- [x] Public repository: https://github.com/benikigai/agenttalkie
- [x] Deployed application: https://agenttalkie.app
- [ ] Two-minute demo video (script ready in `08_Demo-Submission/agenttalkie/DEMO-SCRIPT.md`; use the version matching the evidence mode actually recorded)
- [ ] Social post tagging the event partners
- [ ] Portal entry submitted

Before recording, confirm the evidence mode on screen matches what is claimed aloud. Do not stage a late arrival, dub an agent reply over typing, or describe a locally generated identifier as a provider record.
