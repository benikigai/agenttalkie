import { z } from "zod";
import { apiFailure, readJson, jsonReply } from "@/lib/server/agenttalkie-http";
import { liveOrigin, liveOwner, sameSecret, issueCookie } from "@/lib/server/agenttalkie-live-auth";
import { AgentTalkieError } from "@/lib/server/agenttalkie-service";
export async function GET(request: Request) { try { liveOwner(request); return jsonReply({ authenticated: true }); } catch { return jsonReply({ authenticated: false }); } }
export async function POST(request: Request) {
  try {
    liveOrigin(request);
    const { password } = z.object({ password: z.string().min(1).max(256) }).strict().parse(await readJson(request, 1000));
    if (!sameSecret(password,process.env.AGENTTALKIE_DEMO_SECRET ?? "")) throw new AgentTalkieError(401,"ACCESS_DENIED","The demo access code did not match.");
    return jsonReply({ authenticated: true },200,{ "Set-Cookie": issueCookie() });
  } catch(error) { return apiFailure(error); }
}
