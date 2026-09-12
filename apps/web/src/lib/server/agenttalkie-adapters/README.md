# OpenClaw adapter

Implements the shared `AgentTalkieAdapter` interface for one existing OpenClaw session. This slice is tested with simulated HTTP responses. No live worker answer, authenticated Gateway request, or existing session has been verified.

`createOpenClawAdapter()` starts disconnected with no targets. It does not discover sessions, read environment variables, resolve secrets, start a server, or contact a provider on import. BACKEND owns registration in `agenttalkie-runtime.ts` and runtime configuration. No additional dependencies are required.

## Connect after the route is proven

Import `createOpenClawAdapter` from `./agenttalkie-adapters` in the backend runtime. Its options are declared in `openclaw.ts` and reuse the shared contract types.

1. Select an approved project and a discovered existing worker session. `target.agentId` must be the real Gateway agent ID, not an unverified directory alias. Set the existing provider label without changing the worker's provider/model. The target must use `evidenceMode: "live"`. Keep `availability: "unavailable"` until the route prerequisites are established.
2. Supply `connection.gatewayUrl`, the private Gateway origin, and `connection.resolveToken`, the server credential mediator. Use the existing 1Password reference with `op read` in that mediator. Return the resolved token, never an `op://` reference. Keep credentials out of target objects, status, browser code, prompts, and logs. No specific secret reference is known yet.
3. Supply `authorize(request)`. This trusted backend callback must verify the exact project, agent, session, question, request ID, revision, and controlling action authorization. For this first read-only slice, it must also verify an enforced read-only worker tool policy. A prompt asking the worker to be read-only, a directory row, a credential, or a blanket `true` callback does not establish that policy. False or a missing callback sends nothing. Credential resolution happens only after authorization.
4. Verify the installed endpoint is admitted for that existing session. This task does not enable endpoints, widen tool permissions, create a tunnel, or authorize inference/spend. The live activation decision remains with Ben and BACKEND.
5. BACKEND registers the configured adapter alongside its fixture adapter, adds `src/lib/server/agenttalkie-adapters/*.test.ts` to the test command, and owns integration/runtime checks. No shared manifests or runtime files were edited by TOOLS.

Missing connection or authorizer makes the selected target unavailable. Invalid target/session configuration fails at construction. HTTP uses the fixed `/v1/chat/completions` path, exact `x-openclaw-agent-id` and `x-openclaw-session-key`, and the `openclaw:<agentId>` agent alias. It sends no `user` fallback key, model override, additional tool definitions, arbitrary endpoint, or follow-up action. HTTPS origins or HTTP loopback origins are accepted; BACKEND must retain private ingress and authenticated browser access. Redirects are rejected.

Only a terminal `chat.completion` text response with a provider run ID is normalized to `worker_reply`. The evidence reference is a URN containing the selected session and the actual returned completion ID, not a fabricated clickable URL. `sourceObservedAt` stays null because the completion timestamp does not establish when project facts were observed. `retrievedAt` records retrieval. Checkpoints, fixtures, partial content, tool calls, malformed JSON, and errors cannot become a worker reply.

An identical request ID/revision reuses its in-process outcome. A changed question at that identity is rejected. Timeouts and connection failures after dispatch mean unknown remote completion, never cancellation or success. There are no automatic retries or alternate routes. The 256 retained requests include unknown outcomes; reconcile them before replacing the process or adapter. This process-local cache is not durable deduplication across restarts. BACKEND remains responsible for current-revision selection, late-result history, and spoken-result suppression.

## Check locally

From `07_Prototype-Code`:

```sh
node --import tsx --test apps/web/src/lib/server/agenttalkie-adapters/*.test.ts
npm run typecheck --workspace web -- --incremental false
```

Tests must mock HTTP and credential resolution. Do not use live credentials in these tests. Offline tests cannot satisfy the live spoken-request acceptance gate.

## Route evidence and open work

TOOLS inspected installed source on Elias over existing read-only SSH access on September 12, 2026, approximately 19:42 UTC. Package version is `2026.6.10`. Its `resolveSessionKey` accepts the explicit session header; `resolveAgentIdForRequest` handles the agent header. The non-streaming handler returns `id: chatcmpl_<UUID>`, `object: chat.completion`, `choices[0].message`, and `finish_reason`. Tool calls have a distinct finish reason and are rejected by this adapter.

| Installed source | SHA-256 |
| --- | --- |
| `/opt/homebrew/lib/node_modules/openclaw/dist/openai-http-Dx_t7kRS.js` | `4e1f21242fb716fb87db8857169ed68b3818c5a75569342fd751b8a84f938aab` |
| `/opt/homebrew/lib/node_modules/openclaw/dist/http-utils-BIa7AmQq.js` | `0e5215dcbf0fd9c6ee7df81be7f45b5fc90e73d9227f7426455c42703ad8687d` |

Current [official OpenClaw documentation](https://docs.openclaw.ai/gateway/openai-http-api) was checked against those installed files. It identifies the endpoint as a normal Gateway agent run with operator-level authority. It is disabled by default, and an explicit session header is needed to preserve an existing session. The credential does not narrow worker tools.

The event's `04_Research-Intel/fleet-standup-integration.md` records an earlier 16:31 UTC configuration inspection: neither Chat Completions nor Responses was explicitly enabled. Its 16:33 UTC authenticated-read preparation stopped before HTTP because credential mediation was unavailable. Those are dated configuration observations; this Tools source inspection does not establish current endpoint activation.

Still needed: approved project and existing session, actual Gateway agent ID/provider label, mediated credential, admitted private endpoint, enforced read-only worker policy, controlling authorization for the worker turn, and a real answer with a run reference. No session key, credential reference, authorization receipt, or live readiness was invented.
