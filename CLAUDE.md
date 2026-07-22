# raemy ai

AI agent platform for SMB wellness and services businesses. Always SMB, never enterprise.

## Stack (locked, do not propose alternatives)

TypeScript, Next.js App Router, Supabase (Postgres is the sole system of record), Vercel, Anthropic SDK called directly. No automation platforms, no agent frameworks, no ORM layer on top of the Supabase client.

## Working with me

I am new to coding. When you make a change, explain what the code does in plain language, not just what you changed. Name the concept when you use one for the first time (worktree, migration, environment variable, upsert) rather than assuming I know it.

Do not add dependencies without telling me what the package does and why the alternative of writing it myself is worse.

If I ask for something that will not work, say so before building it.

## Hard rules

- Never commit `.env.local` or any file containing real API keys. If `git status` ever shows one staged, stop and tell me.
- Never write secrets into `.claude/launch.json` or `vercel.json`. Both are committed.
- Run `npm run eval` before AND after any change to `lib/agents/hunter/prompt.ts`. Report both pass rates. If the rate drops, revert rather than reasoning about why it might be fine.
- Never loosen a Zod schema to make a validation error disappear. Fix the prompt.
- Ask before running anything that costs money against a live API in a loop.

## Architecture rules

- Agents contain only their own logic. Quota checks, run records, and usage logging belong in `lib/agents/runAgent.ts`. If you find yourself writing quota code inside an agent, that is a signal it belongs in the shared engine.
- An agent is a loop only if its steps are genuinely unpredictable. Hunter is a fixed pipeline with one LLM call per candidate, on purpose. Do not convert it to a tool-use loop.
- Client-specific targeting lives in database rows (`icp_profiles`), not in code. Onboarding a new client should never require a deploy.
- Every Claude call logs usage. Rejected leads cost money too and must be logged.

## Commands

```bash
npm run dev         # local dev server
npm run eval        # Hunter regression harness, no DB writes, costs a few cents
npm run typecheck   # tsc --noEmit
```

Trigger a Hunter run locally: `curl "http://localhost:3000/api/cron/hunter?secret=$CRON_SECRET"`

## Current state

Hunter is the only agent built. Six more planned (Regulator, Specialist, Nurturer, Closer, Analyst, Amplifier) but do not scaffold them until Hunter has produced leads that converted to real conversations.
