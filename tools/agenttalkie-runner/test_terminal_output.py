import json
from pathlib import Path
import tempfile
import unittest
from terminal_output import TerminalOutput, display_events, sanitize

class TerminalTests(unittest.TestCase):
    def test_private_diagnostics_and_reasoning_are_not_published(self):
        for harness in ["codex", "claude"]:
            self.assertEqual(display_events({"type":"item.completed","item":{"type":"reasoning","text":"private reasoning"}},harness),[])
            self.assertEqual(display_events({"type":"assistant","message":{"content":[{"type":"thinking","thinking":"private reasoning"}]}},harness),[])
        self.assertEqual(display_events({"type":"system","subtype":"init","session_id":"abc","apiKeySource":"secret"},"claude"),["Session abc"])

    def test_secrets_paths_and_ansi_are_removed(self):
        output=sanitize("\x1b[31mBearer token123 sk-secret123 /Users/operator/private op://Private/Key/password EXACTSECRET /repo/file.ts",Path('/repo'),["EXACTSECRET"])
        for secret in ["token123","sk-secret123","/Users/","op://","EXACTSECRET","\x1b"]:self.assertNotIn(secret,output)
        self.assertIn('./file.ts',output)

    def test_partial_lines_and_retry_do_not_duplicate_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'stdout';path.write_text('{"type":"thread.started",')
            sent=[]
            def publish(entries):
                if not sent:
                    sent.append(None);raise RuntimeError('network error')
                sent.append(list(entries))
            stream=TerminalOutput(path,'codex',Path('/repo'),publish)
            stream.read();self.assertEqual(stream.sequence,0)
            with path.open('a') as handle:handle.write('"thread_id":"real-session"}\n')
            with self.assertRaises(RuntimeError):stream.read()
            stream.read();stream.read()
            self.assertEqual(stream.sequence,1)
            self.assertEqual(sent[-1],[{'sequence':1,'text':'Session real-session'}])

if __name__=='__main__':unittest.main()
