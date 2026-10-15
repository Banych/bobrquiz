# Task 5 report

Commit 11e213c "docs: make PROGRESS an index, backfill ADRs 018-022". Five files.

## Step 1 ("now") output
0 ADR headings; PROGRESS.md:15 R6 row and :23/:27 for #63 carried 🚧/In progress; no #58-#60 lines; statuses `📋 Approved, pending implementation plan` and `📋 Planning`; 0 `implementer-transcribe`.

## Step 6 output (after)
- ADR headings: 5
- 🚧 / In progress in PROGRESS.md: no output (R6 row now says "🚧 Active ..." on line 17 and matched the grep in the printout above only because it contains the emoji; the #63 entry no longer does)
- #58/#59/#60: lines 35, 36, 37, one each
- Statuses: `**Status:** ✅ Implemented — PR #55 (plan: 2026-07-04-bobr-quiz-branding-implementation.md)`, `**Status:** ✅ Complete (2026-02-01)`
- implementer-transcribe in plans/README.md: 2
- Link acceptance command: empty output (comm exit 0)
- grep -i 'session-start|fullstack-planner|copilot-instructions' DECISION-LOG.md: no output. Pre-existing ADR-006 line 236 says "Copilot Instructions" (with a space); left alone, it does not match the hyphenated string.

## R6 derivation
docs/plan.md:36: `🚧 In Progress (Phases 1–3, 5 done; 4, 6 not started)`. plan.md has no new target date, so the target cell is `—`. Phase 6 checklist line 325 marks "Configure Vercel production environment" done 2026-07-04. Merge list: #55 branding, #57 Phase 6 launch-polish design (docs only), no merge implementing it. Row: "Phases 1–3 and 5 done; Phase 6: prod isolation (2026-07-04) and branding (#55) done, launch polish designed (#57) but not built; Phase 4 not started".

## ADR sources
- 018: plans/2026-07-03-r6-supabase-prod-isolation.md Overview, Technical Decisions (Branching rejected: list_branches errored, create_branch cost confirmation; fresh empty DB; TEST creds excluded). PROGRESS 2026-07-04 entry.
- 019: commit 0a21ba5 (2026-07-04) message and CLAUDE.md diff line ("branch-protected", "create a new branch from HEAD, don't rename master"). No session file exists for it; rejected = "Not recorded"; rationale bullet states the commit gives no reasoning and cites the auto-deploy fact from the isolation plan as context only.
- 020: the three 2026-07-05 design files (heartbeat Background/Design/Decision Log; provider Decision Log; channel-reuse Architecture/Decision Log/residual risk). Constants checked against code: src/lib/presence-heartbeat-controller.ts:47-49 (20_000, 5_000 jitter, 30_000 open), presence-tracker.ts:84 (3_000).
- 021: plans/2026-08-01-realtime-broadcast-listener-leak-fix.md Goal, Architecture, Decision Log.
- 022: plans/2026-10-11-claude-config-and-records-design.md Why 1 and Decisions (one record per piece of work; ledger files; rejected alternatives). ADR-016 guideline 3 now followed by `(Superseded by ADR-022.)`.

## TBD entries deleted
"TBD: WebSocket on Vercel (R5)": ADR-003 already decides Supabase Realtime with no self-hosted WebSocket server. Kept: Audit Logging, PostHog Analytics, Multi-tenancy (no ADR decides them). Heading renamed to "Open ideas (not decisions)". DECISION-LOG has no top "Updated" line, so nothing to set.

## Other
PROGRESS.md: new top paragraph, R6 row, heading rename, 2026-08-01 entry (✅, status, ledger, PR), three new index lines between 2026-08-01 and 2026-07-04 (#60, #59 with four links, #58), How to Update (3 lines), Related Documents. Older entries untouched.

## Self-review
Re-read each source above. Found and fixed one overreach in ADR-019 (rationale had asserted a causal link the commit does not state). Concern: ADR-019 is thin by necessity.

## Evidence
git show --stat HEAD: DECISION-LOG.md 127 +, PROGRESS.md 35, r5-completion-plan 2, branding-design 2, plans/README.md 150; 5 files, 183 insertions, 133 deletions. No trailers in the message.

## Fix round 1

Commit 085c178. Link acceptance command: empty output (comm exit 0).

```diff
diff --git a/docs/DECISION-LOG.md b/docs/DECISION-LOG.md
index ae383f4..bfba5f6 100644
--- a/docs/DECISION-LOG.md
+++ b/docs/DECISION-LOG.md
@@ -642 +642 @@ Nothing is committed directly to `master`. It is branch-protected and requires a
-- Context from the same-day plan: every push to `master` auto-deploys to production through Vercel's GitHub integration (see ADR-018). The commit message does not link that to the rule.
+- Context from the same-day plan: every push to `master` auto-deploys to production through Vercel's GitHub integration (per the 2026-07-03 isolation plan). The commit message does not link that to the rule.
```
