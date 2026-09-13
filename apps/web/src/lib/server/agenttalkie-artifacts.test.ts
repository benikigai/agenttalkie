import test from "node:test";
import assert from "node:assert/strict";
import {artifactCsp,verifyParent,rejectCredentialContent} from "./agenttalkie-artifacts";
import {interpret} from "./agenttalkie-coordinator";
test("preview cannot inherit app origin or make network requests",()=>{
 assert.match(artifactCsp,/sandbox allow-scripts/);assert.doesNotMatch(artifactCsp,/allow-same-origin|allow-top-navigation/);
 assert.match(artifactCsp,/connect-src 'none'/);assert.match(artifactCsp,/form-action 'none'/);
});
test("edit requires the exact parent artifact and new build cannot overwrite it",()=>{
 assert.throws(()=>verifyParent("edit",{parentArtifactId:"a"},"b"));
 assert.throws(()=>verifyParent("edit",{},null));
 assert.throws(()=>verifyParent("build",{},"a"));
 assert.doesNotThrow(()=>verifyParent("edit",{parentArtifactId:"a"},"a"));
});
test("literal credentials without a recognizable prefix cannot enter an artifact",()=>{
 assert.throws(()=>rejectCredentialContent("<html>opaque-value-123456</html>",{OPENROUTER_API_KEY:"opaque-value-123456"}));
 assert.doesNotThrow(()=>rejectCredentialContent("<html>game</html>",{OPENROUTER_API_KEY:"opaque-value-123456"}));
});
test("spoken fragments route actual builds and edits without relying on model classification",async(t)=>{
 t.mock.method(globalThis,"fetch",async()=>{throw Error("Unexpected model classification");});
 assert.equal((await interpret([{role:"user",text:"Have Codex build a black and white "},{role:"user",text:"tic tac toe game with reset"}],null)).action,"build");
 assert.equal((await interpret([{role:"user",text:"Have Claude change the game to green X and red O"}],null)).action,"edit");
});
