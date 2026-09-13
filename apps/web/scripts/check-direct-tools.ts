import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { restore, load, mutate, sql, liveTarget } from "../src/lib/server/agenttalkie-live-store";
import { admit } from "../src/lib/server/agenttalkie-coordinator";
import { runDirectTools, approveDirectTool } from "../src/lib/server/agenttalkie-direct-tools";
async function main(){
const owner=`direct-check-${randomUUID()}`;
const recordId=randomUUID();let title="Original";let writes=0;let wrongReadback=false;
const read:Tool={name:"get_task",inputSchema:{type:"object",properties:{id:{type:"string",format:"uuid"}},required:["id"],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
const create:Tool={name:"create_task",inputSchema:{type:"object",properties:{title:{type:"string"}},required:["title"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}};
const update:Tool={...create,name:"update_task",inputSchema:{type:"object",properties:{id:{type:"string",format:"uuid"},title:{type:"string"}},required:["id","title"],additionalProperties:false}};
function makeClient(){let closed=false;return {connection:{async listTools(){return {tools:[read,create,update]};},async callTool(input:{name:string;arguments:Record<string,unknown>}){assert.equal(closed,false,"MCP connection closed before the awaited preview read");if(input.name!=="get_task"){writes++;title=String(input.arguments.title);}return {content:[],structuredContent:{id:wrongReadback&&input.name==="get_task"?randomUUID():recordId,title}};}},async close(){closed=true;}};}
const session=await restore(owner);const sessionId=session.session.id;
async function request(question:string){const r={requestId:randomUUID(),revision:1,projectId:liveTarget.projectId,agentId:liveTarget.agentId,workerSessionId:liveTarget.workerSessionId,question};await admit(owner,sessionId,r);return {owner,sessionId,request:r};}
async function preview(name:string,args:Record<string,unknown>){const c=await request(`Use ${name} for ${JSON.stringify(args)}`);let turn=0;const result=await runDirectTools(c,c.request.question,async()=>++turn===1?{tools:[name,"get_task"],message:""}:{tool:name,argumentsJson:JSON.stringify(args),answer:""},makeClient());await mutate(owner,sessionId,s=>{const r=s.requests.at(-1)!;r.state="completed";const {question,...identity}=c.request;r.result={...identity,...result};});return c;}
try{
 await preview("create_task",{title:"Exact preview"});assert.equal(writes,0);
 const approved=await request("approve workspace action");
 const attempts=await Promise.allSettled([approveDirectTool(approved,()=>makeClient()),approveDirectTool(approved,()=>makeClient())]);
 assert.equal(attempts.filter(a=>a.status==="fulfilled").length,1);assert.equal(writes,1);
 const replay=await request("approve workspace action");await approveDirectTool(replay,()=>makeClient());assert.equal(writes,1);
 await preview("update_task",{id:recordId,title:"Requested edit"});title="Changed by another editor";
 await assert.rejects(approveDirectTool(await request("approve workspace action"),()=>makeClient()),/record changed/);assert.equal(writes,1);
 await preview("create_task",{title:"Unknown readback"});wrongReadback=true;
 await assert.rejects(approveDirectTool(await request("approve workspace action"),()=>makeClient()),/could not be verified/);assert.equal(writes,2);
 await assert.rejects(approveDirectTool(await request("approve workspace action"),()=>makeClient()),/not be retried/);assert.equal(writes,2);
 wrongReadback=false;await preview("create_task",{title:"Never execute after reset"});const stale=await request("approve workspace action");await mutate(owner,sessionId,s=>{s.status="ended";});
 await assert.rejects(approveDirectTool(stale,()=>makeClient()),/superseded/);assert.equal(writes,2);
 assert.equal((await load(owner,sessionId)).session.status,"ended");
 console.log("PASS: exact preview, concurrent approval executes once, replay, changed record rejection, unknown result without retry, and ended-thread protection. Provider calls were mocked; durable storage was real.");
}finally{
 await sql()`DELETE FROM agenttalkie_tool_actions WHERE owner=${owner}`;
 await sql()`DELETE FROM agenttalkie_events WHERE owner=${owner}`;
 await sql()`DELETE FROM agenttalkie_demo_context WHERE owner=${owner}`;
 await sql()`DELETE FROM agenttalkie_threads WHERE owner=${owner}`;
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
