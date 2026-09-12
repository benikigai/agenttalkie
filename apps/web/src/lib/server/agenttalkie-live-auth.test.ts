import test from "node:test";
import assert from "node:assert/strict";
import { issueCookie, liveOwner, liveOrigin, sameSecret } from "./agenttalkie-live-auth";
const origin="https://agenttalkie.app";
process.env.AGENTTALKIE_DEMO_SECRET="offline-only-demo-secret-with-more-than-32-characters";
test("signed live access survives requests and rejects missing or changed cookies",()=>{
 const cookie=issueCookie().split(";")[0];
 const request=new Request(origin+"/api/agenttalkie/live/session",{headers:{cookie}});
 assert.match(liveOwner(request),/^[a-f0-9]{64}$/);
 assert.equal(liveOwner(request),liveOwner(request));
 assert.throws(()=>liveOwner(new Request(origin+"/api/agenttalkie/live/session")),/Unlock/);
 assert.throws(()=>liveOwner(new Request(origin+"/api/agenttalkie/live/session",{headers:{cookie:cookie+"x"}})),/Unlock/);
 assert.equal(sameSecret("right","wrong"),false);
});
test("live admission rejects lookalike hosts and cross-origin commands",()=>{
 assert.throws(()=>liveOrigin(new Request("https://agenttalkie.app.evil.test/api/agenttalkie/live/voice")),/AgentTalkie page/);
 assert.throws(()=>liveOrigin(new Request(origin+"/api/agenttalkie/live/voice",{method:"POST",headers:{origin:"https://evil.test"}})),/AgentTalkie page/);
 assert.throws(()=>liveOrigin(new Request(origin+"/api/agenttalkie/live/voice",{method:"POST"})),/AgentTalkie page/);
 assert.doesNotThrow(()=>liveOrigin(new Request(origin+"/api/agenttalkie/live/voice",{method:"POST",headers:{origin}})));
});
