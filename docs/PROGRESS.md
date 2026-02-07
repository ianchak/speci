# Speci Codebase Refactoring - Implementation Progress

## Overview

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| **Project Name** | Speci Codebase Refactoring                |
| **Plan File**    | docs/REFACTORING_PLAN.md                  |
| **Total Tasks**  | 38 tasks + 5 MVTs                         |
| **Tech Stack**   | TypeScript, Node.js, Commander.js, Vitest |

---

## Status Legend

| Marker      | Meaning                          |
| ----------- | -------------------------------- |
| COMPLETE    | Task finished and verified       |
| IN PROGRESS | Currently being worked on        |
| IN REVIEW   | Work complete, awaiting review   |
| NOT STARTED | Task not yet begun               |
| BLOCKED     | Waiting on dependency completion |

---

## Progress Summary

| Milestone | Name              | Tasks   | MVT    | Complete | Total | Status      |
| --------- | ----------------- | ------- | ------ | -------- | ----- | ----------- |
| M0        | Quick Wins        | 001-004 | MVT_M0 | 4        | 5     | IN PROGRESS |
| M1        | Foundation        | 005-009 | MVT_M1 | 2        | 6     | IN PROGRESS |
| M2        | Core Improvements | 010-018 | MVT_M2 | 0        | 10    | NOT STARTED |
| M3        | Polish            | 019-030 | MVT_M3 | 0        | 13    | NOT STARTED |
| M4        | Optimization      | 031-038 | MVT_M4 | 0        | 9     | NOT STARTED |

---

## Completed Milestones

> Summary only. See task files for details.

| Milestone | Name       | Completed   | Tasks Complete | Notes                                                                                                                                                                                                                                                     |
| --------- | ---------- | ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Quick Wins | In Progress | TASK_001-004   | Coverage tracking infrastructure added with baseline 82.74% lines coverage; All lib/ files now use TypeScript path aliases; Magic strings extracted to lib/constants.ts module with comprehensive test coverage; Boolean properties standardized with semantic prefixes (is*, should*) |
| M1        | Foundation | In Progress | TASK_005-006   | Dependency injection interfaces and adapters established; CommandContext pattern enables testable commands; Production context factory and test utilities ready; plan command successfully migrated to DI pattern as proof of concept, validating architecture for rollout |

---

## Milestone: M0 - Quick Wins

| Task ID  | Title                     | Status      | Review Status | Priority | Complexity   | Dependencies | Assigned To     | Attempts |
| -------- | ------------------------- | ----------- | ------------- | -------- | ------------ | ------------ | --------------- | -------- |
| TASK_001 | Code Coverage Tracking    | COMPLETE    | PASSED        | CRITICAL | S (≤2h)      | None         | SA-20260207-001 | 1        |
| TASK_002 | Path Aliases              | COMPLETE    | PASSED        | MEDIUM   | S (≤2h)      | None         | SA-20260207-003 | 2        |
| TASK_003 | Magic Strings Extraction  | COMPLETE    | PASSED        | MEDIUM   | S (≤2h)      | None         | SA-20260207-004 | 1        |
| TASK_004 | Boolean Semantic Prefixes | COMPLETE    | PASSED        | MEDIUM   | S (≤2h)      | None         | SA-20260207-005 | 1        |
| MVT_M0   | Quick Wins Manual Test    | NOT STARTED | —             | 20 min   | TASK_001-004 |                 |          |

### Planned Outcomes

- Coverage infrastructure with 80% lines / 70% branches targets
- All relative imports replaced with TypeScript path aliases (@/)
- Magic strings centralized to constants module
- Boolean properties standardized with semantic prefixes (is*, should*, has\*)

---

## Milestone: M1 - Foundation

| Task ID  | Title                          | Status   | Review Status | Priority | Complexity | Dependencies | Assigned To     | Attempts |
| -------- | ------------------------------ | -------- | ------------- | -------- | ---------- | ------------ | --------------- | -------- |
| TASK_005 | Dependency Injection Interface | COMPLETE | PASSED        | CRITICAL | M (4-8h)   | None         | SA-20260207-006 | 1        |
| TASK_006 | DI Proof of Concept            | COMPLETE | PASSED        | CRITICAL | M (4-8h)   | TASK_005     | SA-20260207-007 | 1        |
| TASK_007 | DI Rollout to Commands         | IN REVIEW   | FAILED   | CRITICAL | L (8-16h)  | TASK_006     | SA-20260207-010 | 5        |
| TASK_008 | Process Globals Abstraction    | NOT STARTED | HIGH     | M (4-8h)   | TASK_007     |
| TASK_009 | Process.exit Cleanup Fix       | NOT STARTED | CRITICAL | M (4-8h)   | TASK_008     |
| MVT_M1   | Foundation Manual Test         | NOT STARTED | —        | 30 min     | TASK_005-009 |

### Planned Outcomes

- Dependency injection pattern implemented across all commands
- Process globals abstracted for testability
- All 23 process.exit() calls fixed to allow proper cleanup
- Foundation enables 60%+ of remaining improvements

### Review Failure Notes

**Task:** TASK_007 - DI Rollout to Commands  
**Task Goal:** Migrate all 5 remaining commands (init, task, refactor, run, status) to use DI pattern with CommandContext  
**Review Agent:** RA-20260208-008

---

#### Blocking Issues (must fix to pass)

1. **AC2 NOT MET: Direct fs imports in init.ts**
   - Location: `lib/commands/init.ts:8,193,198,205`
   - Expected: Use `context.fs.readdirSync()`, `context.fs.statSync()`, `context.fs.copyFileSync()`
   - Actual: Direct imports and calls to `readdirSync()`, `statSync()`, `copyFileSync()` from node:fs
   - Fix: Replace direct fs calls in `copyDirectoryRecursive()` helper function:
     - Line 193: `const entries = context.fs.readdirSync(src);`
     - Line 198: `const stat = context.fs.statSync(srcPath);`
     - Line 205: `context.fs.copyFileSync(srcPath, destPath);`
   - Remove: `copyFileSync, readdirSync, statSync` from line 8 import

2. **AC2 NOT MET: Direct fs import in refactor.ts**
   - Location: `lib/commands/refactor.ts:9,70`
   - Expected: Use `context.fs.statSync()`
   - Actual: Direct import and call to `statSync()` from node:fs
   - Fix: Replace line 70: `const stats = context.fs.statSync(resolved);`
   - Remove: `statSync` from line 9 import

3. **AC2 NOT MET: process.exit() in run.ts helper**
   - Location: `lib/commands/run.ts:420`
   - Expected: Return CommandResult or throw error to be caught by main function
   - Actual: `confirmRun()` helper calls `process.exit(0)` directly in readline callback
   - Fix: Change `confirmRun()` to return boolean (true=proceed, false=cancel), update caller to handle cancellation:
     ```typescript
     // Make confirmRun return boolean
     async function confirmRun(...): Promise<boolean> {
       return new Promise((resolve) => {
         rl.question('...', (answer) => {
           if (answer === 'n') {
             log.info('Run cancelled.');
             resolve(false); // return false instead of exit
           }
           resolve(true);
         });
       });
     }
     // In main run() function, check result:
     const shouldProceed = await confirmRun(state, config);
     if (!shouldProceed) {
       return { success: false, exitCode: 0, error: 'User cancelled' };
     }
     ```

4. **AC6 NOT MET: bin/speci.ts relies on default parameters**
   - Location: `bin/speci.ts:103,134,157,182,207,234` (all action handlers)
   - Expected: "bin/speci.ts creates single production context and passes to all commands"
   - Actual: Commands called without context argument, relying on default `createProductionContext()` parameter
   - Fix: Create context once at top of bin/speci.ts and pass explicitly:
     ```typescript
     import { createProductionContext } from '../lib/adapters/context-factory.js';
     const context = createProductionContext();
     
     // Then in each action:
     .action(async (options) => {
       const result = await init(options, context);
       ...
     });
     ```
   - Context: AC6 specifically requires explicit context passing from entry point, not implicit via defaults

---

#### Non-Blocking Issues (fix if time permits)

- None identified

---

#### What Passed Review

- AC1: All 6 commands accept CommandContext parameter ✅
- AC3: Commands use context.fs, context.logger, context.configLoader, context.copilot ✅
- AC4: All commands return Promise<CommandResult> ✅
- AC5: Test migration complete - all use mock contexts ✅
- AC7: Full test suite passes (868/868 tests) ✅
- AC8: Zero vi.mock() for fs/process/config in tests ✅
- Gates: lint ✅, typecheck ✅, test ✅
- No direct loadConfig() imports ✅
- status.ts correctly uses context.process.exit() ✅

---

#### Fix Agent Instructions

1. **Start with:** Issue #1 (init.ts fs imports) - straightforward replacements in one helper function
2. **Then:** Issue #2 (refactor.ts fs import) - single line change
3. **Then:** Issue #3 (run.ts process.exit) - requires refactoring confirmRun signature and caller
4. **Finally:** Issue #4 (bin/speci.ts context creation) - add context variable and pass to 6 command calls
5. **Verify:** Run `npm run lint && npm run typecheck && npm test` - all must pass
6. **Context:** This is the 4th attempt. Previous attempts successfully migrated 5 commands but missed these 4 small issues
7. **Do NOT:** Add new features, refactor utilities, or change test logic - just fix the 4 blocking issues

---

## Milestone: M2 - Core Improvements

| Task ID  | Title                           | Status      | Priority | Complexity | Dependencies       |
| -------- | ------------------------------- | ----------- | -------- | ---------- | ------------------ |
| TASK_010 | Integration Test Suite          | NOT STARTED | CRITICAL | L (8-16h)  | TASK_001, TASK_009 |
| TASK_011 | CLI Entry Point Tests           | NOT STARTED | HIGH     | M (4-8h)   | TASK_010           |
| TASK_012 | Race Condition Tests            | NOT STARTED | HIGH     | M (4-8h)   | TASK_010           |
| TASK_013 | Error Catalog Tests             | NOT STARTED | HIGH     | S (≤2h)    | TASK_010           |
| TASK_014 | Discriminated Union Error Types | NOT STARTED | HIGH     | L (8-16h)  | TASK_009           |
| TASK_015 | Standardize Logging             | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_008           |
| TASK_016 | Extract Command Initialization  | NOT STARTED | HIGH     | M (4-8h)   | TASK_007           |
| TASK_017 | Encapsulate Module-Level State  | NOT STARTED | HIGH     | M (4-8h)   | TASK_007           |
| TASK_018 | Reduce Cross-Module Coupling    | NOT STARTED | HIGH     | L (8-16h)  | TASK_007           |
| MVT_M2   | Core Improvements Manual Test   | NOT STARTED | —        | 45 min     | TASK_010-018       |

### Planned Outcomes

- Comprehensive integration test suite covering end-to-end workflows
- CLI entry point fully tested
- Race conditions and error catalog have automated tests
- Error types use discriminated unions for type safety
- Logging standardized across codebase
- 90+ lines of command initialization duplication eliminated
- Module-level mutable state encapsulated
- Cross-module coupling reduced significantly

---

## Milestone: M3 - Polish

| Task ID  | Title                          | Status      | Priority | Complexity | Dependencies |
| -------- | ------------------------------ | ----------- | -------- | ---------- | ------------ |
| TASK_019 | Refactor Entry Point           | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_007     |
| TASK_020 | Split Banner Animation Module  | NOT STARTED | MEDIUM   | S (≤2h)    | None         |
| TASK_021 | Config as Parameter            | NOT STARTED | HIGH     | M (4-8h)   | TASK_007     |
| TASK_022 | Config Memoization             | NOT STARTED | MEDIUM   | S (≤2h)    | TASK_021     |
| TASK_023 | State File Read Caching        | NOT STARTED | MEDIUM   | S (≤2h)    | None         |
| TASK_024 | Error Catalog Consistency      | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_014     |
| TASK_025 | Expand Retry Logic             | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_014     |
| TASK_026 | Extract Remaining Duplications | NOT STARTED | MEDIUM   | M (4-8h)   | None         |
| TASK_027 | Standardize Command API        | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_007     |
| TASK_028 | Signal Handler Promise Fix     | NOT STARTED | HIGH     | M (4-8h)   | TASK_009     |
| TASK_029 | Debug Logging                  | NOT STARTED | LOW      | S (≤2h)    | TASK_015     |
| TASK_030 | Standardize Null vs Undefined  | NOT STARTED | MEDIUM   | M (4-8h)   | None         |
| MVT_M3   | Polish Manual Test             | NOT STARTED | —        | 40 min     | TASK_019-030 |

### Planned Outcomes

- Entry point refactored for clarity and maintainability
- Banner animation logic properly separated
- Config passed as parameter instead of repeated loading
- Config and state file caching implemented
- Error catalog consistent across all commands
- Retry logic expanded with proper error handling
- Remaining code duplications eliminated
- Command API standardized with consistent contracts
- Signal handlers properly handle promises
- Debug logging capabilities enhanced
- Null vs undefined usage standardized

---

## Milestone: M4 - Optimization

| Task ID  | Title                             | Status      | Priority | Complexity | Dependencies |
| -------- | --------------------------------- | ----------- | -------- | ---------- | ------------ |
| TASK_031 | Parallelize Gate Commands         | NOT STARTED | MEDIUM   | L (8-16h)  | TASK_010     |
| TASK_032 | Fix Deep Merge Type Assertions    | NOT STARTED | MEDIUM   | M (4-8h)   | None         |
| TASK_033 | Consolidate Validation Logic      | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_007     |
| TASK_034 | Add Generic Types                 | NOT STARTED | LOW      | M (4-8h)   | None         |
| TASK_035 | Structured Lock File Format       | NOT STARTED | MEDIUM   | M (4-8h)   | TASK_009     |
| TASK_036 | Expand Test Coverage              | NOT STARTED | MEDIUM   | L (8-16h)  | TASK_001     |
| TASK_037 | Performance Benchmarks            | NOT STARTED | LOW      | M (4-8h)   | TASK_031     |
| TASK_038 | Interface vs Type Standardization | NOT STARTED | LOW      | M (4-8h)   | None         |
| MVT_M4   | Optimization Manual Test          | NOT STARTED | —        | 45 min     | TASK_031-038 |

### Planned Outcomes

- Gate commands parallelized for 30-50% speedup
- Type assertions cleaned up in deep merge utilities
- Validation logic consolidated to reduce duplication
- Generic types added for improved type safety
- Lock file format structured for better error handling
- Test coverage expanded across critical modules
- Performance benchmarks established
- Interface vs type usage standardized

---

## Critical Path

```
TASK_001 (Coverage) → TASK_005 (DI Interfaces) → TASK_006 (DI PoC) →
TASK_007 (DI Rollout) → TASK_008 (Process Abstraction) →
TASK_009 (Process.exit Fix) → TASK_010 (Integration Tests) →
TASK_014 (Error Types) → TASK_016 (Command Init) → TASK_021 (Config Param) →
TASK_031 (Parallelize) → MVT_M4
```

**Estimated total effort**: 380-450 hours (9+ weeks)
**Status**: NOT STARTED

---

## Risk Areas

| Task     | Risk                     | Status      | Mitigation                     |
| -------- | ------------------------ | ----------- | ------------------------------ |
| TASK_007 | DI rollout complexity    | NOT STARTED | Blocks 60%+ of work            |
| TASK_014 | Breaking type changes    | NOT STARTED | Requires careful migration     |
| TASK_031 | Parallel execution races | NOT STARTED | Needs comprehensive race tests |

---

## Subagent Tracking

Last Subagent ID: SA-20260207-010

---

## Review Tracking

Last Review ID: RA-20260208-008

---

## Agent Handoff

### For Reviewer

| Field             | Value                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task              | TASK_007                                                                                                                                                            |
| Impl Agent        | SA-20260207-010                                                                                                                                                     |
| Files Changed     | `bin/speci.ts`, `lib/commands/init.ts`, `lib/commands/refactor.ts`, `lib/commands/run.ts`, `lib/interfaces.ts`, `lib/adapters/node-filesystem.ts`, `lib/adapters/test-context.ts` |
| Tests Added       | `test/plan.test.ts`, `test/status.test.ts`, `test/refactor.test.ts`, `test/run.test.ts`, `test/task.test.ts` (updated mocks for new IFileSystem methods)          |
| Rework?           | Yes - Fixed all 4 blocking issues: (1) init.ts fs imports, (2) refactor.ts fs import, (3) run.ts process.exit, (4) bin/speci.ts context creation                   |
| Focus Areas       | Verify confirmRun boolean logic preserves user cancellation behavior; Check IFileSystem extension doesn't break existing tests; Confirm context is passed explicitly from bin/speci.ts |
| Known Limitations | None - all 4 blocking issues resolved, no known limitations                                                                                                         |
| Gate Results      | format:✅ lint:✅ typecheck:✅ test:✅                                                                                                                              |

### For Fix Agent

| Field           | Value                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Task            | TASK_007                                                                                                                           |
| Task Goal       | Migrate all 5 remaining commands (init, task, refactor, run, status) to use DI pattern with CommandContext                        |
| Review Agent    | RA-20260208-008                                                                                                                    |
| Failed Gate     | none (all gates pass - lint/typecheck/test all ✅)                                                                                |
| Primary Error   | `lib/commands/init.ts:8,193,198,205` - Direct fs imports (copyFileSync, readdirSync, statSync) instead of context.fs methods      |
| Root Cause Hint | copyDirectoryRecursive() helper in init.ts uses direct fs calls; refactor.ts validateScope() uses statSync; run.ts confirmRun() calls process.exit; bin/speci.ts doesn't create shared context |
| Do NOT          | Add features, refactor utilities, change test logic. Only fix 4 small issues: (1) init.ts fs calls, (2) refactor.ts fs call, (3) run.ts process.exit, (4) bin/speci.ts context creation |

---

## Summary Statistics

**Overall Progress**: 13.95% Complete (6/43 items)

**By Category**:

- Tasks: 6/38 complete
- MVTs: 0/5 complete
- Total Items: 6/43 complete

**By Milestone**:

- M0 Quick Wins: 4/5 complete (80%)
- M1 Foundation: 2/6 complete (33%)
- M2 Core Improvements: 0/10 complete (0%)
- M3 Polish: 0/13 complete (0%)
- M4 Optimization: 0/9 complete (0%)

**Target Quality Metrics**:

- Code coverage tracking infrastructure in place
- Dependency injection pattern implemented
- All process.exit() cleanup issues resolved
- Integration test suite established
- 200+ lines of code duplication eliminated
- Type safety enhanced with discriminated unions
- Performance optimizations delivering 30-50% speedup

---

_Generated by Progress Generator Subagent_
_Last Updated: 2026-02-07_
