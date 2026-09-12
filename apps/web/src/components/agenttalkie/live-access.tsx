"use client";
import { useState } from "react";
import { unlockLive } from "@/lib/client/agenttalkie-api";
import { useAgentTalkie } from "./provider";
export function LiveAccess(){
 const workspace=useAgentTalkie();const [open,setOpen]=useState(false);const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 if(workspace.snapshot.session.mode==="live")return null;
 return <div><button className="at-button" onClick={()=>setOpen(!open)}>Unlock live demo</button>{open&&<form className="at-unlock" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await unlockLive(password);setPassword("");await workspace.start("live");setOpen(false);}catch(cause){setError(cause instanceof Error?cause.message:"Could not unlock live demo.");}finally{setBusy(false);}}}><label className="at-eyebrow" htmlFor="live-password">Demo access code</label><input id="live-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required className="at-unlock-input"/><button className="at-button at-button-primary" disabled={busy}>{busy?"Opening…":"Open live workspace"}</button>{error&&<p className="at-unlock-error" role="alert">{error}</p>}</form>}</div>;
}
