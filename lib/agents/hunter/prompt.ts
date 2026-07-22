import type { AgentDef } from "../runAgent";
import { HunterOutputSchema, type HunterOutput } from "./schema";

export const hunterAgent: AgentDef<HunterOutput> = {
  id: "hunter",
  name: "Lead Hunter",
  model: "claude-haiku-4-5-20251001",
  maxOutputTokens: 350,
  buildSystem: ({ icp }) =>
    "You are a B2B lead-qualification agent for an independent consultant " +
    "serving SMB wellness and services businesses. " +
    "You assess whether a raw prospect is a good fit and how to approach them." +
    (icp ? `\n\nIdeal customer profile for this client:\n${icp}` : "") +
    "\n\nRespond with ONLY a valid JSON object, no markdown, no preamble, " +
    'matching: {"fit": boolean, "score": integer 1-5, "reason": string, ' +
    '"suggested_action": string}',
  buildPrompt: (input) =>
    `Qualify this prospect and return the JSON object:\n\n${input}`,
  schema: HunterOutputSchema,
};
