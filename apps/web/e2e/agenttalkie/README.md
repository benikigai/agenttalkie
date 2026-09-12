# AgentTalkie acceptance checks

DEMO owns this directory. Shared schemas and fixture are imported from `src/lib`; this directory does not define another contract. No new dependencies or package scripts are needed.

Use the shared URL from Backend's current status after Backend installs the locked dependencies and starts the server. From the product root:

```sh
node apps/web/e2e/agenttalkie/capture-revision.mjs > ../08_Demo-Submission/agenttalkie/evidence/before.json
AGENTTALKIE_BASE_URL=http://127.0.0.1:3100 node --import tsx --test apps/web/e2e/agenttalkie/fixture-http.test.ts
node apps/web/e2e/agenttalkie/capture-revision.mjs > ../08_Demo-Submission/agenttalkie/evidence/after.json
```

Use unique evidence filenames for each run and save the test output alongside them. Compare `files` and `sourceDigest` before/after; relevant edits invalidate a single-revision check. For browser results, also record URL, screenshot, actions and observed identities. The capture script reads product source/config hashes and Git metadata, excludes environment files, and writes JSON only to stdout.

The HTTP suite creates isolated fixture conversations on the loopback server and ends them afterward. It proves request/revision behavior through real HTTP routes: correction before the first answer, old result arriving last, exact retries, conflicts, forbidden targets, unavailable state, current prepared follow-up, and end during pending work. It never calls the voice endpoint or a live target. Retained ended sessions remain in the prototype's process-local history.

Missing dependencies or server are blockers, not passes. Use Backend for installation, runtime and product fixes. The suite fails if its deliberate fixture race is not observed; do not turn a timing failure into a claimed late-result pass.

These checks do not verify microphone capture, speech suppression, provider/session access, browser navigation, server restart durability, deployment or external delivery. Complete the browser and live cases in `08_Demo-Submission/agenttalkie/ACCEPTANCE.md` separately. Keep the current result in DEMO's single status file.

The app's TypeScript include list covers `src`; check this acceptance runner separately when editing it:

```sh
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --esModuleInterop apps/web/e2e/agenttalkie/fixture-http.test.ts
```
