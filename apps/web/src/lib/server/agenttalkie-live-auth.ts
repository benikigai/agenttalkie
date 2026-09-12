import { createHmac, timingSafeEqual } from "node:crypto";
import { AgentTalkieError } from "./agenttalkie-service";
const cookieName = "agenttalkie-live";
function key() {
  const value = process.env.AGENTTALKIE_DEMO_SECRET;
  if (!value || value.length < 32) throw new AgentTalkieError(503,"LIVE_UNCONFIGURED","Live demo access is not configured.");
  return value;
}
function digest(value: string) { return createHmac("sha256", key()).update(value).digest("hex"); }
export function sameSecret(a: string, b: string) { const x=Buffer.from(digest(a)), y=Buffer.from(digest(b)); return timingSafeEqual(x,y); }
export function liveOrigin(request: Request) {
  const url = new URL(request.url); url.host = request.headers.get("host") || url.host;
  const allowed = ["https://agenttalkie.app", "https://www.agenttalkie.app", "https://agenttalkie.vercel.app", "http://127.0.0.1:3100", "http://localhost:3100"];
  if (!allowed.includes(url.origin) || request.headers.get("sec-fetch-site") === "cross-site" || (request.method !== "GET" && request.headers.get("origin") !== url.origin)) throw new AgentTalkieError(403,"ORIGIN_DENIED","Use the AgentTalkie page to access live work.");
}
export function issueCookie() {
  const owner = digest("demo-owner");
  const payload = Buffer.from(JSON.stringify({ owner, expires: Date.now()+4*60*60*1000 })).toString("base64url");
  return `${cookieName}=${payload}.${digest(payload)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400`;
}
export function liveOwner(request: Request) {
  liveOrigin(request);
  const token = request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1) ?? "";
  const [payload,signature] = token.split(".");
  if (token.split(".").length !== 2 || !payload || !signature || !sameSecret(signature,digest(payload))) throw new AgentTalkieError(401,"LIVE_LOGIN_REQUIRED","Unlock the live demo to connect your agents.");
  try { const data = JSON.parse(Buffer.from(payload,"base64url").toString()); if (data.expires > Date.now() && typeof data.owner === "string") return data.owner as string; } catch {}
  throw new AgentTalkieError(401,"LIVE_LOGIN_REQUIRED","Your demo access expired. Unlock it again.");
}
