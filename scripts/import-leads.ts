/**
 * Bulk import prospects into the leads table for a client.
 *
 * Two supported CSV shapes:
 *
 * 1) Simple shape — a "raw_input" column (and optionally "source"):
 *      raw_input,source
 *      "Sunrise Yoga Studio, Austin TX...",apollo
 *
 * 2) Rich shape — many columns; the script concatenates the ones you
 *    pick into a single raw_input string like
 *    "Business: X | Area: Y | Signal / notes: Z". Use --fields to
 *    pick which columns to include (comma-separated, exact header
 *    names). If --fields is omitted, ALL non-empty columns are used.
 *
 * If your CSV has annotation rows above the real header, use
 * --skip-lines N to skip them.
 *
 * Usage:
 *   npm run import-leads -- --client "Name" --csv ./leads.csv
 *   npm run import-leads -- --client "Name" --csv ./leads.csv --dry-run
 *   npm run import-leads -- --client "Name" --csv ./leads.csv \
 *     --skip-lines 2 --fields "Business,Type,Area,Rating,Reviews,Signal / notes,Owner / contact name" \
 *     --source "houston-med-spas"
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local. Dedupes against existing leads for the same client
 * (by raw_input) so re-running the same CSV is safe.
 */

import "dotenv/config";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "../lib/supabase";

type CsvRow = Record<string, string | undefined>;

async function main() {
  const { values } = parseArgs({
    options: {
      client: { type: "string" },
      csv: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "skip-lines": { type: "string", default: "0" },
      fields: { type: "string" },
      source: { type: "string" },
    },
  });

  if (!values.client || !values.csv) {
    console.error(
      'Usage: npm run import-leads -- --client "<name>" --csv <path> ' +
        "[--skip-lines N] [--fields \"col1,col2,...\"] [--source <str>] [--dry-run]",
    );
    process.exit(1);
  }

  const skipLines = Number.parseInt(values["skip-lines"] ?? "0", 10);
  if (!Number.isFinite(skipLines) || skipLines < 0) {
    console.error("--skip-lines must be a non-negative integer.");
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

  const rawFile = fs.readFileSync(values.csv, "utf-8");
  const dropped =
    skipLines > 0 ? rawFile.split(/\r?\n/).slice(skipLines).join("\n") : rawFile;

  const records: CsvRow[] = parse(dropped, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (records.length === 0) {
    console.log("CSV has no data rows after skipping.");
    return;
  }

  const headers = Object.keys(records[0]);
  const hasSimpleShape = headers.includes("raw_input");

  let selectedFields: string[] | null = null;
  if (!hasSimpleShape) {
    if (values.fields) {
      selectedFields = values.fields.split(",").map((s) => s.trim());
      const missing = selectedFields.filter((f) => !headers.includes(f));
      if (missing.length > 0) {
        console.error(
          `--fields references columns not in CSV: ${missing.join(", ")}`,
        );
        console.error("Available columns:", headers.join(", "));
        process.exit(1);
      }
    } else {
      selectedFields = headers;
    }
  }

  const buildRawInput = (r: CsvRow): string => {
    if (hasSimpleShape) return (r.raw_input ?? "").trim();
    const parts: string[] = [];
    for (const f of selectedFields ?? []) {
      const v = r[f];
      if (v && v.trim().length > 0) parts.push(`${f}: ${v.trim()}`);
    }
    return parts.join(" | ");
  };

  const withInput = records
    .map((r) => ({ row: r, raw_input: buildRawInput(r) }))
    .filter((x) => x.raw_input.length > 0);

  const { data: existingRows, error: existingErr } = await admin
    .from("leads")
    .select("raw_input")
    .eq("client_id", client.id);
  if (existingErr) {
    console.error("DB error listing existing leads:", existingErr.message);
    process.exit(1);
  }
  const existingSet = new Set((existingRows ?? []).map((r) => r.raw_input));

  const fresh = withInput.filter((x) => !existingSet.has(x.raw_input));
  const dupes = withInput.length - fresh.length;
  const blank = records.length - withInput.length;

  console.log(`Client: ${client.name} (${client.id})`);
  console.log(
    `Shape: ${hasSimpleShape ? "simple (raw_input column)" : "rich (concatenated fields)"}`,
  );
  if (!hasSimpleShape && selectedFields) {
    console.log(`Included fields: ${selectedFields.join(", ")}`);
  }
  console.log(
    `CSV rows: ${records.length} total — ${blank} blank/no-input, ` +
      `${dupes} already in DB, ${fresh.length} new`,
  );

  if (fresh.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  console.log("\nFirst 3 new rows:");
  for (const x of fresh.slice(0, 3)) {
    const preview =
      x.raw_input.length > 200 ? x.raw_input.slice(0, 200) + "…" : x.raw_input;
    const src =
      (hasSimpleShape ? x.row.source : undefined) ?? values.source ?? "no-source";
    console.log(`  [${src}] ${preview}`);
  }

  if (values["dry-run"]) {
    console.log("\n[dry-run] no inserts performed.");
    return;
  }

  const inserts = fresh.map((x) => ({
    client_id: client.id,
    source:
      (hasSimpleShape ? x.row.source : undefined) ?? values.source ?? null,
    raw_input: x.raw_input,
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
