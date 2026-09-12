import { createHash } from "node:crypto";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AgentTalkieError } from "./agenttalkie-service";

const validator = new AjvJsonSchemaValidator();
// Account administration and autonomous delegation are outside the workspace tool boundary.
const excluded = /(?:^|_)(?:auth|identity|api_key|credential|secret|token|password|billing|subscription|payment|admin|oauth|webhook|automation|automations|coworker|coworkers|assistant|mcp|permission|permissions|visibility|share|invite|ownership|team|teams|user|users)(?:_|$)/;
export function toolMode(tool: Tool): "read" | "approve" | "blocked" {
  if (["auth_whoami","users_list"].includes(tool.name) && tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint === false) return "read";
  if (excluded.test(tool.name) || !tool.annotations) return "blocked";
  if (tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false && tool.annotations.openWorldHint === false) return "read";
  return "approve";
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const toolHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function validateTool(tool: Tool, args: Record<string, unknown>) {
  if (toolMode(tool) === "blocked") throw new AgentTalkieError(403,"TOOL_NOT_ENABLED","Account administration, sharing and autonomous agents are not enabled through this workspace connector.");
  if (JSON.stringify(args).length > 24000 || !validator.getValidator(tool.inputSchema)(args).valid)
    throw new AgentTalkieError(422,"TOOL_ARGUMENTS_INVALID",`The inputs for ${tool.name} do not match its live schema. No action was taken.`);
  if ("visibility" in args && args.visibility !== "restricted") throw new AgentTalkieError(403,"TOOL_VISIBILITY","New documents must use restricted visibility.");
  if (tool.name === "create_document" || tool.name === "create_sheet") {
    if (args.visibility !== "restricted") throw new AgentTalkieError(422,"TOOL_VISIBILITY","Specify restricted visibility for new documents.");
  }
}
export function scrubResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubResult);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/(?:password|credential|api.?key|access.?token|refresh.?token|authorization|secret)/i.test(k)?"[redacted]":scrubResult(v)]));
  if (typeof value === "string") return value.replace(/\bsk-[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._-]+/gi,"[redacted]");
  return value;
}
export function resultObject(value: unknown): Record<string,unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (typeof v.id === "string") return v;
  for (const key of ["data","document","task","sheet","page","result"]) {
    const found=resultObject(v[key]); if(found) return found;
  }
  return null;
}
export function readbackTool(name: string): string | null {
  if (/document/.test(name)) return "get_document";
  if (/^(?:create|update)_task$/.test(name)) return "get_task";
  if (/sheet/.test(name)) return "get_sheet";
  if (/wiki_page/.test(name)) return "get_wiki_page";
  return null;
}
