/**
 * Hunter regression harness.
 *
 * Runs the Hunter agent against every fixture in
 * lib/agents/hunter/evalCases.ts using the pure callAgent() entry
 * point (no Supabase writes, no quota accounting). Reports per-case
 * PASS/FAIL and a summary pass rate.
 *
 * Cost: ~one Haiku call per case (roughly $0.001 each at current
 * prices — a full run of 5 cases is well under a cent).
 *
 * Usage:  npm run eval
 * Requires ANTHROPIC_API_KEY in .env.local (loaded automatically).
 */

import "dotenv/config";
import { callAgent } from "../lib/agents/runAgent";
import { hunterAgent } from "../lib/agents/hunter/prompt";
import { HUNTER_EVAL_CASES, type HunterEvalCase } from "../lib/agents/hunter/evalCases";

type CaseOutcome = {
  name: string;
  pass: boolean;
  reason: string;
  costUsd: number;
};

function judge(
  expected: HunterEvalCase["expected"],
  actual: { fit: boolean; score: number },
): { pass: boolean; reason: string } {
  if (actual.fit !== expected.fit) {
    return {
      pass: false,
      reason: `expected fit=${expected.fit}, got fit=${actual.fit}`,
    };
  }
  if (expected.scoreMin !== undefined && actual.score < expected.scoreMin) {
    return {
      pass: false,
      reason: `score ${actual.score} < expected min ${expected.scoreMin}`,
    };
  }
  if (expected.scoreMax !== undefined && actual.score > expected.scoreMax) {
    return {
      pass: false,
      reason: `score ${actual.score} > expected max ${expected.scoreMax}`,
    };
  }
  return { pass: true, reason: `fit=${actual.fit} score=${actual.score}` };
}

async function runOne(c: HunterEvalCase): Promise<CaseOutcome> {
  const result = await callAgent({
    agent: hunterAgent,
    input: c.input,
    context: { icp: c.icp },
  });
  if (!result.ok) {
    return {
      name: c.name,
      pass: false,
      reason: `invalid_output: ${result.zodError ?? "no JSON found"}`,
      costUsd: result.costUsd,
    };
  }
  const { pass, reason } = judge(c.expected, result.data);
  return { name: c.name, pass, reason, costUsd: result.costUsd };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY (put it in .env.local).");
    process.exit(1);
  }

  console.log(`Running ${HUNTER_EVAL_CASES.length} Hunter eval cases...\n`);

  const outcomes: CaseOutcome[] = [];
  for (const c of HUNTER_EVAL_CASES) {
    const outcome = await runOne(c);
    outcomes.push(outcome);
    const tag = outcome.pass ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${outcome.name} — ${outcome.reason}`);
  }

  const passed = outcomes.filter((o) => o.pass).length;
  const total = outcomes.length;
  const rate = ((passed / total) * 100).toFixed(1);
  const cost = outcomes.reduce((acc, o) => acc + o.costUsd, 0);
  console.log(
    `\n${passed}/${total} passed (${rate}%). Total cost: $${cost.toFixed(5)}`,
  );

  if (passed < total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
