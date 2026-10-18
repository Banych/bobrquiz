# architecture-check — findings

One entry per run that taught something, newest first, append-only (supersede by appending a
dated note). Rules: `~/.claude/rules/skill-writing.md`.

Entry shape:

    ## <date> — <one-line summary>

    **Ran:** <skill> against <target>
    **Kind:** trap | gap | confirmation | refutation | friction
    **What the skill said:** <the instruction that was followed>
    **What happened:** <the observed result>
    **Why:** <the mechanism, or "unknown">
    **Change:** <what was edited in the body, or "none — recorded only">

## 2026-10-15 — the Quick Full Sweep printed CLEAN for a path it never searched

**Ran:** architecture-check, by hand, against bobrquiz at 039249c (whole `src/`)
**Kind:** trap
**What the skill said:** `grep -rn "from '@prisma/client'" src/ 2>/dev/null || echo "CLEAN"`,
the same shape for every sweep section.
**What happened:** pointed at `src/nonexistent/`, it printed `CLEAN`; grep exited 2.
**Why:** grep exits non-zero both for "no match" (1) and for an error (2), `|| echo "CLEAN"`
treats them alike, and `2>/dev/null` hides the error line.
**Change:** the sweep keeps stderr and no longer prints CLEAN; an empty section is clean, and a
`No such file or directory` line marks a check that did not run. Re-run with `src/domain/`
missing: the error line appeared under its heading, with both the bundled and the system grep.

## 2026-10-15 — infrastructure imports outside API routes are never checked

**Ran:** architecture-check against bobrquiz at 039249c, by the review of the 48-hits fix
**Kind:** gap
**What the skill said:** "Presentation → MUST NOT import … infrastructure directly", but Check 2
and the sweep grep `@infrastructure/` in `src/app/api/` only.
**What happened:** `command grep -rn "from '@infrastructure/" src/app src/components src/hooks`
outside `src/app/api/` finds 8 lines in 6 files: `src/app/providers.tsx` (3, realtime),
`src/components/admin/{media-library,create-question-dialog,edit-question-dialog}.tsx`
(storage), `src/hooks/use-presence.tsx` and `src/hooks/use-realtime-client.tsx` (realtime). No
check reports them.
**Why:** the checks were written for API routes; unknown whether the narrower scope was
deliberate.
**Change:** none yet. Listed under Assumed; whether these are violations or accepted patterns
waits for the user's call.

2026-10-15 note: ruled. All 8 are violations, to be fixed in code: the realtime interfaces move
to the application layer and the admin storage calls move behind API routes. `providers.tsx`
stays an exception as the browser's composition root. The checks get extended in that work.
Checking the storage side found the policies open to any signed-in user
(`docs/progress/findings/2026-10-15-storage-policies-any-user.md`).

## 2026-10-15 — 48 hits on a clean tree, all accepted exceptions

**Ran:** architecture-check, by hand, Checks 1-7 against bobrquiz at 039249c (whole `src/`)
**Kind:** refutation
**What the skill said:** Checks 2, 4 and 6 expect no results; any output is a violation.
**What happened:** Check 2 reported 11 API routes importing
`@infrastructure/realtime/broadcast-*`, Check 4 reported 6 imports in
`src/application/services/factories.ts`, and Check 6 reported 31 `any` lines, all in the generated
Prisma client. Checks 1-6 were otherwise empty. Check 7's API-route grep was empty, and its
`src/app/` `.tsx` grep found one line, `src/app/(admin)/admin/quizzes/[quizId]/page.tsx:21`. That
is a `'use client'` page reading `useParams()`, not a route param (the first run skipped this grep;
the review caught it). The user ruled the broadcaster imports an accepted
pattern (ADR-024); `factories.ts` is the composition root CLAUDE.md already exempts.
**Why:** the greps had no exclusions for the composition root, the broadcasters or generated code.
**Change:** an "Accepted exceptions" list under the layer rules; Checks 2, 4, 6 and the sweep skip
them. Check 7 notes that a `useParams()` hit in a client page is fine. Re-run: empty on the real tree; planted violations beside each exception still reported.
