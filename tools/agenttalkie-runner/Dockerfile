FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.154.0 @anthropic-ai/claude-code@2.1.270
WORKDIR /workspace
COPY container-entrypoint.sh /usr/local/bin/agenttalkie-entrypoint
RUN chmod 755 /usr/local/bin/agenttalkie-entrypoint
ENTRYPOINT ["/usr/local/bin/agenttalkie-entrypoint"]
USER node
