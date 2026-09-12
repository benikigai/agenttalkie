# AgentTalkie backend handoff

September 12, 2026. Codex owns backend, deployment and runtime verification. Claude owns UI. Keep the existing contract and authored components.

## Verified production voice

Authenticated GPT-Live connected on agenttalkie.app and transcribed the operator asking for a virtual EA job description. No Enter is required for connected voice. Fixture mode still runs only a local microphone test.

## Live browser flow

1. GET /api/agenttalkie/live/auth returns authenticated. POST the same path with {password} unlocks a four-hour HttpOnly secure cookie. Access code lives in 1Password, Private / AgentTalkie Live Demo. Never put it in a URL or browser storage.
2. GET /api/agenttalkie/live/session restores the active durable thread and returns AT-contract-0.1 SessionSnapshot. Use its configured target. Do not submit fixture target IDs to live routes.
3. POST /api/agenttalkie/live/voice with {sessionId,sdp} returns the GPT-Live SDP answer. Browser data-channel events supply captions. Wait for session.started before labeling voice connected. Do not send session.start or require Enter.
4. On session.delegation.created, POST /api/agenttalkie/live/delegation with {sessionId,delegationId,transcript:[{role,text}]}. The delegation metadata has no task text. Returns accepted with request/snapshot, or clarify with message. Keep the exact delegation ID for speech.
5. Poll GET /api/agenttalkie/live/session?sessionId=... while pending. GET /api/agenttalkie/live/activity?sessionId=... returns actual provider events. Submit typed questions to /api/agenttalkie/live/requests using the same WorkerRequest identity/revision contract.
6. Send the current result through session.commentary.append with the original delegation_id. New corrections and End immediately invalidate old narration. Stop audio independently of durable work when implementing resume.

## UI requirements for this integration

- Show local mic test and connected voice distinctly. Do not show Listening as if transcription is active during a fixture mic test.
- Open captions when connecting, show Connecting / Listening / Working / Speaking truthfully, and display typed backend failures.
- Explicitly stop any local microphone-test stream before starting live voice after unlock.
- Pressing Enter inside the existing textarea creates a newline; Ask agent or Cmd/Ctrl+Enter submits typed input. Voice needs neither.

## Server boundaries and remaining work

All live routes require signed access, allowed origin and scoped thread ownership. The dedicated task ID is server-configured. OpenAI, Exa and Ambiguous keys already exist in Vercel. The approved access code and task reference have now been configured.

The coordinator supports a real selected-task read, public Exa research and document drafting. Coding requests return RUNNER_OFFLINE until a real runner is connected. The legacy follow-up preparation route does not save to Ambiguous. Do not display worker completion or Saved based on those states.

Real provider checks passed: the interpreter selected orient, the dedicated Ambiguous task read returned a verified result, then research returned Exa context with three source references. The test used a disposable owner and removed its records. Production authenticated task reads, Activity, duplicate-request replay and actual microphone transcription have also passed. A task description is source text, never evidence that a coding worker completed it.

## Document draft and approval flow

A request such as "Create a job description for our virtual EA" produces a complete preview through the existing WorkerResult panel. Evidence is an AgentTalkie checkpoint, explicitly not an Ambiguous save or coding worker result. The backend stores the exact title, content and visibility hash in agenttalkie_documents.

After reviewing the draft, say or type exactly "save this document". Voice delegates this command like any other request. Typed input still uses Ask agent or Cmd/Ctrl+Enter. The exact command, current draft revision and durable claim authorize one POST /api/documents. The backend then GETs that ID and compares title, text and restricted visibility before reporting Saved. Model-generated approval, stale or unfinished drafts, repeated writes and uncertain retries cannot create another document. Ambiguous's API calls private document visibility "restricted". No public link or remote record URL is invented.

A new table is added idempotently through apps/web/scripts/live-schema.sql and has been applied to the dedicated database. Live document list permissions returned HTTP 200. Real-model intent checks and durable approval/concurrency tests passed; provider create/readback behavior is covered with mocked HTTP. An actual Ambiguous document write remains unverified until an operator approves a concrete draft. Do not label the provider write proven before that receipt exists.

The UI contract is unchanged. Claude can later add an explicit save button using the same exact typed command after showing the full preview. Current voice sessions retain old instructions: reconnect voice after deployment. The live Activity endpoint now lifts providerRef into the event envelope, including actual Ambiguous task IDs and document save/readback IDs. Historical public receipt IDs remain intentionally unchanged.
