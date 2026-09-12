import { createHash } from "node:crypto";
import { z } from "zod";
import type { WorkerRequest } from "../agenttalkie-contract";
import { AgentTalkieError } from "./agenttalkie-service";
import { load, recordEvent, sql } from "./agenttalkie-live-store";

export const DocumentDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(9000),
}).strict();
export type DocumentDraft = z.infer<typeof DocumentDraftSchema>;
export const documentDraftFormat = {
  type: "object", properties: { title: { type: "string" }, content: { type: "string" } },
  required: ["title", "content"], additionalProperties: false,
};
export function documentHash(draft: DocumentDraft) {
  return createHash("sha256").update(JSON.stringify([draft.title, draft.content, "restricted"])).digest("hex");
}
export function documentBody(content: string) {
  return JSON.stringify({ type: "doc", content: content.split("\n").map(line => ({
    type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}),
  })) });
}
function documentText(content: string) {
  const text = z.object({ type: z.literal("text"), text: z.string() });
  const paragraph = z.object({ type: z.literal("paragraph"), content: z.array(text).optional() });
  const doc = z.object({ type: z.literal("doc"), content: z.array(paragraph) }).parse(JSON.parse(content));
  return doc.content.map(p => p.content?.map(t => t.text).join("") ?? "").join("\n");
}
const providerDocument = z.object({
  id: z.uuid(), type: z.literal("doc"), title: z.string(), content: z.string(),
  visibility: z.string(), import_warnings: z.array(z.string()).optional(),
});
export class AmbiguousDocuments {
  constructor(private apiKey = process.env.AMBIGUOUS_API_KEY, private transport: typeof fetch = fetch) {}
  private async call(path: string, body?: unknown) {
    if (!this.apiKey) throw new AgentTalkieError(503, "DOCUMENTS_UNCONFIGURED", "Ambiguous document access is not configured.");
    const response = await this.transport(`https://app.ambiguous.ai/api/documents${path}`, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(18000),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "API-Version": "1" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new AgentTalkieError(502, "DOCUMENT_PROVIDER_REJECTED", `Ambiguous document access returned HTTP ${response.status}. No saved document is confirmed.`);
    return response.json();
  }
  async create(draft: DocumentDraft, operationId: string) {
    const result = await this.call("", { type: "doc", title: draft.title, content: documentBody(draft.content), visibility: "restricted", labels: [`agenttalkie:${operationId}`] });
    // Persist the provider ID before checking content so a failed readback can be reconciled.
    return z.object({ id: z.uuid() }).parse(result).id;
  }
  async verify(id: string, draft: DocumentDraft) {
    const doc = providerDocument.parse(await this.call(`/${z.uuid().parse(id)}`));
    if (doc.id !== id || doc.title !== draft.title || doc.visibility !== "restricted" || doc.import_warnings?.length || documentText(doc.content) !== draft.content)
      throw new AgentTalkieError(502, "DOCUMENT_READBACK_MISMATCH", "Ambiguous returned a document, but its content or visibility did not match the approved draft. Check Activity; no duplicate was created.");
    return { providerRef: doc.id, title: doc.title, verifiedAt: new Date().toISOString() };
  }
}

export async function prepareDocument(owner: string, sessionId: string, request: WorkerRequest, raw: unknown) {
  const draft = DocumentDraftSchema.parse(raw);
  const id = `${request.requestId}:${request.revision}`;
  const hash = documentHash(draft);
  await sql()`INSERT INTO agenttalkie_documents(id,owner,thread_id,request_id,revision,draft,content_hash,state)
    VALUES(${id},${owner},${sessionId},${request.requestId},${request.revision},${JSON.stringify(draft)}::jsonb,${hash},'prepared') ON CONFLICT DO NOTHING`;
  await recordEvent(owner, sessionId, request, "agenttalkie", "Document draft ready for approval", "completed", { draftId: id, contentHash: hash, kind: "proposed_action" });
  return { draft, id };
}

export async function saveDocument(owner: string, sessionId: string, request: WorkerRequest, provider = new AmbiguousDocuments()) {
  const { session } = await load(owner, sessionId);
  const index = session.requests.findIndex(r => r.requestId === request.requestId && r.revision === request.revision);
  const previous = session.requests[index - 1];
  if (!previous || session.status !== "active" || session.activeRequestId !== request.requestId || session.activeRevision !== request.revision)
    throw new AgentTalkieError(409, "DOCUMENT_APPROVAL_REQUIRED", "First ask for a document draft, review it in the dashboard, then say exactly: save this document.");
  const rows = await sql()`SELECT * FROM agenttalkie_documents WHERE owner=${owner} AND thread_id=${sessionId}
    AND (id=${previous.requestId + ":" + previous.revision} OR save_request=${previous.requestId + ":" + previous.revision}) LIMIT 1`;
  const row = rows[0];
  if (!row) throw new AgentTalkieError(409, "DOCUMENT_APPROVAL_REQUIRED", "There is no current document draft to approve. Ask for the document draft first.");
  if (row.state === "saved") return row.receipt as { providerRef: string; title: string; verifiedAt: string };
  if (row.state !== "prepared") throw new AgentTalkieError(409, "DOCUMENT_SAVE_UNCONFIRMED", "This document save was already attempted. Its outcome is unconfirmed. Check Activity before creating another draft.");
  if (!previous.result?.evidence.some(e => e.kind === "checkpoint" && e.reference === `AgentTalkie document draft ${row.id}`))
    throw new AgentTalkieError(409, "DOCUMENT_PREVIEW_REQUIRED", "The draft has not finished. Wait for the full preview before approving it.");
  const draft = DocumentDraftSchema.parse(row.draft);
  const saveRequest = `${request.requestId}:${request.revision}`;
  // The persisted claim binds approval to exact draft bytes and the current thread revision.
  const claimed = await sql()`UPDATE agenttalkie_documents d SET state='saving',save_request=${saveRequest},updated_at=now()
    FROM agenttalkie_threads t WHERE d.id=${row.id} AND d.owner=${owner} AND d.state='prepared' AND d.content_hash=${documentHash(draft)}
    AND t.id=d.thread_id AND t.owner=d.owner AND t.data->>'status'='active'
    AND t.data->>'activeRequestId'=${request.requestId} AND (t.data->>'activeRevision')::integer=${request.revision} RETURNING d.id`;
  if (!claimed.length) throw new AgentTalkieError(409, "DOCUMENT_APPROVAL_STALE", "The draft or conversation changed. Review the current draft before saving.");
  let providerRef: string | null = null;
  try {
    await recordEvent(owner, sessionId, request, "agenttalkie", "Exact document draft approved", "completed", { draftId: row.id, contentHash: row.content_hash, kind: "approval" });
    await recordEvent(owner, sessionId, request, "ambiguous", "Create approved restricted document", "running", { draftId: row.id, kind: "write_attempt" });
    providerRef = await provider.create(draft, row.id);
    await sql()`UPDATE agenttalkie_documents SET provider_ref=${providerRef},updated_at=now() WHERE id=${row.id} AND owner=${owner}`;
    const receipt = await provider.verify(providerRef, draft);
    await sql()`UPDATE agenttalkie_documents SET state='saved',receipt=${JSON.stringify(receipt)}::jsonb,updated_at=now() WHERE id=${row.id} AND owner=${owner}`;
    await recordEvent(owner, sessionId, request, "ambiguous", "Document saved and read back", "completed", { providerRef, draftId: row.id, kind: "readback" });
    return receipt;
  } catch (error) {
    await sql()`UPDATE agenttalkie_documents SET state='unknown',updated_at=now() WHERE id=${row.id} AND owner=${owner} AND state='saving'`;
    await recordEvent(owner, sessionId, request, "ambiguous", "Document save could not be verified", "failed", { ...(providerRef ? { providerRef } : {}), draftId: row.id });
    if (error instanceof AgentTalkieError) throw error;
    throw new AgentTalkieError(502, "DOCUMENT_SAVE_UNKNOWN", "The document save could not be verified. No retry was sent. Check Activity before trying again.");
  }
}
