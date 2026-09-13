#!/usr/bin/env python3
"""Ori invokes this shim; Docker receives only the per-job workspace and model credentials."""
import os
import json
from pathlib import Path
import sys

workspace = Path(os.environ["AGENTTALKIE_BUILD_WORKSPACE"]).resolve(strict=True)
harness = Path(sys.argv[0]).name
if harness not in ("codex", "claude") or not workspace.is_dir():
    raise SystemExit("Invalid demo harness or workspace")
command = ["docker", "run", "--rm", "-i", "--name", os.environ["AGENTTALKIE_CONTAINER_NAME"],
           "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128",
           "--memory=768m", "--cpus=1", "--user", f"{os.getuid()}:{os.getgid()}",
           "--tmpfs", "/tmp:rw,nosuid,size=128m,mode=1777", "--workdir", "/workspace",
           "--mount", f"type=bind,src={workspace},dst=/workspace",
           "-e", "HOME=/tmp", "-e", "CODEX_HOME=/tmp/codex", "-e", "CLAUDE_CONFIG_DIR=/tmp/claude"]
for name in ("OPENROUTER_API_KEY", "ORI_OPENROUTER_SESSION_ID", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY",
             "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
             "ANTHROPIC_DEFAULT_OPUS_MODEL", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"):
    if name in os.environ:
        command += ["-e", name]
secrets = [v for k,v in os.environ.items() if any(word in k for word in ("TOKEN", "SECRET", "API_KEY")) and len(v)>6]
secret_path = os.environ["AGENTTALKIE_SECRET_FILTER"]
fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as handle:
    json.dump(secrets, handle)
os.execvp("docker", command + ["agenttalkie-demo-worker:1", harness, *sys.argv[1:]])
