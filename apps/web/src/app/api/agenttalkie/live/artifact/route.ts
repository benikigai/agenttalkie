import {z} from "zod";
import {liveOwner} from "@/lib/server/agenttalkie-live-auth";
import {load} from "@/lib/server/agenttalkie-live-store";
import {apiFailure,jsonReply} from "@/lib/server/agenttalkie-http";
import {demoContext} from "@/lib/server/agenttalkie-artifacts";
export async function GET(request:Request){try{
 const owner=liveOwner(request),id=z.uuid().parse(new URL(request.url).searchParams.get("sessionId"));
 await load(owner,id);
 return jsonReply(await demoContext(owner,id));
}catch(error){return apiFailure(error);}}
