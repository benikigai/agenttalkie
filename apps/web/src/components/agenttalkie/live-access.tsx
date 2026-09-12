"use client";
import { useState } from "react";
import { unlockLive } from "@/lib/client/agenttalkie-api";
import { useAgentTalkie } from "./provider";
export function LiveAccess(){
 const workspace=useAgentTalkie();const [open,setOpen]=useState(false);const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 if(workspace.snapshot.session.mode==="live")return null;
 return <div><button className="at-button" onClick={()=>setOpen(!open)}>Unlock live demo</button>{open&&<form style={{position:"absolute",right:16,top:60,zIndex:80,padding:20,background:"var(--at-surface, #fff)",border:"1px solid #ddd",borderRadius:12}} onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await unlockLive(password);setPassword("");await workspace.start("live");setOpen(false);}catch(cause){setError(cause instanceof Error?cause.message:"Could not unlock live demo.");}finally{setBusy(false);}}}><label htmlFor="live-password">Demo access code</label><input id="live-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required style={{display:"block",margin:"12px 0",padding:8}}/><button className="at-button" disabled={busy}>{busy?"Opening…":"Open live workspace"}</button>{error&&<p role="alert">{error}</p>}</form>}</div>;
}
