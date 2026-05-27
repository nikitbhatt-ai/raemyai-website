import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runAgent } from "@/lib/anthropic";
import { hunterAgent, parseHunterOutput } from "@/lib/agents/hunter";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_CAP = 25;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clients, error } = await getSupabaseAdmin()
    .from("clients")
    .select("id, name, monthly_quota, tasks_this_month")
    .eq("active", true);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  let totalProcessed = 0;
  const summary: Array<{ client: string; processed: number }> = [];

  for (const client of clients ?? []) {
    const remaining = client.monthly_quota - client.tasks_this_month;
    if (remaining <= 0) {
      summary.push({ client: client.name, processed: 0 });
      continue;
    }
    const limit = Math.min(remaining, BATCH_CAP);

    const { data: leads } = await getSupabaseAdmin()
      .from("leads")
      .select("id, raw_input")
      .eq("client_id", client.id)
      .eq("status", "new")
      .limit(limit);

    let processed = 0;
    for (const lead of leads ?? []) {
      try {
        const result = await runAgent({
          agent: hunterAgent,
          input: lead.raw_input,
          clientId: client.id,
          leadId: lead.id,
        });
        const parsed = parseHunterOutput(result.text);
        await getSupabaseAdmin()
          .from("leads")
          .update({
            status: parsed ? (parsed.fit ? "qualified" : "not_fit") : "error",
            fit: parsed?.fit ?? null,
            score: parsed?.score ?? null,
            reason: parsed?.reason ?? null,
            suggested_action: parsed?.suggested_action ?? null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
        processed++;
      } catch (err) {
        await getSupabaseAdmin()
          .from("leads")
          .update({ status: "error", reason: String(err) })
          .eq("id", lead.id);
      }
    }

    if (processed > 0) {
      await getSupabaseAdmin()
        .from("clients")
        .update({ tasks_this_month: client.tasks_this_month + processed })
        .eq("id", client.id);
    }
    totalProcessed += processed;
    summary.push({ client: client.name, processed });
  }

  return NextResponse.json({ ok: true, totalProcessed, summary });
}
