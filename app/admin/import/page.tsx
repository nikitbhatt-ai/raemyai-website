"use client";

import { useState, useEffect, type FormEvent } from "react";

export default function ImportPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSecret(params.get("secret"));
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!secret) {
      setError("Missing ?secret= in URL");
      return;
    }
    setBusy(true);
    setResult(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/import-leads?secret=${encodeURIComponent(secret)}`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setResult(json);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = {
    maxWidth: 720,
    margin: "40px auto",
    padding: "0 20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#111",
  };
  const label: React.CSSProperties = {
    display: "block",
    marginTop: 16,
    marginBottom: 4,
    fontWeight: 600,
    fontSize: 14,
  };
  const hint: React.CSSProperties = {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: 8,
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 4,
    boxSizing: "border-box",
  };
  const button: React.CSSProperties = {
    marginTop: 20,
    padding: "10px 20px",
    fontSize: 15,
    fontWeight: 600,
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
  };

  if (secret === null) {
    return <div style={wrap}>Loading…</div>;
  }
  if (!secret) {
    return (
      <div style={wrap}>
        <h1>Import leads</h1>
        <p style={{ color: "#b00" }}>
          Missing <code>?secret=</code> in the URL. Add it and reload.
        </p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1>Import leads</h1>
      <p style={{ color: "#666" }}>
        Upload a CSV of prospects. They get inserted into the leads table as
        <code> status="new" </code> so the Hunter cron will qualify them on
        its next run.
      </p>

      <form onSubmit={handleSubmit}>
        <label style={label}>Client name</label>
        <input style={input} name="client" required placeholder="Raemy AI" />
        <div style={hint}>
          Must exactly match a row in the <code>clients</code> table.
        </div>

        <label style={label}>CSV file</label>
        <input style={input} type="file" name="csv" accept=".csv,text/csv" required />

        <label style={label}>Skip lines (before header)</label>
        <input style={input} name="skipLines" defaultValue="0" />
        <div style={hint}>
          If the CSV has title/description rows above the real header, set this
          to skip them. For your Houston med-spas CSV: <code>2</code>.
        </div>

        <label style={label}>Fields to include</label>
        <input
          style={input}
          name="fields"
          placeholder="Business,Type,Area,Rating,Reviews,Signal / notes,Owner / contact name"
        />
        <div style={hint}>
          Comma-separated column names to concatenate into each lead's
          <code> raw_input</code>. Leave blank to include ALL columns. Omit
          columns you don't want Hunter to see (like your own manual "Fit"
          judgment).
        </div>

        <label style={label}>Source tag (optional)</label>
        <input style={input} name="source" placeholder="houston-med-spas" />
        <div style={hint}>
          Written to each lead's <code>source</code> column for your own
          tracking.
        </div>

        <label
          style={{
            ...label,
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          <input type="checkbox" name="dryRun" defaultChecked />
          Dry run (preview only, don't insert)
        </label>

        <button style={button} type="submit" disabled={busy}>
          {busy ? "Working…" : "Upload"}
        </button>
      </form>

      {error && (
        <div
          style={{
            marginTop: 24,
            padding: 12,
            background: "#fee",
            border: "1px solid #f99",
            borderRadius: 4,
            color: "#900",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {result != null && (
        <pre
          style={{
            marginTop: 24,
            padding: 12,
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 4,
            fontSize: 13,
            overflow: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
