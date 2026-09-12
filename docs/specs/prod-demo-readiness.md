# Spec: Production demo readiness

**Date:** 2026-09-12
**Status:** Approved
**Approved option:** A, prod ladder with a hard abort clock
**Complexity:** Moderate

## Context

AgentTalkie is deployed at agenttalkie.app and serves a fixture demonstration. Two sponsor integrations are real and evidenced (Exa retrieval, Ambiguous task create plus read-back), but both were exercised locally. On the deployed site the Ambiguous write path returns 403, the CopilotKit runtime lacked a model credential until 14:30 today, and live voice has never been exercised with a microphone.

The operator has chosen to record the two-minute demo on agenttalkie.app rather than localhost. That decision makes production the demo surface, so production must actually work. This spec sequences the remaining work so a recordable surface exists by 15:30 even if the last step fails.

Time budget: approximately one hour of build, then recording. Submission target 16:00, portal cutoff 16:30.

## Decisions

**Build on the existing application rather than regenerating it.** The outstanding work is configuration, not code. A fresh build would re-create 165 passing tests and still face the same credential, network and browser-permission blockers, while discarding the provenance trail that evidences event-period authorship.

**Reuse the existing origin allowlist rather than inventing a mechanism.** `AGENTTALKIE_PUBLIC_DEMO_ORIGINS` already gates the AgentTalkie routes in `agenttalkie-http.ts`. The Ambiguous follow-up route is inherited starter code that hardcodes loopback. Adopting the existing parser is a smaller and better understood change than writing a second policy.

**Keep a local hot spare running.** Recording on production removes the fallback that localhost currently provides. The local server stays up for the entire session.

**Abort OpenClaw at 15:20 regardless of progress.** The gateway is not currently listening on Elias and its Tailscale address is unreachable from Vercel, so production access requires starting the process, exposing it through a tunnel, wiring adapter configuration, and setting environment values. That is the long pole and it must not consume the recording slot.

## Tasks

### Task 0: Keep the local hot spare alive
**Objective:** Preserve a known-good demo surface while production is being changed.
**Complexity:** Simple
**Dependencies:** None
**Files to change:** None
**Acceptance criteria:**
  - A dev server runs under `op run --env-file=.env.op` for the whole session
  - `http://127.0.0.1:3100/api/copilotkit/info` returns 200
**Test plan:** Smoke: load the workspace and confirm fixture question and answer still render.
**Rollback plan:** Not applicable.
**Blast radius:** None. Do not run a second Next dev server against this repository; two servers share `.next` and corrupt each other.
**Research needed:** No

### Task 1: Set production environment values
**Objective:** Give the deployed application the credentials it needs to run the agent, voice broker, and providers.
**Complexity:** Simple
**Dependencies:** None
**Files to change:** Vercel project configuration only
**Acceptance criteria:**
  - `OPENAI_API_KEY`, `EXA_API_KEY`, `AMBIGUOUS_API_KEY` set for production
  - `AGENTTALKIE_LIVE_VOICE_ENABLED` set to `true`
  - `AGENTTALKIE_PUBLIC_DEMO_ORIGINS` set to `https://agenttalkie.app`
  - Values piped from `op read`, never pasted into a terminal transcript
  - After redeploy, `/api/copilotkit/info` returns 200 in production
**Test plan:**
  - Integration: fetch `/api/copilotkit/info` and `/api/agenttalkie/activity` from the deployed origin
  - Smoke: the workspace still renders and the activity ledger still lists the Exa and Ambiguous receipts
**Rollback plan:** Remove the variables and redeploy the previous production deployment.
**Blast radius:** The deployed CopilotKit route becomes an unauthenticated public endpoint that spends OpenAI credit. Set an account spend cap before this task.
**Research needed:** No

### Task 2: Adopt the origin allowlist in the follow-up route
**Objective:** Allow the Ambiguous create and read-back to run from the deployed origin without opening the route to arbitrary hosts.
**Complexity:** Moderate
**Dependencies:** None
**Files to change:** `apps/web/src/lib/server/followup-http.ts`, `apps/web/src/lib/server/followup-http.test.ts`
**Acceptance criteria:**
  - Loopback hosts remain permitted unconditionally
  - An origin listed in `AGENTTALKIE_PUBLIC_DEMO_ORIGINS` is permitted
  - An unlisted origin still receives 403
  - The existing DNS-rebinding protection and `SameSite=Strict` session cookie behaviour are unchanged
**Test plan:**
  - Unit: allowed loopback, allowed listed origin, denied unlisted origin, denied empty allowlist
  - Integration: `/api/followups` returns 200 from the deployed origin after redeploy
  - Smoke: existing `followup-http.test.ts` and `followups.test.ts` still pass
**Rollback plan:** Revert the single file and redeploy.
**Blast radius:** This is the one irreversible-in-spirit change. While the allowlist is live, anyone who reaches the deployed origin can create tasks in the real Ambiguous workspace. Revoke `AGENTTALKIE_PUBLIC_DEMO_ORIGINS` after submission.
**Research needed:** No

### Task 3: Exercise live voice on production
**Objective:** Prove the GPT-Live session negotiates with a real microphone.
**Complexity:** Moderate
**Dependencies:** Task 1
**Files to change:** None expected
**Acceptance criteria:**
  - A `gpt-live-1` session identifier is returned by the broker
  - Audio round-trips and a transcript event is observed
  - The delegation identifier appears on the resulting request
**Test plan:**
  - Integration: browser session on the deployed origin, microphone granted, one spoken question
  - Smoke: ending the session leaves the workspace usable
**Rollback plan:** Set `AGENTTALKIE_LIVE_VOICE_ENABLED` to false; the dock returns to its disabled state.
**Blast radius:** Voice usage is metered. The account is entitled: a bare session request returns 400 for transport rather than 401 or 403.
**Research needed:** No

### Task 4: Connect one real OpenClaw worker, behind an abort
**Objective:** Make the fleet claim literally true for one existing agent.
**Complexity:** Complex
**Dependencies:** Task 1
**Files to change:** `apps/web/src/lib/server/agenttalkie-runtime.ts`, plus Vercel configuration
**Acceptance criteria:**
  - The OpenClaw gateway is listening on Elias
  - It is reachable from the deployed application through a tunnel
  - `createOpenClawAdapter` receives a gateway URL, a token resolver and at least one target
  - One answer returns with an actual run or session reference
**Test plan:**
  - Unit: existing adapter tests continue to pass
  - Integration: one scoped read-only question returns a worker reply with evidence
  - Smoke: with the gateway down, the agent shows as unavailable and never fabricates an answer
**Rollback plan:** Revert the runtime registration to `createOpenClawAdapter()` with no options.
**Blast radius:** Exposes a fleet gateway to the public internet through a tunnel. Use a dedicated non-sensitive project and remove the tunnel after the event.
**Abort:** Stop at 15:20 regardless of progress.
**Research needed:** Yes, the gateway process and tunnel path are unverified.

### Task 5: Reconcile the submission with the final state
**Objective:** Ensure every claim matches what the recorded demo actually shows.
**Complexity:** Simple
**Dependencies:** Tasks 1 through 4
**Files to change:** `SUBMISSION.md`, `README.md` status table
**Acceptance criteria:**
  - Each sponsor row states its verified level with a provider reference where one exists
  - Anything not demonstrated is listed under limitations
**Test plan:** Smoke: read the document against the recording before submitting.
**Rollback plan:** Not applicable.
**Blast radius:** None.
**Research needed:** No

## Risks

| Risk | Mitigation |
|---|---|
| Public write path into the real Ambiguous workspace | Exact-origin allowlist, never a wildcard. Revoke the variable after submission. |
| Unauthenticated public model endpoint spends credit | Set an OpenAI spend cap before Task 1. |
| OpenClaw consumes the recording slot | Hard abort at 15:20, enforced as part of the task. |
| Production breaks and no local fallback exists | Task 0 keeps the local server running throughout. |
| Two dev servers corrupt the build output | Only one Next dev server per checkout. |

## Research Notes

Discovery ran inline rather than through a subagent because of the time budget. Findings: the allowlist mechanism already exists and is used by `agenttalkie-http.ts`; the follow-up route is inherited starter code with a hardcoded loopback guard; no OpenClaw gateway process is currently listening on Elias and its Tailscale address is not reachable from Vercel, though two cloudflared tunnels run there for other services.
