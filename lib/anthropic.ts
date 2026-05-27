import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase";

const claude = new Anthropic();

const PRICES = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-7": { in: 5, out: 25 },
} as const;

export type ModelId = keyof typeof PRICES;

export type AgentDef = {
  id: string;
  name: string;
  model: ModelId;
  maxOutputTokens: number;
  system: string;
  buildPrompt: (input: string) => string;
};

export type AgentResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export async function runAgent(opts: {
  agent: AgentDef;
  input: string;
  clientId: string;
  leadId?: string;
}): Promise<AgentResult> {
  const { agent, input, clientId, leadId } = opts;

  const response = await claude.messages.create({
    model: agent.model,
    max_tokens: agent.maxOutputTokens,
    system: agent.system,
    messages: [{ role: "user", content: agent.buildPrompt(input) }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const { input_tokens, output_tokens } = response.usage;
  const price = PRICES[agent.model];
  const costUsd =
    (input_tokens / 1e6) * price.in + (output_tokens / 1e6) * price.out;

  await supabaseAdmin.from("usage_log").insert({
    client_id: clientId,
    agent_id: agent.id,
    lead_id: leadId ?? null,
    model: agent.model,
    input_tokens,
    output_tokens,
    cost_usd: costUsd,
  });

  return { text, inputTokens: input_tokens, outputTokens: output_tokens, costUsd };
}
