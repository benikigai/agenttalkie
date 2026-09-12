import assert from "node:assert/strict";
import test from "node:test";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { toolMode, toolHash, validateTool, scrubResult } from "./agenttalkie-tool-policy";
const read:Tool={name:"get_document",inputSchema:{type:"object",properties:{id:{type:"string",format:"uuid"}},required:["id"],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
test("unknown policy and administration never execute as workspace reads",()=>{
 assert.equal(toolMode(read),"read");
 assert.equal(toolMode({...read,annotations:undefined}),"blocked");
 assert.equal(toolMode({...read,name:"list_identity_api_keys"}),"blocked");
 assert.equal(toolMode({...read,name:"documents_permissions_list"}),"blocked");
 assert.equal(toolMode({...read,name:"assistant_chat"}),"blocked");
 assert.equal(toolMode({...read,name:"delete_document",annotations:{readOnlyHint:false,destructiveHint:true}}),"approve");
});
test("live schema rejects invented arguments and IDs",()=>{
 assert.throws(()=>validateTool(read,{id:"invented"}));
 assert.throws(()=>validateTool(read,{id:"5914cb9b-8060-4d99-ad0f-78e2093e7a63",body:"extra"}));
 validateTool(read,{id:"5914cb9b-8060-4d99-ad0f-78e2093e7a63"});
});
test("approval hashes bind nested inputs independent of JSON field order",()=>{
 assert.equal(toolHash({a:1,b:{x:2,y:3}}),toolHash({b:{y:3,x:2},a:1}));
 assert.notEqual(toolHash({content:"old"}),toolHash({content:"new"}));
});
test("credentials are excluded from model and visible results",()=>{
 assert.deepEqual(scrubResult({api_key:"private",nested:[{access_token:"private",content:"Bearer abc123"}]}),{api_key:"[redacted]",nested:[{access_token:"[redacted]",content:"[redacted]"}]});
});
