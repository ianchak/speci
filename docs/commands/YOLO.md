# `speci yolo` — Command Flow

Full pipeline orchestrator: **plan → task → run** in a single command. Chains all three commands sequentially with shared config and lock management.

## Usage

```
speci yolo --prompt "Build a REST API" --input docs/spec.md [--output docs/plan.md] [--force] [--verbose]
```

## High-Level Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                          speci yolo                                 │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                                                              │  │
│   │      Phase 1/3              Phase 2/3            Phase 3/3   │  │
│   │   ┌───────────┐         ┌───────────┐         ┌───────────┐  │  │
│   │   │           │         │           │         │           │  │  │
│   │   │   PLAN    │────────▶│   TASK    │────────▶│   RUN    │  │  │
│   │   │           │         │           │         │           │  │  │
│   │   └───────────┘         └───────────┘         └───────────┘  │  │
│   │     Generate              Generate              Execute      │  │
│   │     plan doc              task list              impl loop   │  │
│   │                                                              │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   Each phase:                                                       │
│   ├─ fail → abort pipeline with phase-aware error message           │
│   └─ pass → continue to next phase                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          speci yolo                                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
               ┌────────────────────────────────┐
               │  Validate & Resolve Paths      │
               │                                │
               │  --input paths:                │
               │  ├─ resolve(cwd, path)         │
               │  └─ PathValidator:             │
               │     └─ isWithinProject(cwd)    │
               │                                │
               │  --output path (if provided):  │
               │  ├─ resolve(cwd, path)         │
               │  └─ PathValidator:             │
               │     └─ isWithinProject(cwd)    │
               └───────────────┬────────────────┘
                               │
                               ▼
               ┌────────────────────────────────┐
               │  Load Config                   │
               │  configLoader.load()           │
               └───────────────┬────────────────┘
                               │
                               ▼
               ┌────────────────────────────────┐
               │  Validate Inputs               │
               │                                │
               │  InputValidator:               │
               │  └─ requireInput(              │
               │       --input, --prompt)       │
               │                                │
               │  Need at least one of:         │
               │  --input or --prompt           │
               └───────────────┬────────────────┘
                               │
                        ┌──────┴──────┐
                        │  Valid?     │
                        └──────┬──────┘
                         no ╱     ╲ yes
                           ╱       ╲
                          ▼         ▼
               ┌──────────────┐  ┌──────────────────────────┐
               │ Return error │  │  Run preflight checks    │
               │ + suggestion │  │  ├─ Copilot installed?   │
               └──────────────┘  │  ├─ Config exists?       │
                                 │  └─ (no progress check)  │
                                 └────────────┬─────────────┘
                                              │
                                              ▼
               ┌──────────────────────────────────────────────┐
               │  Install Signal Handlers                     │
               │  └─ On SIGINT/SIGTERM → release lock → exit  │
               └──────────────────────┬───────────────────────┘
                                      │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │  Acquire Lock (.speci-lock)                  │
               │                                              │
               │  Lock info: PID, command='yolo',             │
               │  state='yolo:pipeline', iteration=0          │
               │                                              │
               │  ┌────────────────────────────┐              │
               │  │ Lock conflict?             │              │
               │  └───────────┬────────────────┘              │
               │        no ╱     ╲ yes                        │
               │          ╱       ╲                           │
               │         │    ┌────────────┐                  │
               │         │    │ --force?   │                  │
               │         │    └─────┬──────┘                  │
               │         │    no ╱     ╲ yes                  │
               │         │      ╱       ╲                     │
               │         │  Return    Release &               │
               │         │  error     re-acquire              │
               │         │                                    │
               └─────────┼────────────────────────────────────┘
                         │
                         ▼
               ┌──────────────────────────────────────────────┐
               │  Determine Plan Output Path                  │
               │                                              │
               │  --output provided?                          │
               │    yes → use resolved --output path          │
               │    no  → auto-generate timestamped path:     │
               │          docs/plan-YYYYMMDD-HHmmss           │
               │          _implementation_plan.md             │
               └──────────────────────┬───────────────────────┘
                                      │
                                      ▼
    ══════════════════════════════════════════════════════════════
    ║                    runYoloPipeline()                       ║
    ══════════════════════════════════════════════════════════════
                                      │
           ┌──────────────────────────┼───────────────────────┐
           │                         │                        │
           ▼                         ▼                        ▼
    ┏━━━━━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━━━━━━━┓
    ┃  Phase 1/3       ┃  ┃  Phase 2/3        ┃  ┃  Phase 3/3         ┃
    ┃  PLAN            ┃  ┃  TASK             ┃  ┃  RUN               ┃
    ┃                  ┃  ┃                   ┃  ┃                    ┃
    ┃  plan({          ┃  ┃  task({           ┃  ┃  run({             ┃
    ┃    prompt,       ┃  ┃    plan: planPath ┃  ┃    yes: true,      ┃
    ┃    input,        ┃  ┃    verbose        ┃  ┃    force: true,    ┃
    ┃    output:       ┃  ┃  })               ┃  ┃    verbose         ┃
    ┃      planPath,   ┃  ┃                   ┃  ┃  })                ┃
    ┃    verbose       ┃  ┃  Uses plan file   ┃  ┃                    ┃
    ┃  })             ┃  ┃  from Phase 1      ┃  ┃  force=true so     ┃
    ┃                  ┃  ┃  to generate      ┃  ┃  run releases the  ┃
    ┃  Generates       ┃  ┃  task list        ┃  ┃  yolo lock and     ┃
    ┃  implementation  ┃  ┃                   ┃  ┃  acquires its own  ┃
    ┃  plan document   ┃  ┃                   ┃  ┃                    ┃
    ┗━━━━━━━━┯━━━━━━━━━┛  ┗━━━━━━━━━┯━━━━━━━━━┛  ┗━━━━━━━━━━┯━━━━━━━━━┛
             │                      │                       │
      ┌──────┴──────┐        ┌──────┴──────┐         ┌──────┴──────┐
      │  Success?   │        │  Success?   │         │  Success?   │
      └─────────────┘        └─────────────┘         └─────────────┘
       no ╱     ╲ yes         no ╱     ╲ yes          no ╱     ╲ yes
         ╱       ╲              ╱       ╲               ╱       ╲
        ▼         ╲            ▼         ╲             ▼         ▼
   ┌─────────┐     ╲     ┌─────────┐     ╲      ┌─────────┐  ┌────────┐
   │ "Yolo   │      ╲    │ "Yolo   │      ╲     │ "Yolo   │  │SUCCESS │
   │ failed  │       ╲   │ failed  │       ╲    │ failed  │  │        │
   │ during  │        ▶──│ during  │        ▶──│ during  │  │{exit:0}│
   │ plan"   │           │ task"   │            │ run"    │  │        │
   └─────────┘           └─────────┘            └─────────┘  └────────┘
```

## Phase Execution Wrapper

Each phase runs through `runPhase()` which adds timing and logging:

```
┌───────────────────────────────────────────────────────┐
│  runPhase(label, fn)                                  │
│                                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│  Phase 1/3: Generating implementation plan...         │
│                                                       │
│  startTime = Date.now()                               │
│         │                                             │
│         ▼                                             │
│  result = await fn()                                  │
│         │                                             │
│         ▼                                             │
│  ┌──────┴──────┐                                      │
│  │  Success?   │                                      │
│  └──────┬──────┘                                      │
│   no ╱     ╲ yes                                      │
│     ╱       ╲                                         │
│    ▼         ▼                                        │
│  (pass     ✓ "Plan generation complete"               │
│   thru)    debug: "Phase completed in 1234ms"         │
│                                                       │
│  return result                                        │
│                                                       │
└───────────────────────────────────────────────────────┘
```

## Lock Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                  yolo Lock Management                        │
│                                                              │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  yolo       │     │  Phase 3:    │     │  finally:    │   │
│  │  acquires   │────▶│  run() uses  │────▶│  yolo       │   │
│  │  lock       │     │  force=true  │     │  releases    │   │
│  │  (yolo)     │     │  to get its  │     │  lock        │   │
│  │             │     │  own lock    │     │              │   │
│  └─────────────┘     └──────────────┘     └──────────────┘   │
│                                                              │
│  Signal handlers ensure lock release on SIGINT/SIGTERM       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Auto-Generated Plan Path

When `--output` is not provided, yolo generates a timestamped path:

```
Format:  docs/plan-YYYYMMDD-HHmmss_implementation_plan.md

Example: docs/plan-20260312-143022_implementation_plan.md
                    ^^^^^^^^ ^^^^^^
                    date     time

This ensures concurrent or successive yolo runs
never silently overwrite each other's plan files.
```

## Key Details

| Aspect         | Value                                              |
| -------------- | -------------------------------------------------- |
| Mode           | Full pipeline (plan → task → run)                  |
| Agents         | plan, task, then impl/review/fix/tidy (via run)    |
| Preflight      | Partial (Copilot, config — no progress check)      |
| Lock           | Acquired (`yolo` command, `yolo:pipeline` state)   |
| Side Effects   | Plan file, task files, PROGRESS.md, gate runs      |
| Error Handling | Phase-aware messages: "Yolo failed during X phase" |

## Command Composition

```
yolo is NOT a monolith — it composes the existing commands:

  ┌──────────────────────────────────────────────────────────┐
  │  yolo()                                                  │
  │  ├─ validates inputs & acquires lock                     │
  │  ├─ calls plan()   with shared config                    │
  │  ├─ calls task()   with shared config + plan output path │
  │  ├─ calls run()    with shared config + yes + force      │
  │  └─ releases lock in finally block                       │
  └──────────────────────────────────────────────────────────┘

  Each sub-command receives `preloadedConfig` to avoid
  redundant config file reads. The config is loaded ONCE
  at the yolo level and passed through.
```

---

## Full Agent Call Tree

Since yolo composes plan → task → run, it triggers the **entire agent ecosystem**. Here is the complete picture of every agent and subagent call across the full pipeline:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    yolo — Full Agent Call Tree                           │
│                                                                          │
│  Phase 1/3: PLAN                                                         │
│  ══════════════                                                          │
│  speci-plan.agent.md (orchestrator)                                      │
│  │                                                                       │
│  ├─ (orchestrator) Create plan skeleton                                  │
│  ├─ (orchestrator) Codebase search (grep, file_search, semantic)         │
│  │                                                                       │
│  ├─ ⬡ plan_requirements_deep_dive     → §1 Requirements                  │
│  ├─ ⬡ plan_codebase_context           → §2 Codebase Context              │
│  ├─ ⬡ plan_initial_planner            → §3–12 Full Plan                  │
│  │                                                                       │
│  ├─ ⬡ plan_refine_requirements        → Round 1                          │
│  ├─ ⬡ plan_refine_architecture        → Round 2                          │
│  ├─ ⬡ plan_refine_dataflow            → Round 3                          │
│  ├─ ⬡ plan_refine_errors              → Round 4                          │
│  ├─ ⬡ plan_refine_edgecases           → Round 5                          │
│  ├─ ⬡ plan_refine_testing             → Round 6                          │
│  ├─ ⬡ plan_refine_integration         → Round 7                          │
│  ├─ ⬡ plan_refine_performance         → Round 8                          │
│  ├─ ⬡ plan_refine_security            → Round 9                          │
│  │                                                                       │
│  ├─ (orchestrator) Resolve open questions                                │
│  └─ ⬡ plan_refine_final               → Round 10                         │
│                                                                          │
│  Subtotal: 1 agent, 13 subagents                                         │
│                                                                          │
│  Phase 2/3: TASK                                                         │
│  ══════════════                                                          │
│  speci-task.agent.md (orchestrator)                                      │
│  │                                                                       │
│  ├─ (orchestrator) Extract features, create GENERATION_STATE.md          │
│  │                                                                       │
│  ├─ For each milestone:                                                  │
│  │  ├─ For each feature:                                                 │
│  │  │  ├─ ⬡ task_generator   → TASK_XXX.md                               │
│  │  │  └─ ⬡ task_reviewer    → Review quality                            │
│  │  ├─ ⬡ task_generator      → Integration task (if needed)              │
│  │  ├─ ⬡ task_reviewer       → Review integration task                   │
│  │  └─ ⬡ mvt_generator       → MVT_MX.md                                 │
│  │                                                                       │
│  ├─ ⬡ progress_generator     → PROGRESS.md (all NOT STARTED)             │
│  ├─ ⬡ final_reviewer         → Alignment validation                      │
│  │                                                                       │
│  └─ (orchestrator) Delete GENERATION_STATE.md                            │
│                                                                          │
│  Subtotal: 1 agent, N subagents (varies by feature count)                │
│                                                                          │
│  Phase 3/3: RUN                                                          │
│  ═════════════                                                           │
│  (no orchestrator — dispatches agents directly per state)                │
│  │                                                                       │
│  └─ Main loop (up to maxIterations):                                     │
│     │                                                                    │
│     ├─ WORK_LEFT:                                                        │
│     │  ├─ ● speci-impl.agent.md    → Implement 1 task                    │
│     │  ├─ Gate validation (lint, typecheck, test)                        │
│     │  └─ On fail:                                                       │
│     │     └─ ● speci-fix.agent.md  → Fix gates (×maxFixAttempts)         │
│     │                                                                    │
│     ├─ IN_REVIEW:                                                        │
│     │  └─ ● speci-review.agent.md  → Approve or reject                   │
│     │                                                                    │
│     ├─ BLOCKED:                                                          │
│     │  └─ ● speci-tidy.agent.md    → Unblock deps                        │
│     │                                                                    │
│     └─ DONE: exit                                                        │
│                                                                          │
│  Subtotal: 4 agent types, 0 subagents each                               │
│  (called repeatedly across iterations)                                   │
│                                                                          │
│  ═══════════════════════════════════════════════                         │
│  GRAND TOTAL: 6 unique agents, 18+ subagent prompts                      │
│  (plan: 13, task: 5+, run agents: 0 subagents each)                      │
│  ═══════════════════════════════════════════════                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### All Agent Files Referenced

```
┌──────────────────────────────────────────────────────────────────────────┐
│  templates/agents/                                                       │
│  ├── speci-plan.agent.md          ← Plan orchestrator (13 subagents)     │
│  ├── speci-task.agent.md          ← Task orchestrator (5 subagent types) │
│  ├── speci-impl.agent.md          ← Implementation (no subagents)        │
│  ├── speci-review.agent.md        ← Code review (no subagents)           │
│  ├── speci-fix.agent.md           ← Gate fix (no subagents)              │
│  └── speci-tidy.agent.md          ← PROGRESS cleanup (no subagents)      │
│                                                                          │
│  Not used by yolo (separate command):                                    │
│  └── speci-refactor.agent.md      ← Refactor orchestrator (15 subagents) │
│                                                                          │
│  templates/agents/subagents/  (33 prompt files)                          │
│  │                                                                       │
│  │  Plan subagents (13):                                                 │
│  ├── plan_requirements_deep_dive.prompt.md                               │
│  ├── plan_codebase_context.prompt.md                                     │
│  ├── plan_initial_planner.prompt.md                                      │
│  ├── plan_refine_requirements.prompt.md                                  │
│  ├── plan_refine_architecture.prompt.md                                  │
│  ├── plan_refine_dataflow.prompt.md                                      │
│  ├── plan_refine_errors.prompt.md                                        │
│  ├── plan_refine_edgecases.prompt.md                                     │
│  ├── plan_refine_integration.prompt.md                                   │
│  ├── plan_refine_performance.prompt.md                                   │
│  ├── plan_refine_security.prompt.md                                      │
│  ├── plan_refine_testing.prompt.md                                       │
│  ├── plan_refine_final.prompt.md                                         │
│  │                                                                       │
│  │  Task subagents (5):                                                  │
│  ├── task_generator.prompt.md                                            │
│  ├── task_reviewer.prompt.md                                             │
│  ├── mvt_generator.prompt.md                                             │
│  ├── progress_generator.prompt.md                                        │
│  ├── final_reviewer.prompt.md                                            │
│  │                                                                       │
│  │  Refactor subagents (15) — not used by yolo:                          │
│  ├── refactor_analyze_structure.prompt.md                                │
│  ├── refactor_analyze_types.prompt.md                                    │
│  ├── refactor_analyze_errors.prompt.md                                   │
│  ├── refactor_analyze_duplication.prompt.md                              │
│  ├── refactor_analyze_functions.prompt.md                                │
│  ├── refactor_analyze_naming.prompt.md                                   │
│  ├── refactor_analyze_state.prompt.md                                    │
│  ├── refactor_analyze_performance.prompt.md                              │
│  ├── refactor_analyze_testing.prompt.md                                  │
│  ├── refactor_analyze_crosscutting.prompt.md                             │
│  ├── refactor_review_completeness.prompt.md                              │
│  ├── refactor_review_technical.prompt.md                                 │
│  ├── refactor_review_risks.prompt.md                                     │
│  ├── refactor_review_roadmap.prompt.md                                   │
│  └── refactor_review_final.prompt.md                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
