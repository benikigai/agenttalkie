"use client";
import {useEffect,useState} from "react";
import {z} from "zod";
import {useAgentTalkie} from "./provider";
const schema=z.object({taskId:z.string().nullable(),artifact:z.object({id:z.string(),url:z.string(),contentHash:z.string(),harness:z.string()}).nullable()});
export function ArtifactPreview(){
 const workspace=useAgentTalkie();
 const {snapshot,currentRequest}=workspace;
 const [data,setData]=useState<z.infer<typeof schema>|null>(null);
 const sessionId=snapshot.session.id;
 useEffect(()=>{setData(null);},[sessionId]);
 useEffect(()=>{
  if(snapshot.session.mode!=="live")return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const refresh=async()=>{
   try{const response=await fetch(`/api/agenttalkie/live/artifact?sessionId=${sessionId}`,{signal:controller.signal});
    if(response.ok){const next=schema.parse(await response.json());if(!controller.signal.aborted)setData(next);}
   }catch{}
   if(!controller.signal.aborted&&currentRequest?.state==="pending")timer=setTimeout(()=>void refresh(),1500);
  };
  void refresh();return()=>{controller.abort();clearTimeout(timer);};
 },[sessionId,currentRequest?.requestId,currentRequest?.revision,currentRequest?.state,snapshot.session.mode]);
 if(!data?.artifact)return null;
 const artifact=data.artifact,pending=currentRequest?.state==="pending";
 return <section aria-label="Playable artifact" className="at-source-details" style={{margin:"16px 0"}}>
  <div className="at-evidence-head"><p className="at-eyebrow">Playable preview · {artifact.harness==="codex"?"Codex":"Claude Code"}</p><a href={artifact.url} target="_blank" rel="noreferrer">Open artifact</a></div>
  <iframe key={artifact.id} src={artifact.url} title="Generated app preview" sandbox="allow-scripts" referrerPolicy="no-referrer" style={{width:"100%",height:520,border:"1px solid #ccc",borderRadius:8,background:"white"}} />
  <p className="at-context-caption">Artifact <code>{artifact.contentHash.slice(0,16)}</code>{pending?" · Current preview stays available while the worker runs.":""}</p>
  <div className="at-actions"><button className="at-button" disabled={pending} onClick={()=>void workspace.sendQuestion("Have Claude Code edit this same playable game: make X green and O red. Preserve two-player turns, win and draw detection, and reset.")}>Make X green and O red</button>
  {data.taskId&&<button className="at-button" disabled={pending} onClick={()=>void workspace.sendQuestion("Update the selected Ambiguous demo task to completed and add the latest playable artifact link to its existing description. Preserve its other details and preview the exact workspace action.")}>Complete task with artifact</button>}</div>
 </section>;
}
