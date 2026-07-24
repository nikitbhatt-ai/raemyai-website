/**
 * Bulk import prospects into the leads table for a client.
 *
 * CSV format (header row required):
 *   raw_input,source
 *   "Sunrise Yoga Studio, Austin TX...",apollo
 *   "Kinetic PT, Denver metro...",linkedin
 *
 * The "source" column is optional. Any other columns are ignored.
 *
 * Usage:
 *   npm run import-leads -- --client "Client Name" --csv ./leads.csv
 *   npm run import-leads -- --client "Client Name" --csv ./leads.csv --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local. Dedupes against existing leads for the same client
 * (by raw_input), so re-running the same CSV is safe.
 */

import "dotenv/config";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "../lib/supabase";

type CsvRow = { raw_input?: string; source?: string; [k: string]: string | undefined };

async function main() {
  const { values } = parseArgs({
    options: {
      client: { type: "string" },
      csv: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  if (!values.client || !values.csv) {
    console.error(
      'Usage: npm run import-leads -- --client "<name>" --csv <path> [--dry-run]',
    );
    process.exit(1);
  }

  const admin = getSupabaseAdmin();

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name")
    .eq("name", values.client)
    .maybeSingle();
  if (clientErr) {
    console.error("DB error looking up client:", clientErr.message);
    process.exit(1);
  }
  if (!client) {
    console.error(
      `Client not found: "${values.client}". Insert it in the clients table first.`,
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(values.csv, "utf-8");
  const records: CsvRow[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    console.log("CSV has no rows.");
    return;
  }
  if (!("raw_input" in records[0])) {
    console.error(
      'CSV must have a "raw_input" column (and optionally a "source" column).',
    );
    console.error("Found columns:", Object.keys(records[0]).join(", "));
    process.exit(1);
  }

  const { data: existingRows, error: existingErr } = await admin
    .from("leads")
    .select("raw_input")
    .eq("client_id", client.id);
  if (existingErr) {
    console.error("DB error listing existing leads:", existingErr.message);
    process.exit(1);
  }
  const existingSet = new Set((existingRows ?? []).map((r) => r.raw_input));

  const withInput = records.filter(
    (r): r is Required<Pick<CsvRow, "raw_input">> & CsvRow =>
      typeof r.raw_input === "string" && r.raw_input.length > 0,
  );
  const fresh = withInput.filter((r) => !existingSet.has(r.raw_input));
  const dupes = withInput.length - fresh.length;
  const blank = records.length - withInput.length;

  console.log(`Client: ${client.name} (${client.id})`);
  console.log(
    `CSV rows: ${records.length} total — ${blank} blank/no-input, ` +
      `${dupes} already in DB, ${fresh.length} new`,
  );

  if (fresh.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  console.log("\nFirst 3 new rows:");
  for (const r of fresh.slice(0, 3)) {
    const preview =
      r.raw_input.length > 120 ? r.raw_input.slice(0, 120) + "…" : r.raw_input;
    console.log(`  [${r.source ?? "no-source"}] ${preview}`);
  }

  if (values["dry-run"]) {
    console.log("\n[dry-run] no inserts performed.");
    return;
  }

  const inserts = fresh.map((r) => ({
    client_id: client.id,
    source: r.source ?? null,
    raw_input: r.raw_input,
    status: "new" as const,
  }));

  const { error: insertErr } = await admin.from("leads").insert(inserts);
  if (insertErr) {
    console.error("Insert failed:", insertErr.message);
    process.exit(1);
  }

  console.log(`\nInserted ${inserts.length} new lead(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
