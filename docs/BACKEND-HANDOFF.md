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

## Live workspace and conversation controls

Task discovery now calls auth_whoami plus list_tasks against the authenticated workspace, returns up to 20 real records, and selects only a provider-returned ID or the configured initial task. Selection and displayed task order persist in agenttalkie_workspace_context. Task listing, selection/readback and Exa research passed real provider checks with an isolated test owner. The configured demo record remains readable when explicitly requested; it is no longer the only selectable task.

The normal entry screen requires unlocking real workspace access. Fixture conversations are kept in test code, not presented as live functionality. The main evidence strip reads the current live conversation's Activity endpoint; historical public receipts no longer appear in live work. A document checkpoint gets an explicit Save this document to Ambiguous button.

New conversation ends the current thread, stops voice through a dock remount and opens an empty durable thread. Clear conversation history confirms removal of the current thread's questions/answers, deletes unsubmitted document drafts and task selection context, and opens a new thread. Saved Ambiguous records and provider receipts are preserved. Repeated reset requests do not create extra active threads; late results cannot refill cleared history. These paths passed isolated durable-store tests.

Backend changed a few UI interaction files for Ben's explicit new-conversation/clear-history request and to remove misleading historical evidence from the live view. Keep Claude's visual styles and merge later UI changes normally.


## Live demo integration checkpoint

Merged UI commits through b73f86e preserve Claude's tool panel and expandable receipt design while retaining the live session Activity endpoint, polling, real-task prompts, document Save, New conversation and Clear history. The incoming UI commits had removed those controls and restored the historical receipt endpoint. Preserve the current versions when integrating further UI work.

The actual voice-created Sample VA Job Description for Ambiguous Workspace was opened in the provider UI at https://app.ambiguous.ai/docs/82ae345c-91ec-4eab-befb-f737fdaeec7f. Its contents and AgentTalkie attribution were visible. Document creation is now independently verified in the external tool. New saved-document receipts link directly to that provider's verified document URL structure.

The outbound runner implements authenticated single-claim jobs, native process receipts, exact Codex-artifact binding for Claude review, replay-safe terminal events and a four-minute unknown-result timeout. The dedicated database migration is applied. Native read-only Ori Codex and Claude Code calls both returned actual session IDs in isolated public source checks. Codex session: 01a097c3-650e-7c11-9ed5-6455026248aa. Claude session: e90fa3ed-3810-4a5d-ad65-e9c2d44725ae. These local native-process checks were followed by successful authenticated production requests through the queue. Production Codex session: 01a097c7-7d0c-7fd1-94cc-a646c5a1d0a1. Production Claude session: a9002549-a829-49cc-8308-6a6fad8b3e42. Each returned worker_reply evidence plus worker_start and completed Activity events. The isolated test conversation was removed afterward; the operator conversation was untouched.

Ori prepends model-provider flags before the Codex exec command. Codex's --ignore-user-config drops those prepended settings, so the runner explicitly restores the OpenRouter provider after exec, using the environment credential supplied by Ori. No keys are stored in source. Outer sandbox restrictions exclude global agent instructions and skill inventories; native Codex remains read-only and Claude only has Read/Grep/Glob.

The active demo runner was started with a one-hour limit and ten-job maximum against public snapshot c89bef2e8f6daa396e1484ec281d4042862666fa. It performed two production verification jobs. Coding investigations and reviews are read-only; no code changes are applied or deployed by a worker. UI integrations through PR #16 preserve the live controls and current-conversation Activity feed.

## Direct Ambiguous tools

The direct connector discovers the live MCP catalog and selects tools for each explicit workspace request. It validates all inputs against the provider schema. Reads run immediately. Mutations stop at an exact input preview; the user says `approve workspace action` or uses the matching button. A durable compare-and-set claim binds the action, schema, prior record snapshot, owner and current thread revision. Replays return saved receipts; uncertain outcomes never trigger an automatic second mutation. Existing document draft/save controls remain supported.

The catalog observed during implementation contained 856 tools: 268 read tools, 458 actions requiring approval and 130 excluded account/administration/sharing/autonomous-agent tools. Catalog presence does not prove the credential permits every tool. Provider permission failures are shown as failures. No autonomous Ambiguous assistant is invoked. Up to four planning steps run per request; follow-up turns can continue longer workflows.

Activity shows real tool names, bounded input/result excerpts and returned record IDs. Document responses link to the actual document. The real Ambiguous workspace must remain a separate browser tab/window because it sends `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`.

Validation: `npm run verify`; `scripts/check-direct-tools.ts` tests actual durable claims with mocked provider writes; `scripts/check-direct-live.ts` exercises real model selection and workspace reads. Its optional `--write-demo-task` creates one unassigned verification task and keeps that provider record. Never use it for cleanup or destructive checks. Credentials come from the existing ignored 1Password reference file and database environment file.

The coordinator now consumes the first structured assistant message per decision. Responses can contain multiple assistant messages; joining their JSON previously corrupted requests. A regression test covers that response shape.
