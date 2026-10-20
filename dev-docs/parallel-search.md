# Optional web research in Claude Code

Use [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp) to look up current integration documentation while developing AgentTalkie. It provides free web search and page fetching without a Parallel account or API key. Anonymous search uses Fast mode and has lower rate limits than authenticated access.

This setup is for your local coding assistant. AgentTalkie's live workspace continues to use Exa, and the [runner's isolated coding jobs](../tools/agenttalkie-runner/README.md) do not inherit these MCP connections.

## Connect from this checkout

With [Claude Code installed](https://code.claude.com/docs/en/setup), run this from the repository root:

```sh
claude mcp add --transport http --scope local \
  parallel-search https://search.parallel.ai/mcp \
  --header "User-Agent: agenttalkie-dev/1.0"
claude mcp get parallel-search
```

Local scope saves the connection for this checkout in your personal Claude Code configuration. It leaves the shared [`.mcp.json`](../.mcp.json) and its CopilotKit and Exa connections intact. See [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp) for configuration scopes.

Start Claude Code in this checkout and run `/mcp` to check the connection. Confirm that `parallel-search` exposes `web_search` and `web_fetch`; no Parallel sign-in is needed at this endpoint.

## Research a change before implementing it

For example, ask your coding assistant:

```text
Use parallel-search to find current official Next.js documentation about
restricting iframe content with Content-Security-Policy. Read the relevant
pages with web_fetch, then compare the guidance with AgentTalkie's artifact
preview in apps/web/src/components/agenttalkie/artifact-preview.tsx.
Return source URLs and distinguish documented behavior from recommendations.
Do not edit files yet.
```

Inspect the tool results and cited pages before relying on the answer. A successful connection alone does not prove a search ran: check for a `web_search` result with source URLs and a `web_fetch` result containing relevant page text. Fetching reads public web content, not private workspace records.

If the server reports a rate limit, wait for the indicated retry time. For higher limits, use the [authenticated setup](https://docs.parallel.ai/integrations/mcp/search-mcp#installation). Keep credentials in your local configuration.

To remove this optional connection, run from the same checkout:

```sh
claude mcp remove --scope local parallel-search
```
