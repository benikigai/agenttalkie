# Claude production integration review

Inspected September 12, 2026. Claude's separate checkout is /private/tmp/at-polish. Reviewed readiness spec 6256ba9 and implementation 3c958b8. The implementation changes followup-http.ts and its tests. Both files also appeared in the shared checkout and are preserved.

## Findings

1. The allowlist correctly matches exact HTTPS origins and retains POST origin checks. It does not authenticate visitors. The route can read private Ambiguous tasks and authorize writes using a browser-created session. Integration therefore adds signed live access at the public route boundary, preserving local behavior and Claude's handler changes.
2. The claim that only configuration remains is incorrect. The public application runs client fixtures, the worker runtime has no configured live targets, and voice delegation needs a backend task interpreter and durable results. The live routes implement this separately from the public fixture.
3. followups uses a local file approval journal. Opening its origin gate does not provide durable Vercel approvals or satisfy the planned reviewed-result save workflow. That workflow remains incomplete.
4. A successful info endpoint or unit test does not demonstrate microphone audio, transcript events, delegation, or a real worker reply. Each requires runtime evidence.
5. Claude reports configuring production credentials and redeploying. Vercel metadata confirms OpenAI, Exa, Ambiguous, MODEL_PROVIDER and live-voice variables exist. No credential values were read for this review. Deployment and voice outcomes remain unverified here.

## Integration checks

The live storage schema was applied to the dedicated AgentTalkie Neon database. A disposable-owner test passed concurrent thread restoration, duplicate request admission, owner isolation, corrections, suppression of late obsolete answers, thread restoration and creation after ending. The test cleans up its records and makes no provider calls.

Added persistent WebRTC offer deduplication so an identical offer cannot create two sessions across processes, while a fresh explicit connection can reconnect to the same thread. Added a replay/concurrency test. The unit suite currently passes 170 tests; typecheck passes. The combined production build, including the review fixes, passed in an isolated directory without environment files.

## Still open

- Production access-code and dedicated demo-task configuration require the pending operator approval. Do not overwrite credentials Claude already configured.
- Real browser voice and complete provider execution need verification.
- The Ori Codex/Claude runner is not connected; the application must report RUNNER_OFFLINE rather than fabricate execution.
- The reviewed artifact save and read-back flow is not implemented.
- Coordinate deployment ownership before changing aliases while Claude is deploying.
