import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { getSupabaseAdmin } from "../supabase";

let _claude: Anthropic | undefined;
function getClaude() {
  if (!_claude) _claude = new Anthropic();
  return _claude;
}

const PRICES = {
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-7": { in: 5, out: 25 },
} as const;

export type ModelId = keyof typeof PRICES;

export type AgentContext = {
  icp: string | null;
};

export type AgentDef<T> = {
  id: string;
  name: string;
  model: ModelId;
  maxOutputTokens: number;
  buildSystem: (ctx: AgentContext) => string;
  buildPrompt: (input: string) => string;
  schema: ZodType<T>;
};

export type CallResult<T> =
  | {
      ok: true;
      data: T;
      rawText: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | {
      ok: false;
      reason: "invalid_output";
      rawText: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      zodError?: string;
    };

export type RunResult<T> =
  | {
      ok: true;
      data: T;
      rawText: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | { ok: false; reason: "quota_exceeded" }
  | { ok: false; reason: "invalid_output"; rawText: string; costUsd: number }
  | { ok: false; reason: "api_error"; error: string };

/**
 * Pure Claude call + Zod validation. No database access.
 * Used by both the production route and the eval harness.
 */
export async function callAgent<T>(opts: {
  agent: AgentDef<T>;
  input: string;
  context?: AgentContext;
}): Promise<CallResult<T>> {
  const { agent, input, context } = opts;
  const ctx: AgentContext = context ?? { icp: null };

  const response = await getClaude().messages.create({
    model: agent.model,
    max_tokens: agent.maxOutputTokens,
    system: agent.buildSystem(ctx),
    messages: [{ role: "user", content: agent.buildPrompt(input) }],
  });

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const { input_tokens, output_tokens } = response.usage;
  const price = PRICES[agent.model];
  const costUsd =
    (input_tokens / 1e6) * price.in + (output_tokens / 1e6) * price.out;

  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return {
      ok: false,
      reason: "invalid_output",
      rawText,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      costUsd,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawText.slice(start, end + 1));
  } catch {
    return {
      ok: false,
      reason: "invalid_output",
      rawText,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      costUsd,
    };
  }
  const parsed = agent.schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_output",
      rawText,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      costUsd,
      zodError: parsed.error.message,
    };
  }
  return {
    ok: true,
    data: parsed.data,
    rawText,
    inputTokens: input_tokens,
    outputTokens: output_tokens,
    costUsd,
  };
}

/**
 * Production wrapper. Enforces per-client monthly quota, fetches client
 * ICP row, calls the agent, and logs every call (including malformed
 * outputs — those cost money too).
 */
export async function runAgent<T>(opts: {
  agent: AgentDef<T>;
  input: string;
  clientId: string;
  leadId?: string;
}): Promise<RunResult<T>> {
  const { agent, input, clientId, leadId } = opts;
  const admin = getSupabaseAdmin();

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("monthly_quota, tasks_this_month")
    .eq("id", clientId)
    .single();
  if (clientErr || !client) {
    return {
      ok: false,
      reason: "api_error",
      error: clientErr?.message ?? "client not found",
    };
  }
  if (client.tasks_this_month >= client.monthly_quota) {
    return { ok: false, reason: "quota_exceeded" };
  }

  const { data: icpRow } = await admin
    .from("icp_profiles")
    .select("description")
    .eq("client_id", clientId)
    .maybeSingle();

  let result: CallResult<T>;
  try {
    result = await callAgent({
      agent,
      input,
      context: { icp: icpRow?.description ?? null },
    });
  } catch (err) {
    return { ok: false, reason: "api_error", error: String(err) };
  }

  await admin.from("usage_log").insert({
    client_id: clientId,
    agent_id: agent.id,
    lead_id: leadId ?? null,
    model: agent.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
  });

  await admin
    .from("clients")
    .update({ tasks_this_month: client.tasks_this_month + 1 })
    .eq("id", clientId);

  if (result.ok) {
    return {
      ok: true,
      data: result.data,
      rawText: result.rawText,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    };
  }
  return {
    ok: false,
    reason: "invalid_output",
    rawText: result.rawText,
    costUsd: result.costUsd,
  };
}
