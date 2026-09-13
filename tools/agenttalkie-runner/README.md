# AgentTalkie demo runner

Polls the authenticated production queue, launches real Ori Codex investigations or Claude Code reviews, and returns the native session ID, repository revision, answer hash and result. The runner only inspects a public, committed repository snapshot. Claude reviews the exact prior Codex artifact. It does not change or deploy code.

Requires macOS, Python 3, authenticated `ori`, `codex`, `claude`, and `op`. Start from a public `git archive` checkout without credentials or local configuration. The reference file contains `AGENTTALKIE_DEMO_SECRET=op://...`, not a password.

```sh
python3 tools/agenttalkie-runner/runner.py \
  --access-reference-file /path/to/ignored-access-reference.op \
  --checkout /path/to/public-snapshot \
  --revision FULL_COMMIT_SHA \
  --journal /private/tmp/agenttalkie-runner-journal \
  --duration 3600 --max-jobs 10
```

The process must remain running. Each native job has a 150-second limit; Claude also has a $0.50 budget. The local journal prevents relaunch after an uncertain acknowledgment. Cloud jobs time out after four minutes without a result and are never automatically relaunched. Keep the journal private and retain it for uncertain deliveries.

The native tools exclude global agent instructions, skills and MCP integrations. Codex uses its read-only sandbox; Claude only has Read, Grep and Glob. Provider routing is restored explicitly after `exec` because `--ignore-user-config` also drops Ori's prepended provider settings.

The dashboard polls authenticated job output once per second while a job is running. The runner publishes selected native JSON events, including commands, file-tool results and final text. Reasoning events, stderr diagnostics, credentials and private paths are excluded. The viewer has no terminal input or arbitrary-command endpoint. Each job retains up to 200 entries of 4,000 characters; retries preserve entry sequence IDs. Only runners advertising output protocol version 1 claim new jobs.


## Playable build/edit demo

Build the runtime once with `docker build -t agenttalkie-demo-worker:1 tools/agenttalkie-runner`. This installs pinned Linux Codex 0.154.0 and Claude Code 2.1.270 inside a local Docker image; the web app gains no dependencies. The normal runner advertises build protocol 1 after startup.

`build` asks the real Ori-launched Codex CLI to write a self-contained `index.html`. `edit` copies the exact preceding artifact bytes, verifies their SHA256, then asks the real Ori-launched Claude Code CLI to edit that file. Each job uses a fresh directory under the private runner journal. Only that directory is mounted at `/workspace`; the host home, main application checkout, Docker socket and credential files are not mounted. The container root filesystem is read-only, runs as a non-root UID, drops Linux capabilities and has bounded memory, CPU, process count and execution time. Runtime state is temporary. Codex's inner sandbox is disabled because the Docker boundary enforces the filesystem restrictions; this does not grant host filesystem access. Claude receives only Read, Write, Edit, Grep and Glob tools. The container receives model credentials required by its harness, not the backend or Ambiguous credentials. It has outbound networking for model requests, so this is not a network-isolated VM.

Ori runs on the host as the trusted credential/configuration launcher, from a separate empty launcher directory. Its native CLI shim starts Docker; launcher state is not mounted into the container. Literal model credentials are transferred through a private, temporary redaction file outside the mount, read into the runner's memory and removed. Published terminal lines redact those values, and artifacts/results containing them are rejected.

Completed HTML is stored in the existing database with owner, job ID, parent artifact ID and SHA256. The authenticated artifact route enforces owner access and sends a CSP sandbox. The dashboard iframe permits scripts without same-origin access. A failed or superseded edit cannot replace the saved preview. No separate website deployment is created. The selected Ambiguous task ID remains in thread context across build/edit turns; completing it still requires review and the existing workspace approval button.
