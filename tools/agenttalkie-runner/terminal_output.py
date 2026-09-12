"""Publish selected native CLI events, excluding reasoning and local diagnostics."""
import json
import re


def sanitize(text, checkout, secrets=()):
    text = str(text).replace(str(checkout), ".")
    for value in secrets:
        if value:
            text = text.replace(value, "[credential redacted]")
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+)", "[credential redacted]", text, flags=re.I)
    text = re.sub(r"op://[^\s\"']+", "[secret reference redacted]", text)
    text = re.sub(r"/Users/[^\s\"']+", "[local path redacted]", text)
    return text[:4000]


def display_events(event, harness):
    if harness == "codex":
        if event.get("type") == "thread.started":
            return ["Session " + str(event.get("thread_id", ""))]
        item = event.get("item", {})
        if item.get("type") == "command_execution":
            if event.get("type") == "item.started":
                return ["$ " + str(item.get("command", ""))]
            if event.get("type") == "item.completed":
                return [str(item.get("aggregated_output", "")), "Command exit: " + str(item.get("exit_code", "unknown"))]
        if item.get("type") == "agent_message" and event.get("type") == "item.completed":
            return [str(item.get("text", ""))]
        if event.get("type") == "turn.failed":
            return ["The native CLI reported a failed turn."]
    else:
        if event.get("type") == "system" and event.get("subtype") == "init":
            return ["Session " + str(event.get("session_id", ""))]
        if event.get("type") in ("assistant", "user"):
            result = []
            for block in event.get("message", {}).get("content", []):
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use":
                    result.append("Tool " + str(block.get("name", "")) + " " + json.dumps(block.get("input", {})))
                elif block.get("type") == "tool_result":
                    content = block.get("content", "")
                    if isinstance(content, str):
                        result.append(content)
                    elif isinstance(content, list):
                        result.extend(b.get("text", "") for b in content if b.get("type") == "text")
                elif block.get("type") == "text" and event.get("type") == "assistant":
                    result.append(block.get("text", ""))
            return result
        if event.get("type") == "result" and event.get("is_error"):
            return ["The native CLI reported a failed result."]
    return []


class TerminalOutput:
    def __init__(self, path, harness, checkout, publish, secrets=()):
        self.path, self.harness, self.checkout, self.publish, self.secrets = path, harness, checkout, publish, secrets
        self.offset = 0
        self.sequence = 0
        self.pending = []

    def add(self, text):
        if not text or self.sequence >= 200:
            return
        self.sequence += 1
        self.pending.append({"sequence": self.sequence, "text": sanitize(text, self.checkout, self.secrets)})

    def flush(self):
        while self.pending:
            batch = self.pending[:30]
            self.publish(batch)
            del self.pending[:len(batch)]

    def read(self):
        with self.path.open() as handle:
            handle.seek(self.offset)
            while True:
                start = handle.tell()
                line = handle.readline()
                if not line or not line.endswith("\n"):
                    self.offset = start
                    break
                self.offset = handle.tell()
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                for text in display_events(event, self.harness):
                    self.add(text)
        self.flush()
