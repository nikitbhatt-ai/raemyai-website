import type { AgentDef } from "../anthropic";

export const hunterAgent: AgentDef = {
  id: "hunter",
  name: "Lead Hunter",
  model: "claude-haiku-4-5-20251001",
  maxOutputTokens: 350,
  system:
    "You are a B2B lead-qualification agent for an independent consultant. " +
    "You assess whether a raw prospect is a good fit and how to approach them. " +
    "Respond with ONLY a valid JSON object, no markdown, no preamble, matching: " +
    '{"fit": boolean, "score": number (1-5), "reason": string, "suggested_action": string}',
  buildPrompt: (input) =>
    `Qualify this prospect and return the JSON object:\n\n${input}`,
};

export type HunterOutput = {
  fit: boolean;
  score: number;
  reason: string;
  suggested_action: string;
};

export function parseHunterOutput(text: string): HunterOutput | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(text.slice(start, end + 1));
    if (typeof obj.fit !== "boolean") return null;
    return {
      fit: obj.fit,
      score: Number(obj.score) || 0,
      reason: String(obj.reason ?? ""),
      suggested_action: String(obj.suggested_action ?? ""),
    };
  } catch {
    return null;
  }
}
