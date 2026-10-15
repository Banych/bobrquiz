# Icon-only button labels — ledger

Branch `fix/icon-button-labels`, cut from master 93dd6d4, in `.claude/worktrees/fix-icon-button-labels`.
Bounded; design approved in chat (user: "approve", 2026-10-15). Source: the lucide-react 1.x
review (`.superpowers/sdd/2026-10-15-lucide-react-1/progress.md`, Review, minor 3) found five
icon-only controls with no accessible name, on master as well.

## Change (implementer, sonnet; commit bc8ad25)
- `aria-label` on the control, not the svg: `Remove option N` (create and edit question
  dialogs), `Remove image` (image-upload), `Edit question` / `Delete question` (question-list,
  same wording as all-questions-view), `Back to quizzes` (quiz page back link, on the Link).
- E2E page object `e2e/pages/AdminQuizDetailPage.ts`: `editQuestion` and `deleteQuestion` find
  buttons by name (`getByRole('button', { name: 'Edit question', exact: true })`) instead of
  "first/second button with no text". `exact: true` because Playwright's default name match is a
  case-insensitive substring; the 'Delete Question' confirm button lives in a dialog portal,
  outside the row scope.
- No unit test: vitest runs in a node environment with no DOM library. The question CRUD E2E
  tests are the test of the names.
- Implementer's scan: no other unnamed `size="icon"` button or icon-only link in src/
  (media-library and quiz-list controls already labelled). Controller checked the two links it
  flagged (`[quizId]/page.tsx:67,74`): both carry visible text.

## Verification (implementer, in the worktree; re-check counts at review)
- yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 466 passed | 1 skipped (467); exit 0.
- yarn lint: exit 0, 5 problems (0 errors, 5 warnings).
- npx tsc --noEmit -p .: exit 0, 0 errors (covers e2e/).
- yarn build: exit 0 with placeholder env (worktree has no .env.local).
- E2E: pending (controller, against the dev server).

## Review
- task-reviewer on 74748d6: APPROVED, 0 critical, 0 important. Tamper check: HEAD and status of the worktree and the main checkout unchanged.
- Confirmed: the back-link label lands on the rendered <a> (Button asChild → Radix Slot merges props into Link); exact:true locators cannot match the "Delete Question" dialog button (case and portal); no other unnamed icon-only control in src/.
- Minor deferred (out of scope: a visible tooltip is a UI change the approved design did not include): question-list edit/delete buttons lack the title="Edit"/"Delete" tooltips that all-questions-view and quiz-list carry.

## End-to-end (controller, dev server started by the user in this worktree)
- curl / /login /icon-192.png → 200.
- yarn test:e2e: 16 passed, 16 failed, 2 flaky, 4 did not run (1.7m). Failing list vs master baseline: 0 new, 0 fixed, 16 in both.
- The 2 flaky tests: admin-question-crud "should create a multiple-choice question" and "should edit a question". Both failed the first attempt at AdminQuizDetailPage.ts:118 (Create Question dialog still open after 5 s; unchanged code) and passed on retry. They ran 4th and 6th against a freshly started dev server with a new .next (cold Turbopack compile); cause not proven.
- Re-run warm, retries off: `yarn test:e2e e2e/admin-question-crud.spec.ts --retries=0` → 10 passed (11.7s), exit 0, including edit and delete through the new name-based locators.

PR #72 opened with the approved text (user: "approve"); work index line added. Merge waits for the user.
