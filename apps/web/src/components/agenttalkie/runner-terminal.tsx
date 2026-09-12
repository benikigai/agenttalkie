"use client";

import {useEffect,useRef,useState} from "react";
import {z} from "zod";
import {useAgentTalkie} from "./provider";

const responseSchema=z.object({job:z.object({id:z.string(),harness:z.enum(["codex","claude"]),state:z.string(),nativeSessionId:z.string().nullable()}).nullable(),entries:z.array(z.object({sequence:z.number(),text:z.string(),observedAt:z.string()}))});
export function RunnerTerminal(){
 const {snapshot,currentRequest}=useAgentTalkie();
 const [output,setOutput]=useState<z.infer<typeof responseSchema>|null>(null);
 const [unreachable,setUnreachable]=useState(false);
 const screen=useRef<HTMLPreElement>(null);
 const requestState=useRef(currentRequest?.state);requestState.current=currentRequest?.state;
 const sessionId=snapshot.session.id,requestId=currentRequest?.requestId,revision=currentRequest?.revision;
 useEffect(()=>{
  setOutput(null);setUnreachable(false);
  if(!requestId||!revision||snapshot.session.mode!=="live")return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const refresh=async()=>{
   try{
    const response=await fetch(`/api/agenttalkie/live/terminal?sessionId=${sessionId}&requestId=${requestId}&revision=${revision}`,{signal:controller.signal});
    if(!response.ok)throw Error("Output unavailable");
    const parsed=responseSchema.parse(await response.json());
    if(controller.signal.aborted)return;
    setOutput(parsed);setUnreachable(false);
    if(parsed.job ? !["queued","claimed"].includes(parsed.job.state) : requestState.current!=="pending")return;
   }catch{if(!controller.signal.aborted)setUnreachable(true);}
   if(!controller.signal.aborted)timer=setTimeout(()=>void refresh(),1000);
  };
  void refresh();return()=>{controller.abort();clearTimeout(timer);};
 },[sessionId,requestId,revision,snapshot.session.mode]);
 useEffect(()=>{if(screen.current)screen.current.scrollTop=screen.current.scrollHeight;},[output?.entries.length]);
 if(!output?.job)return null;
 const {job,entries}=output;
 return <section aria-label="Live coding terminal" className="at-source-details" style={{margin:"16px 0"}}>
  <div className="at-evidence-head"><p className="at-eyebrow">{job.harness==="codex"?"Codex CLI":"Claude Code CLI"} · Ori · OpenRouter</p><span role="status">{unreachable?"Reconnecting output":job.state}</span></div>
  <p className="at-context-caption">Live CLI output from the runner. This view is read-only.</p>
  <pre ref={screen} tabIndex={0} aria-label="Coding CLI output" style={{background:"#111815",color:"#d9e7dc",padding:16,borderRadius:8,maxHeight:320,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12,lineHeight:1.6}}>{entries.length?entries.map(e=>e.text).join("\n\n"):job.state==="queued"?"Waiting for the Ori runner to claim this job…":"Waiting for native CLI output…"}</pre>
  {job.nativeSessionId&&<p className="at-context-caption">Native session <code>{job.nativeSessionId}</code></p>}
 </section>;
}
