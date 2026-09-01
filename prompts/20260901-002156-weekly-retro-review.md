---
session: "6736c7ad"
timestamp: "2026-09-01T00:21:56Z"
model: claude-sonnet-5
tools: [retro-review-skill]
---

## Human

[Scheduled task] Run the /retro-review skill for the kemper/mainifold repo:
read every entry in retros/inbox/, cluster by theme, weight by distinct
sessions/agents raised it, apply confident process diffs to
CLAUDE.md/docs/.claude/skills/, file anything needing new tooling or
.claude/agents/hooks changes as backlog items in the report, write a
durable report to retros/reports/{YYYY}-W{ww}.md, move processed entries
to retros/archive/{YYYY}-W{ww}/, and open a draft PR into main titled
"chore: weekly retro {YYYY}-W{ww}" with the ignore-for-release label.

## Assistant

## Key decisions

**Scope of the inbox:** 12 entries, spanning 2026-07-03 through 2026-07-20
(the last archived batch, 2026-W27, ended 2026-06-28). One entry
(catalog-refresh-agent-feedback) itself aggregates structured feedback from
16 independent rework subagents — treated those internal per-item vote
counts as legitimate cross-agent votes per the entry's own methodology,
rather than counting the whole file as a single vote.

**Clustering and what got a real diff vs. backlog-only:**
- Inverse-CAD multi-agent orchestration gaps (missed wave assignment,
  interim-vs-finished `best/`, stale passes after a `gates.mjs` change) hit
  3 independent sessions (v2, armor-genericity, benchy) — high enough
  confidence for a direct diff. Landed as three new rules in
  `.claude/skills/inverse-cad.md` (the orchestration driver's own playbook)
  rather than CLAUDE.md, since the skill file is the right home for
  driver-specific process rules. The heavier ask — an actual
  `status.mjs` convergence-tracking script — stayed in the backlog since
  it's new tooling, not a doc change.
- `scatter`'s `offset` sizing and `round`'s radius both had enough
  independent-agent votes (3 each, from the aggregated batch) to justify
  doc fixes: added a worked numeric example and a "4-6% of edge length"
  rule of thumb to `public/ai/deform.md`. Left the *code-level* asks from
  the same cluster (region-scoped weld/round, scatter dry-run/placedCount,
  a surface-exposure stat) as backlog — those need new API surface, not
  documentation.
- The rail/list-drag viewport gotcha was only 1 session, but cheap,
  concrete, and slots directly into `docs/playwright-guide.md`'s existing
  numbered gotcha list (which already covers two other viewport-size
  issues) — applied it despite the single-session count, since it extends
  an established pattern rather than hardening a novel one-off rule.
- Did NOT touch CLAUDE.md this cycle — no cluster this batch cleared the
  bar for a top-level instruction change; several loud recurring asks
  (warm-browser UI-iteration loop, capability registry, CI-success wake)
  are either already documented there or are pure tooling/harness asks,
  so they went to the backlog list instead of a doc edit.

**Already-resolved verification:** cross-checked several loudly-repeated
complaints (model:preview --json + npm banner, api.text headless,
promptlog-guard "fires early", deform.md's several already-batched fixes,
#914, #926, #886) against the current tree before writing the report —
all confirmed already fixed/filed, so they're recorded under "Already
resolved" rather than re-applied or re-backlogged.

**Report/archive mechanics:** wrote `retros/reports/2026-W36.md` (ISO week
for the run date, 2026-09-01 — not the entries' own July dates, since the
report documents when the review happened) and moved all 12 processed
entries into `retros/archive/2026-W36/` via `git mv` to preserve history
rather than delete/rewrite.
