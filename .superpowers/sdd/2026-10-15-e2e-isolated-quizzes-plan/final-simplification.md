# Final simplification report (report only, nothing applied)

Range e39a9e0..23140ab. Read: spec, plan, ledger, CLAUDE.md, the changed source, tests, e2e files.
`yarn lint`: 0 errors, 5 warnings (not in the changed files I read; not investigated). `yarn test:run` not re-run: no code was changed.

Ranked by value.

## P1. Reconnection spec: drop 3 of 5 tests, strengthen the 2 that stay (the Task 3 deferred item)

File: `e2e/player-reconnection.spec.ts:56-153`.

Overlap (each test = join + offline/online event + assertions):
- :56 "offline banner" asserts banner, "trying to reconnect", textbox disabled, button disabled.
- :100 "disable answer submission while offline" asserts only textbox disabled + button disabled. Strict subset of :56.
- :80 "auto-reconnect" asserts banner gone, textbox enabled, "send answer" button visible.
- :117 "reconnecting state during sync" asserts offline banner, then online, textbox enabled. Strict subset of :80, and its title promises a "reconnecting state" that it never asserts.
- :132 "re-enable the answer box" asserts initial enabled, banner, online, banner gone, textbox enabled. Strict subset of :80 plus the initial-enabled check.

Edit: delete the tests at :100-115, :117-130 and :132-153. Add the one assertion that only :132 had (initial enabled) to :80:

```ts
// before (:80-83)
test('should auto-reconnect when network returns', async ({ page }) => {
  await joinAsPlayer(page, quiz);

  await setOnline(page, false);
// after
test('should auto-reconnect when network returns', async ({ page }) => {
  await joinAsPlayer(page, quiz);
  await expect(
    page.getByRole('textbox', { name: /type your answer/i })
  ).toBeEnabled();

  await setOnline(page, false);
```
Keep :56 unchanged (it already contains :100's assertions), keep the file header comment. Result: 2 tests, nothing asserted is lost.

Why: 3 fewer quiz creations and 3 fewer UI joins per run. The join limit is 10 per 60 s per IP (the ledger records the 429 flakes this caused), so this also lowers flake risk. -60 lines.
Risk: none for behaviour; coverage is identical because every dropped assertion is repeated in a kept test. This overrides the spec's "keep the five existing tests" (premise recorded in the ledger as reopenable): record that in the ledger when applied.
Tests must change: this is the test change. Run `yarn test:e2e e2e/player-reconnection.spec.ts` after (not run here).

## P2. Reconnection spec: stop clearing localStorage

`e2e/player-reconnection.spec.ts:51-53` (and `e2e/player-join.spec.ts:10-13`):

```ts
// before
test.beforeEach(async ({ page, createQuiz }) => {
  quiz = await createQuiz({ ... });
  // Clear localStorage to start fresh
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});
// after
test.beforeEach(async ({ createQuiz }) => {
  quiz = await createQuiz({ ... });
});
```
Why: Playwright gives every test a fresh browser context, and the storage state file holds admin auth only, so the player-session key is already empty. The clear costs a page load per test (and in player-join the whole beforeEach disappears; the "resume session" test sets its own key).
Risk: low, but I could not verify that `playwright/.auth/user.json` carries no `quiz-game-player-session` origin entry (I did not read it, it is a git-ignored auth file). Check with `grep -c quiz-game-player-session playwright/.auth/user.json` first. If 0, apply.
Tests must change: no.

## P3. Dead code in the fixture module

`e2e/support/quiz-fixtures.ts`:
- `QUESTIONS.trueFalse` (:38-42) has no user. `QuestionSeed.points` (:17) has no user. Delete both, or keep if the next specs are expected to use them (YAGNI says delete).
- `BASE_URL`, `ADMIN_STORAGE_STATE`, `STALE_FIXTURE_AGE_MS` are exported but only used inside the file (`FIXTURE_TITLE_PREFIX` is used by two specs, keep that export). Drop the `export` on those three.

Risk: none. Tests: none.

## P4. One path constant for the admin auth file

The string `'playwright/.auth/user.json'` appears in `playwright.config.ts:45`, `e2e/auth.setup.ts:9`, `e2e/admin-quiz-crud.spec.ts:18` and as `ADMIN_STORAGE_STATE` in the fixture. Same for `http://localhost:3000` (config :22 and :53, fixture `BASE_URL`, `pages/*.ts:48`, `admin-auth.spec.ts` x many, several of them pre-existing).

Edit: move the two constants to a new tiny `e2e/support/env.ts` (no `@playwright/test` import) and import them in the config, `auth.setup.ts`, `admin-quiz-crud.spec.ts` and the fixture:
```ts
// admin-quiz-crud.spec.ts:17-19  before
const context = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
// after
const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
```
Why: the fixture's `createAdminApi` silently breaks if someone renames the auth file in one place. Value is moderate; only the first two (auth file in config + setup + fixture) are part of this branch's diff, so restrict to those if you want to keep the diff to the change. Leave the pre-existing `localhost:3000` literals in admin-auth and the page objects alone.
Risk: low. Tests: none.

## P5. Repeated error-to-message conversion in the fixture

`e2e/support/quiz-fixtures.ts:115-117`, `:165`, `:209-211` each spell `error instanceof Error ? error.message : <error|String(error)>`, and the two AggregateError builders (:169-174, :205-212) share a shape.

```ts
// add
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
// :113-119 after
await deleteTestQuiz(api, id).catch((cleanupError: unknown) => {
  console.warn(`[FIXTURE] cleanup of quiz ${id} failed: ${errorMessage(cleanupError)}`);
});
// :164-166 after
errors.push(`${quiz.id}: ${errorMessage(error)}`);
// :208-210 after
`fixture teardown failed for ${errors.length} quiz(zes): ${errors.map(errorMessage).join('; ')}`
```
Why: removes three inline ternaries (one differs subtly, `cleanupError` vs `String(error)`, so behaviour for non-Error throws becomes uniform). Risk: negligible, only the text of non-Error rejections. Tests: none (`quiz-fixtures.spec.ts` asserts messages from `Error`s only).

## P6. Reconnection `joinAsPlayer` duplicates the join steps in player-join

`e2e/player-reconnection.spec.ts:24-33` and `e2e/player-join.spec.ts:28-40` fill the same form, wait for the same URL regex. Move `joinAsPlayer(page, quiz, name?)` into `e2e/support/` (or `e2e/pages/JoinPage.ts` next to the existing page objects) and call it from both; player-join still needs its own `playerName` so the helper should accept it and return it. Value is small (two call sites after P1); worth doing only if more join specs are coming. Risk: none. Tests: none.

## Considered and rejected

### R1. Make `resolveRateLimit` and `resolvePoolMax` share one function
Not worth it. The rule is 8 lines. The only legal home that both can reach without breaking CLAUDE.md is `src/domain` (infrastructure may import `@domain/*` and `@application/*`, not `@lib/*`; `src/lib/rate-limit.ts` is outside the layer rules but infrastructure cannot import it). A domain "positive integer env" helper is not domain logic and would be a misplaced file. Note that application already imports `@lib/join-code` (`create-quiz.use-case.ts:6`), so the layer rule is already bent there, but bending it again for infrastructure to save 8 lines is a worse trade. The current comment in `rate-limit.ts` ("written twice on purpose") already records the decision. If the two ever diverge, revisit with a pure `parsePositiveInteger(value, name): number | undefined` in `src/domain/value-objects/` and thin wrappers on both sides (`?? fallback` each).
Cosmetic only, no action: `resolvePoolMax` uses `function`, `resolveRateLimit` an arrow function (matches the arrow style of its own file, so fine).

### R2. `fixtureTimestamp` / sweep tests, `quiz-fixtures.spec.ts`
Seven tests, each with a distinct behaviour (create, start, unique title, delete Active, failed step cleanup, timestamp parse, sweep stale/untimed). No merge candidates. "creates a Pending quiz" and "starts the quiz" could share a quiz but would blur failures; leave.

### R3. `client.ts` comment block
Slightly long (4 lines on serverless plus the DATABASE_POOL_MAX line) but accurate; leave.

## Summary of ids
P1 drop 3 overlapping reconnection tests; P2 drop redundant localStorage clear (verify auth file first); P3 delete unused `trueFalse`, `points` and extra exports; P4 single constant for auth file path; P5 `errorMessage` helper in the fixture; P6 shared `joinAsPlayer` helper. R1 (merge the two env-integer resolvers) rejected with the layer-rule reason.
