# AgentTalkie backend handoff

September 12, 2026. Codex owns backend, deployment and runtime verification. Claude owns UI. Keep the existing contract and authored components.

## Why speaking currently does nothing

The inspected production tab is in Fixture mode and runs a local microphone test. That mode intentionally sends no audio to OpenAI. A moving microphone meter is not a voice connection. No Enter key is required for a connected GPT-Live conversation.

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

The current coordinator supports a real selected-task read and public Exa research. Coding requests return RUNNER_OFFLINE until a real runner is connected. Follow-up preparation does not save to Ambiguous. Do not display worker completion or Saved based on those states.

Real provider checks passed: the interpreter selected orient, the dedicated Ambiguous task read returned a verified result, then research returned Exa context with three source references. The test used a disposable owner and removed its records. Production deployment and actual microphone checks are still in progress. Local tests and builds are not evidence that production voice works.
