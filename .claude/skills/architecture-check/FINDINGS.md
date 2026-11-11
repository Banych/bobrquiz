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

## 2026-11-10 — the new current-user helper imports showed up as violations

**Ran:** architecture-check's Check 2 and the Quick Full Sweep's infrastructure section, run as
written against bobrquiz on feat/quiz-owner (691e0b0), system grep (`command grep`), for the
quiz-owner final-review fix wave
**Kind:** gap
**What the skill said:** the exceptions list and the two `grep -vE` filters skipped only
`factories.ts` and `realtime/broadcast-*`; any other `@infrastructure/` import in `src/app/api/`
printed as a violation
**What happened:** the three admin quiz routes now import `getCurrentUserId` from
`@infrastructure/auth/get-current-user` (`api/admin/quizzes/route.ts:4`,
`api/admin/quizzes/[quizId]/route.ts:4`, `api/admin/quizzes/[quizId]/reset/route.ts:3`). With the
old filters those three lines would print; CLAUDE.md already lists the helper as the fourth
accepted exception. With the filter extended, both commands print nothing (exit 1, no match).
The negative case (a planted non-exception infrastructure import still printing) was not run
this time.
**Why:** the exception was added to CLAUDE.md in part 1 of the quiz-owner work, and the skill was
not updated with it
**Change:** added the helper to the exceptions list and to the filters in Check 2 and the sweep.
The filter matches the closing quote (`get-current-user'`) so other files under `auth/` still print.

## 2026-11-04 — every alias grep missed the `@/` spelling (silent: it reported clean)

**Ran:** architecture-check's Quick Full Sweep, extracted from the body, against bobrquiz at
4d2eb8a (origin/master) and against a planted tree; found by the 2026-11-04 setup audit from
the open issue "The architecture check misses `@/infrastructure` imports" (#104, 2026-10-18)
**Kind:** trap
**What the skill said:** `grep -r "from '@infrastructure/" …` and the same shape for
`@application/`, `@domain/` and `@components/`
**What happened:** `tsconfig.json` also maps `@/*` to `src/*`, so `from '@/infrastructure/…'`
reaches the same module, and the code uses it (`src/app/(admin)/admin/layout.tsx:4`,
`src/app/(admin)/login/page.tsx:5`). Every grep matched only `'@infrastructure/`, so an `@/`
import in a checked layer would have printed nothing, which reads as clean. After the fix,
the planted tree (`@/application` in domain, `@/domain/entities` in a component,
`@/infrastructure` in an application service and an API route, plus `@/`-spelled exceptions
in `factories.ts` and a `broadcast-*` import) printed one line per planted violation and none
for the exceptions; the real tree printed nothing.
**Why:** the patterns were written for one alias spelling; the second alias was added to
`tsconfig.json` without a check of the greps
**Change:** body: every alias pattern is `'@/?<layer>/` under `grep -E` (BRE `\|` became ERE
`|`). Still not covered, as the 2026-10-15 gap entry below says: presentation importing
infrastructure outside `src/app/api/`, where both of the `@/` lines above sit.

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
