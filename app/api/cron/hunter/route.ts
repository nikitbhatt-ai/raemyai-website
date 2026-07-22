import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runAgent } from "@/lib/agents/runAgent";
import { hunterAgent } from "@/lib/agents/hunter/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_CAP = 25;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: clients, error } = await admin
    .from("clients")
    .select("id, name")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary: Array<{
    client: string;
    processed: number;
    errored: number;
    quotaExhausted: boolean;
  }> = [];

  for (const client of clients ?? []) {
    const { data: leads } = await admin
      .from("leads")
      .select("id, raw_input")
      .eq("client_id", client.id)
      .eq("status", "new")
      .limit(BATCH_CAP);

    let processed = 0;
    let errored = 0;
    let quotaExhausted = false;

    for (const lead of leads ?? []) {
      const result = await runAgent({
        agent: hunterAgent,
        input: lead.raw_input,
        clientId: client.id,
        leadId: lead.id,
      });

      if (result.ok) {
        await admin
          .from("leads")
          .update({
            status: result.data.fit ? "qualified" : "not_fit",
            fit: result.data.fit,
            score: result.data.score,
            reason: result.data.reason,
            suggested_action: result.data.suggested_action,
            processed_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
        processed++;
      } else if (result.reason === "quota_exceeded") {
        quotaExhausted = true;
        break;
      } else {
        const errReason =
          result.reason === "invalid_output"
            ? "invalid_output"
            : result.error;
        await admin
          .from("leads")
          .update({
            status: "error",
            reason: errReason,
            processed_at: new Date().toISOString(),
          })
          .eq("id", lead.id);
        errored++;
      }
    }

    summary.push({
      client: client.name,
      processed,
      errored,
      quotaExhausted,
    });
  }

  return NextResponse.json({ ok: true, summary });
}
