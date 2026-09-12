import { AgentTalkieService } from "./agenttalkie-service";
import { fixtureAdapter } from "./agenttalkie-fixture-adapter";
import { createOpenClawAdapter } from "./agenttalkie-adapters";

const runtime = globalThis as typeof globalThis & { agenttalkieService?: AgentTalkieService };
// One local process owns this store. Production needs shared durable state and user auth.
export const agenttalkieService = runtime.agenttalkieService ??= new AgentTalkieService({ adapters: [fixtureAdapter, createOpenClawAdapter()] });
