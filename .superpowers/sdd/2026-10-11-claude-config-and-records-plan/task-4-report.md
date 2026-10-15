# Task 4 report

## Status
DONE

## Commit
1df34c6 docs: archive superseded docs, freeze session log (28 files, moves show as renames; 4 ledger files added; no attribution trailer)

## What I did
Step 1 grep run (matched brief). Moved actions/ and 8 docs into docs/archive/, created archive/README.md, rewrote markdown links, redrew ARCHITECTURE docs tree, fixed ARCHITECTURE:709, replaced status line in archive action 07, froze dev-notes and added sessions/README.md, force-added the 4 listener-leak ledger files, committed.

## Rewritten links (file:line old -> new)
- docs/INDEX.md:48 (brief said 47) (progress/actions/) -> (archive/actions/)
- docs/progress/PROGRESS.md:219 (actions/07-...) -> (../archive/actions/07-...)
- docs/progress/PROGRESS.md:232 (actions/06-...) -> (../archive/actions/06-...)
- docs/progress/PROGRESS.md:~418,~429 (actions/) -> (../archive/actions/)
- sessions/2025-12-20-complete-r4-content-admin.md:224 (../../structure.md) -> (../../archive/structure.md)
- same file:225 (../../03-infrastructure-layer.md) -> (../../archive/03-...)
- sessions/2025-12-20-r4-auth-foundation.md:130,424,499 same 03-infrastructure change
- sessions/2026-01-11-r5-phase2-ui-enhancements.md:130 (docs/progress/actions/07-...) -> (../../archive/actions/07-...)
- docs/ARCHITECTURE.md:709 (PROGRESS.md) -> (progress/PROGRESS.md)

## Checks
- md-link grep (Step 1 | grep '](') output: one line, docs/DECISION-LOG.md:594 `[ARCHITECTURE.md](ARCHITECTURE.md) - Consolidated structure.md + 01-04 steps` -- false positive: the link target is ARCHITECTURE.md; structure.md is plain text (ADR text left as written per ruling).
- link acceptance (comm -13 baseline after): empty. comm -23 (baseline entries gone): `docs/ARCHITECTURE.md -> PROGRESS.md` and `docs/progress/sessions/2026-01-11-r5-phase2-ui-enhancements.md -> docs/progress/actions/07-...` (both fixed).
- git ls-files .superpowers: exactly the four ledger files; .diff/-brief.md count: 0.

## Remaining plain-text hits (outside archive/)
DECISION-LOG.md:579,594,598; plan.md:35; progress/file-ideas.md:13; plans/2026-01-31-r5-completion-plan.md:142; plans/2026-02-01-r5-phase6-final-integration.md:81,189; plans/2026-07-03-r6-supabase-prod-isolation.md:59; sessions/ (2025-11-30-host-mvp-session-targets 6,7,10,14,15,16; 2025-11-30-session-targets 13; 2025-12-05-prisma-adapter-upgrade 11; 2025-12-20-fix-e2e-auth-conflicts 210; complete-r4-content-admin 230 and the link lines 224-225; r4-auth 130,424,499 and phase2 130 are now correct links whose visible text still names old paths); dev-notes.md:97,145,153,228,253. Also INDEX.md:48 and PROGRESS.md:219,232 (link text unchanged, targets fixed). Note: the brief's Files list puts plans/ and file-ideas/plan.md among edit targets, but their hits are plain text, so per ruling 7 they were not changed.

## Concerns
- Inside moved files, relative links may now be stale; the link check showed no new broken entries.
- Status line in archive action 07 kept the `**Status**:` label before the new text.

## Evidence
git show --stat HEAD: 28 files changed, 316 insertions(+), 22 deletions(-); working tree clean after commit.

## Fix round 1
Commit 6dde208 docs: point INDEX progress links at the new records layout. First attempt dropped the heading and left the old actions bullet (off-by-one); caught in the diff and amended before reporting. Link acceptance (comm -13): empty, exit 0.
```diff
diff --git a/docs/INDEX.md b/docs/INDEX.md
index 4e8c078..3470aa8 100644
--- a/docs/INDEX.md
+++ b/docs/INDEX.md
@@ -42,10 +42,11 @@ Welcome! This is your navigation hub for all documentation. Use this to find exa
 - **[guides/MEDIA-UPLOADS.md](guides/MEDIA-UPLOADS.md)** – Image upload feature, Supabase Storage setup
 
 ### Progress Tracking
-- **[PROGRESS.md](progress/PROGRESS.md)** – Index of releases, session notes, completed items
-- **[progress/dev-notes.md](progress/dev-notes.md)** – Execution log, recent changes, current phase
-- **[progress/sessions/](progress/sessions/)** – Dated session notes (manual work, debugging, learnings)
-- **[progress/actions/](archive/actions/)** – Release checklists and feature action items
+- **[progress/PROGRESS.md](progress/PROGRESS.md)** – Index of releases and merged work, one line per piece of work
+- **[progress/plans/](progress/plans/)** – Specs and plans for each piece of work; [README](progress/plans/README.md) has the convention
+- **[progress/findings/](progress/findings/)** – Measured findings (timings, platform behaviour)
+- **[progress/sessions/](progress/sessions/)** and **[progress/dev-notes.md](progress/dev-notes.md)** – Historical, frozen 2026-10-11
+- **[archive/](archive/)** – Superseded docs, including the old release action notes
 
 ### Visual References
 - **[mockups/](mockups/)** – UX mockups and layout references
```
