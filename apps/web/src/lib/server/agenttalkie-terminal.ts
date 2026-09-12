import { z } from "zod";

export const terminalEntrySchema=z.object({sequence:z.number().int().min(1).max(200),text:z.string().min(1).max(4000)}).strict();
export function redactTerminal(text:string) {
 return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"")
  .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+)/gi,"[credential redacted]")
  .replace(/op:\/\/[^\s"']+/g,"[secret reference redacted]")
  .replace(/\/Users\/[^\s"']+/g,"[local path redacted]");
}
