# `speci run` — Command Flow

Central orchestration loop. Reads PROGRESS.md state, dispatches agents, runs gate validations, and iterates until all tasks are done or limits are reached.

## Usage

```
speci run [--max-iterations 10] [--dry-run] [--force] [--yes] [--verify] [--verbose]
```

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         speci run                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │ 1. Load      │ │ 2. Preflight│ │ 3. Lock      │
    │    Config    │ │    Checks   │ │    Check     │
    └──────────────┘ └─────────────┘ └──────────────┘
           │                │               │
           └────────────────┼───────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ 4. Pre-run Gate  │
                  │    (dry-run?     │
                  │     confirm?)    │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ 5. Acquire Lock  │
                  │ 6. Install Sigs  │
                  │ 7. Open Log File │
                  └────────┬─────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │                        │
              │   ╔══════════════════╗ │
              │   ║   MAIN LOOP      ║ │
              │   ║   (see below)    ║ │
              │   ╚══════════════════╝ │
              │                        │
              └────────────┬───────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ 8. Cleanup       │
                  │ ├─ Release lock  │
                  │ ├─ Close log     │
                  │ └─ Remove sigs   │
                  └──────────────────┘
```

## Main Orchestration Loop

```
    ┌──────────────────────────────────────────────────────────────┐
    │                      mainLoop()                              │
    │                                                              │
    │  iteration = 0                                               │
    │                                                              │
    │  while (iteration < maxIterations):                          │
    │    iteration++                                               │
    │                                                              │
    │    ┌──────────────────────────────────────────────────────┐  │
    │    │  Read PROGRESS.md  →  STATE                          │  │
    │    └──────────────────────────┬───────────────────────────┘  │
    │                               │                              │
    │             ┌─────────────────┼─────────────────┐            │
    │             │                 │                  │           │
    │             ▼                 ▼                  ▼           │
    │    ┌────────────────┐ ┌─────────────┐ ┌──────────────────┐   │
    │    │  WORK_LEFT     │ │  IN_REVIEW  │ │  BLOCKED         │   │
    │    │  ──────────    │ │  ─────────  │ │  ───────         │   │
    │    │  handleWork    │ │  dispatch   │ │  dispatch        │   │
    │    │  Left()        │ │  Review     │ │  Tidy Agent      │   │
    │    │  (see below)   │ │  Agent      │ │                  │   │
    │    └────────────────┘ └─────────────┘ └──────────────────┘   │
    │             │                 │                  │           │
    │             └────────────────────────────────────┘           │
    │                               │                              │
    │             ┌─────────────────┼──────────────────┐           │
    │             ▼                 ▼                   ▼          │
    │    ┌────────────────┐ ┌─────────────┐  ┌─────────────────┐   │
    │    │  DONE          │ │ NO_PROGRESS │  │  Max iterations │   │
    │    │  ────          │ │ ─────────── │  │  reached        │   │
    │    │  "All tasks    │ │ ERROR:      │  │  ────────────── │   │
    │    │  complete!"    │ │ "Run speci  │  │  Warn & exit    │   │
    │    │  return        │ │  init"      │  │                 │   │
    │    └────────────────┘ └─────────────┘  └─────────────────┘   │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
```

## `WORK_LEFT` — Implementation + Gate + Fix Cycle

This is the core automation loop. It implements code, validates with gates, and attempts fixes on failure.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    handleWorkLeft()                                  │
│                                                                      │
│   ┌────────────────────────────────┐                                 │
│   │  Dispatch IMPL Agent           │                                 │
│   │  ════════════════════          │                                 │
│   │  copilotRunner.run(            │                                 │
│   │    config, 'impl')             │                                 │
│   └───────────────┬────────────────┘                                 │
│                   │                                                  │
│            ┌──────┴──────┐                                           │
│            │  Success?   │                                           │
│            └──────┬──────┘                                           │
│             no ╱     ╲ yes                                           │
│               ╱       ╲                                              │
│              ▼         ▼                                             │
│      ┌──────────┐  ┌───────────────────────────────────────────┐     │
│      │  Return  │  │  Run Gate Validation                      │     │
│      │  (skip   │  │  ═══════════════════                      │     │
│      │   gates) │  │  gateRunner.run(config)                   │     │
│      └──────────┘  │                                           │     │
│                    │  Executes configured gate commands:       │     │
│                    │  ├─ npm run lint                          │     │
│                    │  ├─ npm run typecheck                     │     │
│                    │  └─ npm test                              │     │
│                    └──────────────────┬────────────────────────┘     │
│                                       │                              │
│                                ┌──────┴──────┐                       │
│                                │  All pass?  │                       │
│                                └──────┬──────┘                       │
│                           yes ╱         ╲ no                         │
│                              ╱           ╲                           │
│                             ▼             ▼                          │
│                  ┌───────────────┐  ┌───────────────────────┐        │
│                  │  Gates PASS   │  │  Write failure notes  │        │
│                  │  Continue to  │  │  to PROGRESS.md       │        │
│                  │  next iter    │  │                       │        │
│                  └───────────────┘  └───────────────────────┘        │
│                                                 │                    │
│                                                 ▼                    │
│                                    ┌────────────────────────┐        │
│                                    │  runFixAttempts()      │        │
│                                    │  (see below)           │        │
│                                    └────────────┬───────────┘        │
│                                                 │                    │
│                                          ┌──────┴──────┐             │
│                                          │  Fixed?     │             │
│                                          └──────┬──────┘             │
│                                    yes ╱          ╲ no               │
│                                       ╱            ╲                 │
│                                      ▼              ▼                │
│                           ┌───────────────┐  ┌──────────────────┐    │
│                           │  "Gates pass  │  │  ERROR:          │    │
│                           │   after fix!" │  │  "Gates still    │    │
│                           │  Continue     │  │   failing after  │    │
│                           └───────────────┘  │   N attempts"    │    │
│                                              │  throw Error     │    │
│                                              └──────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Fix Attempt Loop

```
┌──────────────────────────────────────────────────────────────────┐
│                    runFixAttempts()                              │
│                                                                  │
│  for attempt = 1 to maxFixAttempts:                              │
│                                                                  │
│    ┌────────────────────────────────────┐                        │
│    │  ┌──────────────────────────────┐  │                        │
│    │  │  Fix Attempt [attempt/max]   │  │  ◄── rendered with     │
│    │  │  ████████░░░░  2/3           │  │      progress bar      │
│    │  └──────────────────────────────┘  │                        │
│    └────────────────────────────────────┘                        │
│                     │                                            │
│                     ▼                                            │
│    ┌────────────────────────────────────┐                        │
│    │  Dispatch FIX Agent                │                        │
│    │  copilotRunner.run(config, 'fix')  │                        │
│    └────────────────────────────────────┘                        │
│                        │                                         │
│                 ┌──────┴──────┐                                  │
│                 │  Success?   │                                  │
│                 └──────┬──────┘                                  │
│                  no ╱     ╲ yes                                  │
│                    ╱       ╲                                     │
│                   ▼         ▼                                    │
│          ┌──────────┐  ┌──────────────────────┐                  │
│          │  Break   │  │  Re-run gates        │                  │
│          │  (abort) │  │  gateRunner.run()    │                  │
│          └──────────┘  └──────────────────────┘                  │
│                                   │                              │
│                            ┌──────┴──────┐                       │
│                            │  Pass?      │                       │
│                            └──────┬──────┘                       │
│                       yes ╱         ╲ no                         │
│                          ╱           ╲                           │
│                         ▼             ▼                          │
│              ┌────────────────┐  ┌──────────────────┐            │
│              │  return true   │  │  Write failure   │            │
│              │  "Gates pass!" │  │  notes → retry   │            │
│              └────────────────┘  └──────────────────┘            │
│                                                                  │
│  return false  (all attempts exhausted)                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## State Machine

```
                ┌──────────────────────────────────┐
                │           PROGRESS.md            │
                │          State Machine           │
                └──────────────────────────────────┘

      ┌─────────────┐                    ┌─────────────┐
      │  WORK_LEFT  │───── impl ─────▶   │  gate       │
      │             │◀──── review ────── │  validation │
      └─────────────┘                    └─────────────┘
             │                                  │
             │                           pass ╱   ╲ fail
             │                               ╱     ╲
             │                              ▼       ▼
             │                    ┌──────────┐  ┌────────────┐
             │                    │ IN_REVIEW│  │ fix agent  │
             │                    └────┬─────┘  │ + re-gate  │
             │                         │        └────────────┘
             │                  pass ╱   ╲ fail
             │                      ╱     ╲
             │                     ▼       ▼
             │           ┌──────────┐  ┌──────────┐
             │           │  DONE    │  │WORK_LEFT │
             │           └──────────┘  │(+ notes) │
             │                         └──────────┘
             │
             ▼
      ┌─────────────┐
      │  BLOCKED    │──── tidy agent ───▶ (requires manual intervention)
      └─────────────┘
```

## Agent Dispatch Summary

| State       | Agent Dispatched   | On Success                | On Failure               |
| ----------- | ------------------ | ------------------------- | ------------------------ |
| `WORK_LEFT` | **impl** agent     | Run gate commands         | Skip gates, next iter    |
| (gate pass) | —                  | Continue to next iter     | —                        |
| (gate fail) | **fix** agent (×N) | Re-run gates              | Error after max attempts |
| `IN_REVIEW` | **review** agent   | Agent updates PROGRESS.md | —                        |
| `BLOCKED`   | **tidy** agent     | Agent updates PROGRESS.md | —                        |
| `DONE`      | — (no agent)       | Exit loop successfully    | —                        |

## Lock & Cleanup Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                  Lock & Signal Management                        │
│                                                                  │
│  1. Check existing lock                                          │
│     ├─ Lock exists + no --force → prompt "Override? [y/N]"       │
│     └─ Lock exists + --force → release & re-acquire              │
│                                                                  │
│  2. Acquire lock (.speci-lock)                                   │
│     └─ Contains: PID, timestamp, command='run'                   │
│                                                                  │
│  3. Install signal handlers (SIGINT, SIGTERM)                    │
│     └─ On signal → cleanup lock + log file → exit                │
│                                                                  │
│  4. Open log file (speci-run-<timestamp>.log)                    │
│                                                                  │
│  5. [main loop runs]                                             │
│                                                                  │
│  6. finally:                                                     │
│     ├─ Release lock                                              │
│     ├─ Close log file                                            │
│     ├─ Unregister cleanups                                       │
│     └─ Remove signal handlers                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## `--verify` Mode (Human-in-the-Loop)

```
┌──────────────────────────────────────────────────────────┐
│  Before loop: checkIncompleteMvts()                      │
│                                                          │
│  Any milestone has isMvtReady = true?                    │
│     │                                                    │
│     yes                                                  │
│     │                                                    │
│     ▼                                                    │
│  Display warnings for each ready milestone               │
│  Prompt: "Continue anyway? [y/N]"                        │
│     │                                                    │
│     no → exit cleanly                                    │
│                                                          │
│  During loop: checkMvtPause()                            │
│     │                                                    │
│     ▼                                                    │
│  Any milestone ready? → PAUSE loop, display info, return │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Key Details

| Aspect         | Value                                            |
| -------------- | ------------------------------------------------ |
| Mode           | Automated loop (multi-iteration)                 |
| Agents         | impl, review, fix, tidy (bundled or custom)      |
| Preflight      | Full (Copilot, config, progress, git)            |
| Lock           | Acquired (`.speci-lock`)                         |
| Log File       | Created (`logs/speci-run-<timestamp>.log`)       |
| Side Effects   | Agent dispatches, gate runs, PROGRESS.md updates |
| Error Handling | `handleCommandError()` → structured code         |

---

## Agents Dispatched by Run

The run command dispatches **4 different agents** depending on the PROGRESS.md state. None of these agents spawn subagents — they are single-pass agents that operate directly.

### Agent Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Agents Used by `speci run`                           │
│                                                                          │
│  ┌──────────────────────────┐    ┌───────────────────────────┐           │
│  │  speci-impl.agent.md     │    │  speci-review.agent.md    │           │
│  │  ═══════════════════     │    │  ════════════════════     │           │
│  │  Role: Implement ONE     │    │  Role: Review ONE task    │           │
│  │        task from         │    │        marked IN_REVIEW   │           │
│  │        PROGRESS.md       │    │                           │           │
│  │  Triggered: WORK_LEFT    │    │  Triggered: IN_REVIEW     │           │
│  │  No subagents            │    │  No subagents             │           │
│  └──────────────────────────┘    └───────────────────────────┘           │
│                                                                          │
│  ┌──────────────────────────┐    ┌───────────────────────────┐           │
│  │  speci-fix.agent.md      │    │  speci-tidy.agent.md      │           │
│  │  ═════════════════       │    │  ═════════════════        │           │
│  │  Role: Fix gate          │    │  Role: Clean up           │           │
│  │        failures          │    │        PROGRESS.md        │           │
│  │  Triggered: Gate fail    │    │  Triggered: BLOCKED       │           │
│  │  No subagents            │    │  No subagents             │           │
│  └──────────────────────────┘    └───────────────────────────┘           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent: `speci-impl.agent.md` — Implementation Agent

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         IMPL Agent                                       │
│                                                                          │
│  Mission: Implement exactly ONE task, leave gates green                  │
│  Input:   docs/PROGRESS.md, docs/tasks/TASK_*.md, Plan File              │
│  Output:  Source code changes, test files, PROGRESS.md update            │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │  TASK PICK POLICY                                           │         │
│  │                                                             │         │
│  │  1. Read PROGRESS.md fully                                  │         │
│  │  2. Check for FAILED review tasks → pick first (rework)     │         │
│  │  3. Find active milestone (first with remaining work)       │         │
│  │  4. From active milestone: NOT STARTED + deps resolved      │         │
│  │  5. Pick ONE: High priority > Low priority, lowest ID       │         │
│  │     └─ Exclude MVT_* tasks (manual only)                    │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │  IMPLEMENTATION PHASES                                      │         │
│  │                                                             │         │
│  │  Phase 1: Requirements Analysis                             │         │
│  │  ├─ Read task file (from File column, not guessed)          │         │
│  │  ├─ Extract acceptance criteria                             │         │
│  │  ├─ Consult Plan File for architecture context              │         │
│  │  └─ Check §3.4 Integration Map & §5.3 Touchpoints           │         │
│  │                                                             │         │
│  │  Phase 2: Test Specification                                │         │
│  │  ├─ Defaults, normal ops, edge cases, errors, integration   │         │
│  │  └─ Gate-Green: tests must pass with code IN THIS task      │         │
│  │                                                             │         │
│  │  Phase 3: Implementation                                    │         │
│  │  ├─ No `any`, null-safe, validate bounds                    │         │
│  │  ├─ JSDoc on public APIs, no magic numbers                  │         │
│  │  └─ Integration wiring if task creates new modules          │         │
│  │                                                             │         │
│  │  Phase 4: Verification (BLOCKING)                           │         │
│  │  ├─ npm run format                                          │         │
│  │  ├─ npm run lint                                            │         │
│  │  ├─ npm run typecheck                                       │         │
│  │  └─ npm test                                                │         │
│  │  (Restart from format if any fails)                         │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  State transitions:                                                      │
│    NOT STARTED → IN PROGRESS → IN REVIEW                                 │
│    (NEVER sets COMPLETE — that's the reviewer's job)                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent: `speci-review.agent.md` — Review Agent

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         REVIEW Agent                                     │
│                                                                          │
│  Mission: Review one IN_REVIEW task, approve or reject                   │
│  Input:   docs/PROGRESS.md, docs/tasks/TASK_*.md, source code            │
│  Output:  PROGRESS.md update (COMPLETE/PASSED or NOT STARTED/FAILED)     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │  REVIEW CHECKLIST                                           │         │
│  │                                                             │         │
│  │  1. Code Quality                                            │         │
│  │     ├─ No `any`, null safety, clear naming                  │         │
│  │     ├─ No dead code/unused imports, JSDoc present           │         │
│  │     └─ No magic numbers                                     │         │
│  │                                                             │         │
│  │  2. Requirements Compliance                                 │         │
│  │     ├─ All acceptance criteria met                          │         │
│  │     └─ Plan alignment (architectural intent)                │         │
│  │                                                             │         │
│  │  3. Integration Wiring                                      │         │
│  │     ├─ New modules reachable (imported, registered, called) │         │
│  │     ├─ §3.4 Integration Map entries satisfied               │         │
│  │     └─ Integration tests exist                              │         │
│  │                                                             │         │
│  │  4. Test Coverage                                           │         │
│  │     └─ Unit + edge case + error handling tests              │         │
│  │                                                             │         │
│  │  5. Verification Gates (BLOCKING)                           │         │
│  │     ├─ npm run lint                                         │         │
│  │     ├─ npm run typecheck                                    │         │
│  │     └─ npm test                                             │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  Decision:                                                               │
│  ├─ PASSED → Status=COMPLETE, Review=PASSED                              │
│  ├─ PASSED (waiver) → Design flaw detected, AC waived                    │
│  ├─ FAILED → Status=NOT STARTED, Review=FAILED, failure notes written    │
│  └─ ESCALATE → 3+ attempts same issue, marks DESIGN_FLAW                 │
│                                                                          │
│  Quick fixes: May fix minor issues itself (< 5 min)                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent: `speci-fix.agent.md` — Fix Agent

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FIX Agent                                       │
│                                                                          │
│  Mission: Fix gate failures with task context awareness                  │
│  Input:   Gate failure output, PROGRESS.md handoff notes                 │
│  Output:  Code fixes, re-run gates                                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │  CONTEXT DISCOVERY (priority order)                         │         │
│  │                                                             │         │
│  │  1. "For Fix Agent" handoff in PROGRESS.md                  │         │
│  │     ├─ Task ID, Task Goal                                   │         │
│  │     ├─ Failed Gate, Primary Error location                  │         │
│  │     ├─ Root Cause Hint                                      │         │
│  │     └─ "Do NOT" boundaries                                  │         │
│  │                                                             │         │
│  │  2. "Review Failure Notes" in PROGRESS.md                   │         │
│  │     ├─ Prioritized blocking issues                          │         │
│  │     └─ "What Passed Review" (don't break these)             │         │
│  │                                                             │         │
│  │  3. Task file (docs/tasks/TASK_XXX.md) — if needed          │         │
│  │  4. Gate log file (.speci-logs/*.log)                       │         │
│  │  5. Implementation plans (docs/*.md)                        │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  Scope: ONLY fix reported failures, NO refactoring, NO new features      │
│  Escalation: 3+ cycles same issue → mark BLOCKED + DESIGN_FLAW           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent: `speci-tidy.agent.md` — Tidy Agent

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TIDY Agent                                       │
│                                                                          │
│  Mission: Clean up PROGRESS.md, unblock tasks with fulfilled deps        │
│  Input:   docs/PROGRESS.md, docs/tasks/*.md                              │
│  Output:  Updated PROGRESS.md only                                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │  WORKFLOW                                                   │         │
│  │                                                             │         │
│  │  Step 1: Read current state                                 │         │
│  │  ├─ Identify all BLOCKED tasks                              │         │
│  │  └─ Read each task file for dependency info                 │         │
│  │                                                             │         │
│  │  Step 2: Check dependency fulfillment                       │         │
│  │  ├─ All deps COMPLETE + PASSED? → BLOCKED → NOT STARTED     │         │
│  │  └─ Any dep incomplete? → remains BLOCKED                   │         │
│  │                                                             │         │
│  │  Step 3: Clean up PROGRESS.md                               │         │
│  │  ├─ Update unblocked tasks                                  │         │
│  │  ├─ Remove "Review Tracking" section                        │         │
│  │  ├─ Recalculate Progress Summary counts                     │         │
│  │  └─ Update Architecture Status sections                     │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  Rules:                                                                  │
│  ├─ NEVER implements tasks or marks tasks COMPLETE                       │
│  ├─ ONLY status change allowed: BLOCKED → NOT STARTED                    │
│  └─ ONLY modifies docs/PROGRESS.md                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent Dispatch per State (Summary)

```
┌──────────────────────────────────────────────────────────────────────────┐
│               Which Agent Runs When?                                     │
│                                                                          │
│  PROGRESS.md                                                             │
│  State            Agent           What It Does           Subagents?      │
│  ──────────────   ─────────────   ─────────────────────  ──────────      │
│  WORK_LEFT    →   speci-impl      Pick & implement task    None          │
│   (gate pass) →   (continue)      Next iteration                         │
│   (gate fail) →   speci-fix       Fix gate failures        None          │
│                   (up to N×)      Re-run gates                           │
│                                                                          │
│  IN_REVIEW    →   speci-review    Review implementation    None          │
│                                   Pass → COMPLETE                        │
│                                   Fail → NOT STARTED                     │
│                                                                          │
│  BLOCKED      →   speci-tidy      Unblock fulfilled deps   None          │
│                                   Clean up PROGRESS.md                   │
│                                                                          │
│  DONE         →   (none)          Exit loop                              │
│  NO_PROGRESS  →   (error)         "Run speci init"                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
