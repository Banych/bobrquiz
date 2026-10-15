# Action: Testing Improvements (R6 - Polish & Launch)

## Status
📋 **Planned for R6** - Deferred from 2025-12-20 sessions after successful E2E test verification

## Context
After completing R4 (Content Admin) and resolving all E2E test suite auth conflicts, several testing improvements were identified but deferred to R6 (Polish & Launch) to maintain momentum on remaining R4 features (media uploads, audit log).

**Current E2E Status**: 24/24 tests passing consistently (verified 3 runs)

## Goals
1. **Document Testing Patterns** - Create comprehensive testing guide with manual-first Playwright MCP workflow
2. **Improve Test Selectors** - Add aria-labels to icon buttons for better accessibility and maintainability
3. **Alternative Auth Isolation** - Document per-worker admin account pattern for advanced test isolation scenarios
4. **Test Stability Enhancements** - Document flaky test investigation approaches from Session 3

## Tasks

### 1. Create Testing Guide (`docs/05-testing-strategies.md`)
**Priority**: Medium
**Effort**: 2-3 hours

**Content Structure**:
```markdown
# Testing Strategies

## Manual-First E2E Testing with Playwright MCP

### Workflow
1. Activate tools: `activate_browser_navigation_tools()` + `activate_page_capture_tools()`
2. Manual exploration: Navigate, interact, inspect with MCP
3. Document behaviors: Record working selectors, timing issues, validation rules
4. Write tests: Create focused tests matching observed behavior

### Example: Admin Question CRUD (2025-12-20)
- Manual testing discovered all working selectors and timing issues
- Wrote 9 clean tests based on observations
- Fixed 2 bugs during first run (API endpoint, async form loading)
- Result: 9/9 tests passing, maintainable code

## Auth Isolation Patterns

### Isolated Storage State (Current)
Used in `admin-auth.spec.ts` to prevent cookie clearing from affecting parallel tests

### Serial Mode with Shared Context (Current)
Used in `admin-quiz-crud.spec.ts` to maintain auth across related tests

### Per-Worker Admin Accounts (Advanced)
For complex parallel execution scenarios:
- Create multiple admin users: admin1@test.com, admin2@test.com, etc.
- Assign one admin per worker via environment variables
- Generate per-worker storage state files
- Eliminates all auth state sharing between parallel workers

## Test Organization

### When to Use Serial Mode
✅ Tests manipulating same page/resource (e.g., quiz list CRUD)
✅ Tests with interdependencies or state accumulation
❌ Independent tests that don't share resources

### When to Isolate Storage State
✅ Tests that clear cookies or manipulate auth
✅ Tests that need unauthenticated state
❌ Tests that rely on pre-existing auth

## Best Practices
1. Prefer parallel execution for speed
2. Isolate side effects (auth changes, cookie clearing)
3. Wait for auth signals (logout button visibility)
4. Use shared page in serial mode to maintain state
5. Test in isolation first before running full suite
6. Use role-based selectors over text/CSS selectors
7. Add timing waits for async operations (form loading, dialogs)
```

### 2. Add Aria-Labels to Icon Buttons
**Priority**: Low
**Effort**: 1 hour

**Files to Update**:
- `src/components/admin/question-list.tsx` - Edit/delete buttons
- `src/components/admin/quiz-list.tsx` - Edit/delete buttons (if exists)

**Changes**:
```typescript
// Before
<Button variant="ghost" size="icon" onClick={() => onEdit(question)}>
  <Pencil className="h-4 w-4" />
</Button>

// After
<Button
  variant="ghost"
  size="icon"
  onClick={() => onEdit(question)}
  aria-label={`Edit question: ${question.text}`}
>
  <Pencil className="h-4 w-4" />
</Button>

<Button
  variant="ghost"
  size="icon"
  onClick={() => onDelete(question)}
  aria-label={`Delete question: ${question.text}`}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

**Test Updates**:
```typescript
// Before (from admin-question-crud.spec.ts)
await page.getByRole('button').filter({ hasText: /^$/ }).first().click();

// After
await page.getByRole('button', { name: /^Edit question:/ }).first().click();
await page.getByRole('button', { name: /^Delete question:/ }).first().click();
```

### 3. Document Per-Worker Admin Account Pattern
**Priority**: Low
**Effort**: 1 hour

**Add to Testing Guide**:
```markdown
## Advanced: Per-Worker Admin Accounts

### Setup
1. Create admin users in Supabase:
   - admin1@test.com
   - admin2@test.com
   - admin3@test.com
   - admin4@test.com
   - admin5@test.com (match Playwright worker count)

2. Add to `.env.example`:
   ```
   ADMIN_WORKER_EMAILS=admin1@test.com,admin2@test.com,admin3@test.com,admin4@test.com,admin5@test.com
   ```

3. Update `e2e/auth.setup.ts`:
   ```typescript
   import { test as setup } from '@playwright/test';

   setup('authenticate', async ({ page }, testInfo) => {
     const workerIndex = testInfo.workerIndex;
     const adminEmails = process.env.ADMIN_WORKER_EMAILS!.split(',');
     const email = adminEmails[workerIndex % adminEmails.length];
     const storageFile = `playwright/.auth/user-worker-${workerIndex}.json`;

     // Login with worker-specific admin
     await page.goto('http://localhost:3000/login');
     // ... auth flow
     await page.context().storageState({ path: storageFile });
   });
   ```

4. Update `playwright.config.ts`:
   ```typescript
   use: {
     storageState: (testInfo) =>
       `playwright/.auth/user-worker-${testInfo.workerIndex}.json`,
   },
   ```

### Benefits
- Complete auth isolation between parallel workers
- No shared storage state conflicts
- Scales to any worker count
- Eliminates need for serial mode in most cases

### Drawbacks
- Setup complexity (multiple admin accounts)
- Requires managing multiple auth sessions
- Overkill for most projects (current approach sufficient)
```

### 4. Document Flaky Test Investigation
**Priority**: Low
**Effort**: 30 minutes

**Add to Testing Guide** (from Session 3 learnings):
```markdown
## Debugging Flaky Tests

### Symptoms
- Tests pass in isolation but fail in full suite
- Inconsistent failures across runs
- Auth redirects instead of expected pages
- Timeout errors on elements that should exist

### Investigation Steps
1. **Run tests individually**: `yarn playwright test path/to/test.spec.ts`
2. **Run full suite multiple times**: Check for patterns in failures
3. **Enable debug mode**: `PWDEBUG=1 yarn playwright test`
4. **Check auth state**: Verify `playwright/.auth/user.json` isn't corrupted
5. **Review parallel execution**: Look for tests that modify shared resources
6. **Check timing issues**: Add visibility waits for async operations

### Common Causes
- **Shared auth state**: Tests clearing cookies affect parallel tests
- **Race conditions**: Client-side effects not waited for (e.g., useEffect auth)
- **Resource conflicts**: Multiple tests manipulating same page/data
- **Database state**: Tests not cleaning up created data

### Solutions
- **Isolate auth tests**: Use empty storage state for auth manipulation
- **Serial mode**: For tests sharing resources
- **Wait for signals**: Add visibility checks for async operations
- **Database cleanup**: Reset between test files if needed
```

## Implementation Plan

### Phase 1: Documentation (R6 Early)
1. Create `docs/05-testing-strategies.md`
2. Copy relevant sections from Session 2 and Session 3 notes
3. Add examples from actual test files
4. Link from main README

### Phase 2: Selector Improvements (R6 Mid)
1. Add aria-labels to all icon buttons in admin components
2. Update E2E tests to use aria-label selectors
3. Run full test suite to verify changes
4. Document pattern in testing guide

### Phase 3: Advanced Patterns (R6 Late - Optional)
1. Implement per-worker admin accounts if parallel execution issues arise
2. Test with higher worker count (10+)
3. Benchmark performance vs current approach
4. Document trade-offs

## Success Criteria
- [ ] Testing guide published at `docs/05-testing-strategies.md`
- [ ] Manual-first MCP workflow documented with examples
- [ ] Aria-labels added to all admin icon buttons
- [ ] E2E tests use accessible selectors
- [ ] Per-worker admin pattern documented (optional implementation)
- [ ] Flaky test debugging guide included

## References
- Session 2: [2025-12-20-admin-question-crud-rewrite.md](../sessions/2025-12-20-admin-question-crud-rewrite.md)
- Session 3: [2025-12-20-fix-e2e-auth-conflicts.md](../sessions/2025-12-20-fix-e2e-auth-conflicts.md)
- Session 4: [2025-12-20-fix-e2e-auth-parallel-execution.md](../sessions/2025-12-20-fix-e2e-auth-parallel-execution.md)
- Current E2E tests: `e2e/admin-auth.spec.ts`, `e2e/admin-quiz-crud.spec.ts`, `e2e/admin-question-crud.spec.ts`

## Notes
- Current E2E approach (isolated auth + serial mode for CRUD) is sufficient for R4/R5 development
- These improvements are polish items, not blockers
- Aria-labels provide dual benefit: accessibility + better test selectors
- Per-worker admin accounts are advanced pattern for future scale needs
