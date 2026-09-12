import { z } from "zod";
import { DocumentDraftSchema, documentDraftFormat, prepareDocument, saveDocument } from "./agenttalkie-documents";
import { configuredWorkplace } from "./workplace";
import { liveTarget, mutate, load, recordEvent, sql } from "./agenttalkie-live-store";
import { AgentTalkieError } from "./agenttalkie-service";
import { type WorkerRequest, type WorkerResult, type RequestRecord, WorkerRequestSchema } from "../agenttalkie-contract";

export async function modelJSON(instructions: string, input: unknown, schema: Record<string,unknown>, maxTokens = 900) {
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:"gpt-5.4-mini",store:false,instructions,input:JSON.stringify(input),max_output_tokens:maxTokens,text:{format:{type:"json_schema",name:"command",strict:true,schema}}})});
  if(!response.ok) throw new AgentTalkieError(502,"COORDINATOR_UNAVAILABLE","The backend could not interpret this request. No action was taken.");
  const data=await response.json();
  if(data.status!=="completed") throw new AgentTalkieError(502,"COORDINATOR_INCOMPLETE","The backend did not finish interpreting this request.");
  const text=data.output?.flatMap((x:{content?:{type:string;text?:string}[]})=>x.content??[]).filter((x:{type:string})=>x.type==="output_text").map((x:{text:string})=>x.text).join("");
  return JSON.parse(text);
}
export const Intent=z.object({action:z.enum(["orient","research","investigate","review","draft_document","save_document","clarify"]),question:z.string().min(1).max(4000),correction:z.boolean()}).strict();
const intentSchema={type:"object",properties:{action:{type:"string",enum:["orient","research","investigate","review","draft_document","save_document","clarify"]},question:{type:"string"},correction:{type:"boolean"}},required:["action","question","correction"],additionalProperties:false};
export async function interpret(transcript: unknown, previousQuestion: string | null) {
  const fragments = z.array(z.object({role:z.enum(["user","assistant"]),text:z.string()})).parse(transcript);
  const conversation: {role:"user"|"assistant";text:string}[]=[];
  for(const fragment of fragments){
    const last=conversation.at(-1);
    if(last?.role===fragment.role)last.text+=fragment.text;
    else conversation.push({...fragment});
  }
  // The host may acknowledge before emitting delegation; approval must come from the user.
  const latest = conversation.findLast(turn => turn.role === "user");
  if (latest?.role === "user" && /^save this document[.!?]*$/i.test(latest.text.trim()))
    return Intent.parse({action:"save_document",question:"save this document",correction:false});
  const classified = Intent.parse(await modelJSON(
    "Classify the user's latest spoken request, using the conversation only to resolve references. These are streamed transcript fragments that have been joined by speaker; punctuation can be missing and the newest utterance can be incomplete. The previous question is historical context, NEVER a command to repeat. Do not repeat a task read merely because it was previously requested. For greetings, acknowledgments, 'can you hear me', or insufficient new user intent, choose clarify and give a short conversational response. The app has one dedicated demo task selected server-side. Choose orient only when the latest user request asks to read or understand that task. Choose research for public code examples via Exa. Choose investigate for a Codex repository investigation, review for Claude reviewing an existing code artifact. Coding execution may be unavailable; never claim it happened. Choose draft_document for creating or revising a document or job description. Include the user requirements in question. This prepares a draft only, never an external write. Never choose save_document; saving is separately authorized by the exact spoken command save this document after a draft is displayed. For other save/approval phrases choose clarify and instruct the user to review the draft and say exactly save this document. Arbitrary workspace browsing, sending messages, editing existing remote documents and other writes are unsupported; explain that limitation explicitly instead of substituting the demo task. Set correction only when the current user is changing the previous coding/task question. Public research queries must exclude private identifiers and record content.",
    {conversation,previousQuestion,application:{selectedTask:"Dedicated AgentTalkie demo task",taskConfigured:!!process.env.AGENTTALKIE_TASK_ID}},
    intentSchema,
  ));
  if (classified.action === "save_document") return Intent.parse({action:"clarify",question:"Review the draft, then say exactly: save this document.",correction:false});
  return classified;
}
export async function admit(owner:string,sessionId:string,raw:WorkerRequest) {
 const request=WorkerRequestSchema.parse(raw);
 if(request.projectId!==liveTarget.projectId||request.agentId!==liveTarget.agentId||request.workerSessionId!==liveTarget.workerSessionId)throw new AgentTalkieError(403,"TARGET_NOT_ALLOWED","Select the configured live workspace.");
 let admitted=false;
 const result=await mutate(owner,sessionId,s=>{
  admitted=false;
  if(s.status!=="active")throw new AgentTalkieError(409,"SESSION_ENDED","Start a new conversation.");
  const exists=s.requests.find(r=>r.requestId===request.requestId&&r.revision===request.revision);
  if(exists){if(exists.question!==request.question)throw new AgentTalkieError(409,"REQUEST_CONFLICT","Request identity already used.");return;}
  const previous=s.requests.filter(r=>r.requestId===request.requestId).at(-1);
  if(request.revision!==(previous?.revision??0)+1 || (previous&&s.activeRequestId!==request.requestId))throw new AgentTalkieError(409,"STALE_REVISION","Correct the current request only.");
  if(s.requests.length>=50)throw new AgentTalkieError(429,"DEMO_LIMIT","This demo thread reached its 50 request limit.");
  for(const r of s.requests) if(r.requestId===s.activeRequestId&&r.revision===s.activeRevision)r.state="superseded";
  const now=new Date().toISOString();s.requests.push({...request,state:"pending",createdAt:now,updatedAt:now,result:null,error:null});s.activeRequestId=request.requestId;s.activeRevision=request.revision;s.preparedFollowup=null;admitted=true;
 });
 return {snapshot:result,admitted,request};
}
export async function complete(owner:string,sessionId:string,request:WorkerRequest,intent?:z.infer<typeof Intent>) {
 try {
  await recordEvent(owner,sessionId,request,"agenttalkie","Question accepted","running");
  const selected=intent??await interpret([{role:"user",text:request.question}],null);
  let answer="";let evidence:WorkerResult["evidence"]=[];
  if(selected.action === "save_document" && selected.question !== "save this document") throw new AgentTalkieError(409,"DOCUMENT_APPROVAL_REQUIRED","Review the draft, then say exactly: save this document.");
  if(selected.action==="orient"){
   if(!process.env.AGENTTALKIE_TASK_ID)throw new Error("Task not configured");
   await recordEvent(owner,sessionId,request,"ambiguous","Read the selected demo task","running");
   const client=configuredWorkplace();
   try {
    const task=await client.workplace.get(process.env.AGENTTALKIE_TASK_ID);
    const now=new Date().toISOString();
    // Task instructions are source text, never proof of completed worker actions.
    answer=`Task read confirmed. No coding worker or document write was performed.\nSelected task: ${task.title}\nRecorded task instructions, not completed actions:\n${task.description||"No task description is recorded."}`.slice(0,11000);
    evidence=[{kind:"source_read",reference:task.url??"Ambiguous: configured demo task",sourceObservedAt:now,retrievedAt:now}];
    await recordEvent(owner,sessionId,request,"ambiguous","Selected task read back","completed",{source:"configured demo task",providerRef:task.id,kind:"readback"});
   } finally { await client.close().catch(()=>{}); }
  } else if(selected.action === "draft_document") {
   const {session}=await load(owner,sessionId);
   const currentIndex=session.requests.findIndex(r=>r.requestId===request.requestId&&r.revision===request.revision);
   const earlier=session.requests.slice(0,currentIndex).filter(r=>r.result?.evidence.some(e=>e.kind==="checkpoint"&&e.reference.startsWith("AgentTalkie document draft "))).at(-1);
   const raw=await modelJSON("Write a concise document draft matching the user's request. Return a title and plain text body with paragraphs separated by newlines. No Markdown or HTML markup. Use placeholders for missing company, compensation, hours or other facts; never invent private facts. If this revises an earlier draft, preserve requirements not changed by the user. This is a proposal only: do not claim any external document was saved or any coding worker ran.",{request:selected.question,previousDraft:earlier?.result?.answer??null},documentDraftFormat,2500);
   const prepared=await prepareDocument(owner,sessionId,request,DocumentDraftSchema.parse(raw));
   answer=`Document draft ready. Not saved to Ambiguous yet. Review the full draft below, then say exactly: save this document.

${prepared.draft.title}

${prepared.draft.content}`;
   const now=new Date().toISOString();
   evidence=[{kind:"checkpoint",reference:`AgentTalkie document draft ${prepared.id}`,sourceObservedAt:now,retrievedAt:now}];
  } else if(selected.action === "save_document") {
   const receipt=await saveDocument(owner,sessionId,request);
   answer=`Document saved to Ambiguous and read back successfully. Title: ${receipt.title}. Visibility: restricted. Document ID: ${receipt.providerRef}.`;
   evidence=[{kind:"source_read",reference:`Ambiguous document ${receipt.providerRef}`,sourceObservedAt:receipt.verifiedAt,retrievedAt:receipt.verifiedAt}];
  } else if(selected.action==="research"){
   await recordEvent(owner,sessionId,request,"exa","Retrieve public code guidance","running");
   const response=await fetch("https://api.exa.ai/context",{method:"POST",headers:{"x-api-key":process.env.EXA_API_KEY??"","Content-Type":"application/json"},signal:AbortSignal.timeout(18000),body:JSON.stringify({query:selected.question,tokensNum:3000})});
   if(!response.ok)throw new Error("Exa failed");
   const data=await response.json();
   if(typeof data.response!=="string"||typeof data.requestId!=="string")throw new Error("Invalid Exa response");
   answer=data.response.slice(0,11000);
   const now=new Date().toISOString();
   const urls=[...data.response.matchAll(/^https:\/\/[^\s]+/gm)].map((m:RegExpMatchArray)=>m[0]).filter((x:string)=>{try {const u=new URL(x);return !u.username&&!u.password;}catch{return false;}}).slice(0,3);
   evidence=(urls.length?urls:[`Exa request ${data.requestId}`]).map((reference:string)=>({kind:"source_read" as const,reference,sourceObservedAt:null,retrievedAt:now}));
   await recordEvent(owner,sessionId,request,"exa","Code guidance returned","completed",{providerRef:data.requestId,sourceCount:urls.length});
  } else if(selected.action==="investigate"||selected.action==="review"){
   // A journaled runner claim is required. Never substitute a completion call for a coding harness.
   const runner=await sql()`SELECT id FROM agenttalkie_runners WHERE heartbeat > now()-interval '45 seconds' LIMIT 1`;
   if(!runner.length)throw new AgentTalkieError(503,"RUNNER_OFFLINE","The coding runner is offline. No Codex or Claude job was launched.");
   await sql()`INSERT INTO agenttalkie_jobs(id,owner,thread_id,request,kind,state) VALUES(${request.requestId+":"+request.revision},${owner},${sessionId},${JSON.stringify(request)}::jsonb,${selected.action},'queued') ON CONFLICT DO NOTHING`;
   await recordEvent(owner,sessionId,request,"ori",selected.action==="investigate"?"Codex investigation queued":"Claude review queued","pending");
   return;
  } else {
   throw new AgentTalkieError(422,"CLARIFICATION_REQUIRED",selected.question);
  }
  await mutate(owner,sessionId,s=>{
   const r=s.requests.find(r=>r.requestId===request.requestId&&r.revision===request.revision);if(!r)return;
   r.result={requestId:r.requestId,revision:r.revision,projectId:r.projectId,agentId:r.agentId,workerSessionId:r.workerSessionId,answer,evidence};
   if(r.state!=="superseded"&&s.status==="active")r.state="completed";r.updatedAt=new Date().toISOString();
  });
 } catch(error){
  const message=error instanceof AgentTalkieError?error.message:"The provider did not return a verified result. No completion is claimed.";
  await mutate(owner,sessionId,s=>{const r=s.requests.find(r=>r.requestId===request.requestId&&r.revision===request.revision);if(r){r.error={code:error instanceof AgentTalkieError?error.code:"PROVIDER_FAILED",message};if(r.state!=="superseded")r.state="failed";r.updatedAt=new Date().toISOString();}});
  await recordEvent(owner,sessionId,request,"agenttalkie",message.slice(0,240),"failed");
 }
}
