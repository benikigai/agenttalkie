import {z} from "zod";
import {liveOwner} from "@/lib/server/agenttalkie-live-auth";
import {sql} from "@/lib/server/agenttalkie-live-store";
import {apiFailure} from "@/lib/server/agenttalkie-http";
import {artifactCsp} from "@/lib/server/agenttalkie-artifacts";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const owner=liveOwner(request),id=z.uuid().parse((await params).id);
 const rows=await sql()`SELECT html FROM agenttalkie_artifacts WHERE id=${id} AND owner=${owner}`;
 if(!rows[0])return new Response("Artifact not found",{status:404});
 return new Response(rows[0].html,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":artifactCsp,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(), geolocation=()"}});
}catch(error){return apiFailure(error);}}
