import { NextResponse, type NextRequest } from "next/server";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

type CsvRow = Record<string, string | undefined>;

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Bad form data: ${String(err)}` },
      { status: 400 },
    );
  }

  const clientName = form.get("client")?.toString().trim();
  const csvFile = form.get("csv");
  const skipLinesRaw = form.get("skipLines")?.toString() ?? "0";
  const fieldsRaw = form.get("fields")?.toString().trim() ?? "";
  const source = form.get("source")?.toString().trim() || null;
  const dryRun = form.get("dryRun")?.toString() === "on";

  if (!clientName) {
    return NextResponse.json({ error: "Missing client name" }, { status: 400 });
  }
  if (!(csvFile instanceof File) || csvFile.size === 0) {
    return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
  }
  const skipLines = Number.parseInt(skipLinesRaw, 10);
  if (!Number.isFinite(skipLines) || skipLines < 0) {
    return NextResponse.json(
      { error: "skipLines must be a non-negative integer" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name")
    .eq("name", clientName)
    .maybeSingle();
  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json(
      { error: `Client not found: "${clientName}". Insert it in Supabase first.` },
      { status: 404 },
    );
  }

  const rawText = await csvFile.text();
  const dropped =
    skipLines > 0
      ? rawText.split(/\r?\n/).slice(skipLines).join("\n")
      : rawText;

  let records: CsvRow[];
  try {
    records = parse(dropped, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `CSV parse failed: ${String(err)}` },
      { status: 400 },
    );
  }

  if (records.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "CSV has no data rows after skipping.",
    });
  }

  const headers = Object.keys(records[0]);
  const hasSimpleShape = headers.includes("raw_input");

  let selectedFields: string[] | null = null;
  if (!hasSimpleShape) {
    if (fieldsRaw) {
      selectedFields = fieldsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const missing = selectedFields.filter((f) => !headers.includes(f));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Fields not found in CSV: ${missing.join(", ")}`,
            availableFields: headers,
          },
          { status: 400 },
        );
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
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  const existingSet = new Set((existingRows ?? []).map((r) => r.raw_input));

  const fresh = withInput.filter((x) => !existingSet.has(x.raw_input));
  const dupes = withInput.length - fresh.length;
  const blank = records.length - withInput.length;
  const preview = fresh
    .slice(0, 3)
    .map((x) =>
      x.raw_input.length > 200 ? x.raw_input.slice(0, 200) + "…" : x.raw_input,
    );

  const summary = {
    client: client.name,
    shape: hasSimpleShape ? "simple" : "rich",
    includedFields: selectedFields,
    totalRows: records.length,
    blank,
    duplicates: dupes,
    new: fresh.length,
    preview,
  };

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, ...summary });
  }

  if (fresh.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      message: "Nothing new to insert",
      ...summary,
    });
  }

  const inserts = fresh.map((x) => ({
    client_id: client.id,
    source:
      (hasSimpleShape ? x.row.source?.toString() : undefined) ?? source ?? null,
    raw_input: x.raw_input,
    status: "new" as const,
  }));

  const { error: insertErr } = await admin.from("leads").insert(inserts);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: inserts.length, ...summary });
}
