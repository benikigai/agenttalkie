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
