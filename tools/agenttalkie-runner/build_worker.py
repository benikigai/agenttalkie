"""Generate an HTML artifact with native CLIs inside a container, never in the app checkout."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from terminal_output import TerminalOutput


def execute_build(job, _checkout, journal, revision, heartbeat, publish):
    harness = "claude" if job["kind"] == "edit" else "codex"
    model = "anthropic/claude-haiku-4.5" if harness == "claude" else "openai/gpt-5.4-mini"
    key = hashlib.sha256(job["id"].encode()).hexdigest()[:24]
    with (journal / (key + ".claim.json")).open("x") as out:
        json.dump({"jobId": job["id"], "claimId": job["claimId"], "harness": harness, "startedAt": time.time()}, out)
    workspace = journal / (key + ".workspace")
    workspace.mkdir(mode=0o700)
    launch_dir = journal / (key + ".launcher")
    launch_dir.mkdir(mode=0o700)
    context = job.get("context") or {}
    if harness == "claude":
        source = context.get("artifactHtml", "")
        if not source or hashlib.sha256(source.encode()).hexdigest() != context.get("contentHash"):
            raise RuntimeError("The supplied artifact does not match the approved parent revision.")
        (workspace / "index.html").write_text(source)
    shim = journal / "container-bin"
    shim.mkdir(exist_ok=True)
    for name in ("codex", "claude"):
        target = shim / name
        if not target.exists():
            target.symlink_to(Path(__file__).with_name("docker_harness.py").resolve())
    env = os.environ.copy()
    for name in tuple(env):
        if name.startswith("CODEX_") or name.startswith("AGENTTALKIE_"):
            env.pop(name, None)
    env.update(PATH=str(shim) + os.pathsep + env["PATH"], AGENTTALKIE_BUILD_WORKSPACE=str(workspace.resolve()),
               AGENTTALKIE_CONTAINER_NAME="agenttalkie-" + key, AGENTTALKIE_SECRET_FILTER=str((journal / (key + ".secrets")).resolve()))
    prompt = ("Create or edit only /workspace/index.html, a self-contained playable HTML app. "
              "Inline CSS and JavaScript, no dependencies, network calls, external links, storage, frames or forms. "
              "Use actual file tools to write the file. Do not only describe code. "
              "The filesystem is an isolated container with an empty demo workspace or the exact prior artifact. "
              "Do not inspect environment variables or runtime credentials. "
              "Give a concise final summary of changes and checks actually run. "
              + ("Preserve the existing game logic and accessibility while making the requested edit. " if harness == "claude" else "")
              + "User request: " + job["request"]["question"])
    if harness == "codex":
        native = ["ori", "codex", "--model", model, "--reasoning-effort", "low", "exec", "--ignore-user-config",
                  "-c", 'model_provider="openrouter"', "-c", 'model_providers.openrouter.name="OpenRouter"',
                  "-c", 'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"',
                  "-c", 'model_providers.openrouter.wire_api="responses"', "-c", 'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
                  "--dangerously-bypass-approvals-and-sandbox", "--ephemeral", "--skip-git-repo-check", "--disable", "plugins", "--disable", "apps",
                  "-c", "project_doc_max_bytes=0", "-c", 'web_search="disabled"', "-c", 'shell_environment_policy.inherit="core"',
                  "--json", "--output-last-message", "/workspace/result.txt", "-"]
    else:
        native = ["ori", "claude", "--model", model, "--reasoning-effort", "low", "--bare", "--setting-sources", "",
                  "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", "Read,Write,Edit,Grep,Glob",
                  "--allowedTools", "Read,Write,Edit,Grep,Glob", "--permission-mode", "acceptEdits", "--no-session-persistence",
                  "--max-budget-usd", "0.50", "--output-format", "stream-json", "--verbose", "--print"]
    stdout_path, stderr_path = journal / (key + ".stdout"), journal / (key + ".stderr")
    with stdout_path.open("w") as out, stderr_path.open("w") as err:
        process = subprocess.Popen(native, cwd=launch_dir, env=env, stdin=subprocess.PIPE, stdout=out, stderr=err, text=True)
        secrets = [v for k,v in os.environ.items() if any(word in k for word in ("TOKEN", "SECRET", "API_KEY")) and len(v)>6]
        secret_path = Path(env["AGENTTALKIE_SECRET_FILTER"])
        def load_secrets():
            if secret_path.exists():
                secrets.extend(json.loads(secret_path.read_text()))
                secret_path.unlink()
        terminal = TerminalOutput(stdout_path, harness, workspace, publish, secrets)
        terminal.add(f"$ ori {harness} --model {model} (isolated HTML workspace)")
        process.stdin.write(prompt)
        process.stdin.close()
        deadline, last_heartbeat = time.monotonic() + 180, 0
        try:
            while process.poll() is None:
                load_secrets()
                terminal.read()
                if time.monotonic() > deadline or stdout_path.stat().st_size > 1_000_000:
                    raise RuntimeError("The demo build exceeded its time or output limit; the previous preview is unchanged.")
                if time.monotonic() - last_heartbeat > 10:
                    heartbeat()
                    last_heartbeat = time.monotonic()
                time.sleep(1)
        finally:
            subprocess.run(["docker", "rm", "-f", env["AGENTTALKIE_CONTAINER_NAME"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=10)
    load_secrets()
    terminal.read()
    terminal.add("Process exit: " + str(process.returncode))
    terminal.flush()
    events = []
    for line in stdout_path.read_text().splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    if harness == "codex":
        native_id = next((e.get("thread_id") for e in events if e.get("type") == "thread.started"), None)
        answer_path = workspace / "result.txt"
        answer = answer_path.read_text() if answer_path.is_file() and not answer_path.is_symlink() else ""
    else:
        result = next((e for e in reversed(events) if e.get("type") == "result"), {})
        native_id, answer = result.get("session_id"), result.get("result", "") if not result.get("is_error") else ""
    artifact = workspace / "index.html"
    if process.returncode or not native_id or not answer or artifact.is_symlink() or not artifact.is_file() or artifact.stat().st_size > 100_000:
        raise RuntimeError("The native worker did not produce a verified HTML artifact. The previous preview is unchanged.")
    html = artifact.read_text()
    if any(value in html or value in answer for value in secrets):
        raise RuntimeError("The worker output contained a credential and was rejected before publication.")
    if "<html" not in html.lower() or "<script" not in html.lower():
        raise RuntimeError("The worker output is not a self-contained interactive HTML artifact.")
    return {"status": "completed", "answer": answer[:10000], "harness": harness, "nativeSessionId": native_id,
            "repositoryRevision": revision, "model": model, "artifactHtml": html,
            "parentArtifactId": context.get("parentArtifactId")}
