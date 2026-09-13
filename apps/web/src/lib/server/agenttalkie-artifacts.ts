import {createHash} from "node:crypto";
import {z} from "zod";
import {sql} from "./agenttalkie-live-store";
import {AgentTalkieError} from "./agenttalkie-service";

export const artifactHtmlSchema=z.string().min(30).max(100000).refine(s=>/<html[\s>]/i.test(s)&&/<script[\s>]/i.test(s),"An interactive HTML document is required");
export const artifactHash=(html:string)=>createHash("sha256").update(html).digest("hex");
export const artifactUrl=(id:string)=>`https://agenttalkie.app/api/agenttalkie/live/artifact/${id}`;
export const artifactCsp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
export function rejectCredentialContent(content:string,env:Record<string,string|undefined>=process.env){
 for(const [name,value] of Object.entries(env))if(/TOKEN|SECRET|API_KEY/.test(name)&&value&&value.length>6&&content.includes(value))
  throw new AgentTalkieError(422,"ARTIFACT_CREDENTIAL_REJECTED","The worker output contained a credential and was not published.");
}
export async function latestArtifact(owner:string,sessionId:string){
 const rows=await sql()`SELECT id,parent_id,html,content_hash,harness,job_id,created_at FROM agenttalkie_artifacts WHERE owner=${owner} AND thread_id=${sessionId} ORDER BY created_at DESC LIMIT 1`;
 return rows[0]??null;
}
export async function demoContext(owner:string,sessionId:string){
 const [artifact,tasks]=await Promise.all([latestArtifact(owner,sessionId),sql()`SELECT task_id FROM agenttalkie_demo_context WHERE owner=${owner} AND thread_id=${sessionId}`]);
 return {taskId:tasks[0]?.task_id??null,artifact:artifact?{id:artifact.id,url:artifactUrl(artifact.id),contentHash:artifact.content_hash,harness:artifact.harness}:null};
}
export function verifyParent(kind:string,context:Record<string,unknown>,parentId:string|null|undefined){
 if(kind==="build"&&parentId)throw new AgentTalkieError(409,"ARTIFACT_PARENT_MISMATCH","A new build cannot replace an existing artifact.");
 if(kind==="edit"&&(!parentId||parentId!==context.parentArtifactId))throw new AgentTalkieError(409,"ARTIFACT_PARENT_MISMATCH","The edit does not match the supplied artifact revision.");
}
