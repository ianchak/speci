# `speci task` — Command Flow

One-shot task generation from a plan file via GitHub Copilot CLI.

## Usage

```
speci task --plan docs/plan.md [--clean] [--verbose]
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        speci task                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
               ┌────────────────────────┐
               │   Validate --plan      │
               │                        │
               │  InputValidator:       │
               │  └─ required('plan')   │
               │     "--plan <path>     │
               │      is required"      │
               └───────────┬────────────┘
                           │
                    ┌──────┴──────┐
                    │  Provided?  │
                    └──────┬──────┘
                     no ╱     ╲ yes
                       ╱       ╲
                      ▼         ▼
           ┌──────────────┐  ┌────────────────────────┐
           │ Return error │  │  Resolve plan path     │
           │ (exit 1)     │  │  resolve(cwd, --plan)  │
           └──────────────┘  └────────────┬───────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │  Validate Plan File    │
                             │                        │
                             │  PathValidator:        │
                             │  ├─ exists()           │
                             │  └─ isReadable()       │
                             └────────────┬───────────┘
                                          │
                                   ┌──────┴──────┐
                                   │  Valid?     │
                                   └──────┬──────┘
                                    no ╱     ╲ yes
                                      ╱       ╲
                                     ▼         ▼
                          ┌──────────────┐  ┌──────────────────┐
                          │ Return error │  │  --clean flag?   │
                          └──────────────┘  └──────────────────┘
                                               no ╱     ╲ yes
                                                 ╱       ╲
                                                │         ▼
                                                │  ┌──────────────────────┐
                                                │  │  cleanFiles()        │
                                                │  │                      │
                                                │  │  Removes:            │
                                                │  │  ├─ Task files       │
                                                │  │  └─ PROGRESS.md      │
                                                │  │                      │
                                                │  │  ┌──────┴──────┐     │
                                                │  │  │  Success?   │     │
                                                │  │  └──────┬──────┘     │
                                                │  │   no ╱     ╲ yes     │
                                                │  │     ╱       ╲        │
                                                │  │    ▼         │       │
                                                │  │  Return err  │       │
                                                │  └──────────────────────┘
                                                │                 │
                                                │                 │
                                                ◄─────────────────┘
                                                │
                                                ▼
                             ┌────────────────────────────────────┐
                             │  initializeCommand()               │
                             │                                    │
                             │  ├─ Load speci.config.json         │
                             │  ├─ Run preflight checks           │
                             │  │   ├─ Copilot CLI installed?     │
                             │  │   └─ Config file exists?        │
                             │  └─ Resolve agent: "speci-task"    │
                             └───────────────┬────────────────────┘
                                             │
                                             ▼
                             ┌──────────────────────────────┐
                             │  Display Info Box            │
                             │  ┌────────────────────────┐  │
                             │  │ Task Generation        │  │
                             │  │ Plan: docs/plan.md     │  │
                             │  │ Agent: speci-task      │  │
                             │  │        .agent.md       │  │
                             │  └────────────────────────┘  │
                             └──────────────────────────────┘
                                             │
                                             ▼
                        ┌─────────────────────────────────────┐
                        │  copilotRunner.buildArgs()          │
                        │                                     │
                        │  Builds CLI args:                   │
                        │  ├─ --agent speci-task.agent.md   │
                        │  ├─ --prompt "Read the plan file    │
                        │  │   at <path> and generate         │
                        │  │   implementation tasks."         │
                        │  └─ --allow-all (if configured)     │
                        └─────────────────────────────────────┘
                                           │
                                           ▼
                        ┌─────────────────────────────────────┐
                        │  executeCopilotCommand()            │
                        │                                     │
                        │  Spawns `copilot ...`               │
                        │  ├─ stdio: 'inherit'                │
                        │  └─ Waits for exit                  │
                        └─────────────────────────────────────┘
                                           │
                                    ┌──────┴──────┐
                                    │  Exit code  │
                                    └──────┬──────┘
                                     0 ╱      ╲ ≠ 0
                                      ╱        ╲
                                     ▼          ▼
                         ┌──────────────┐  ┌──────────────┐
                         │ { success:   │  │ { success:   │
                         │   true }     │  │   false,     │
                         │              │  │   error }    │
                         └──────────────┘  └──────────────┘
```

## Key Details

| Aspect         | Value                                     |
| -------------- | ----------------------------------------- |
| Mode           | One-shot (non-interactive)                |
| Agent          | `speci-task.agent.md` (bundled or custom) |
| Preflight      | Partial (Copilot, config)                 |
| Lock           | Not acquired                              |
| Side Effects   | Generates task files, updates PROGRESS.md |
| Error Handling | `handleCommandError()` → structured code  |

## `--clean` Pre-Processing

```
--clean flag set?
      │
      yes
      │
      ▼
┌─────────────────────────────────┐
│  cleanFiles(config, context)    │
│                                 │
│  Removes existing task and      │
│  progress files so the agent    │
│  starts from a clean slate.     │
│                                 │
│  This happens BEFORE            │
│  initializeCommand() so that    │
│  preflight sees a fresh state.  │
└─────────────────────────────────┘
```

---

## Agent: `speci-task.agent.md` — Task Orchestrator

The task agent is an **orchestrator** that reads a plan/source document and spawns **5 types of subagents** to generate implementation tasks, review them, create MVTs, and build PROGRESS.md.

### Agent Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     speci-task (Orchestrator)                            │
│                                                                          │
│  Role: Extract features from plan, coordinate subagents for task gen     │
│  Context: MINIMAL — only dispatches, never generates task content        │
│  Input:  <SOURCE> plan file + optional <CONTEXT>                         │
│  Output: docs/tasks/TASK_*.md, docs/tasks/MVT_*.md, docs/PROGRESS.md     │
│  State:  GENERATION_STATE.md (coordination file, deleted on completion)  │
│                                                                          │
│  Subagent prompts loaded from: templates/agents/subagents/              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  Task Agent — 3 Phases                                   │
│                                                                          │
│  PHASE 0: SETUP ──────────────────────────────── (orchestrator direct)   │
│  │  ├─ Read <SOURCE> document                                            │
│  │  ├─ Extract feature list                                              │
│  │  ├─ Group features into milestones (3-7 tasks each)                   │
│  │  ├─ Identify integration points                                       │
│  │  └─ Create GENERATION_STATE.md                                        │
│  │                                                                       │
│  PHASE 1: GENERATION LOOP ───────────────────── (N subagents per M)      │
│  │                                                                       │
│  │  For each Milestone M:                                                │
│  │  │                                                                    │
│  │  │  For each Feature in M:                                            │
│  │  │  ├─ ⬡ task_generator   → Create TASK_XXX.md                        │
│  │  │  ├─ Update GENERATION_STATE.md                                     │
│  │  │  ├─ ⬡ task_reviewer    → Review TASK_XXX.md                        │
│  │  │  └─ Update GENERATION_STATE.md                                     │
│  │  │                                                                    │
│  │  │  INTEGRATION CHECK:                                                │
│  │  │  ├─ Multiple components need wiring?                               │
│  │  │  │   yes → ⬡ task_generator (integration task)                     │
│  │  │  │       → ⬡ task_reviewer  (review integration task)              │
│  │  │  │   no  → skip                                                    │
│  │  │  │                                                                 │
│  │  │  └─ ⬡ mvt_generator   → Create MVT_MX.md                           │
│  │  │                                                                    │
│  │  └─ Update GENERATION_STATE.md                                        │
│  │                                                                       │
│  PHASE 2: FINALIZATION ──────────────────────── (2 subagents)            │
│  │  ├─ ⬡ progress_generator → Create PROGRESS.md                         │
│  │  │    (ALL tasks marked NOT STARTED)                                  │
│  │  └─ ⬡ final_reviewer     → Validate alignment                         │
│  │                                                                       │
│  PHASE 3: CLEANUP ───────────────────────────── (orchestrator direct)    │
│     ├─ Delete GENERATION_STATE.md                                        │
│     └─ Report summary                                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Subagent Dispatch Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Subagent Prompt Files                               │
│                  templates/agents/subagents/                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  GENERATION (called per-feature, per-milestone)                 │     │
│  │                                                                 │     │
│  │  task_generator.prompt.md                                       │     │
│  │  ├─ Creates docs/tasks/TASK_XXX_<name>.md                       │     │
│  │  ├─ Includes: Metadata, Acceptance Criteria, Technical          │     │
│  │  │   Approach, Files to Create/Modify, Gate Compliance,         │     │
│  │  │   Testing Strategy, Out of Scope                             │     │
│  │  └─ Enforces Gate-Green Invariant (self-contained tasks)        │     │
│  │                                                                 │     │
│  │  task_reviewer.prompt.md                                        │     │
│  │  ├─ Reviews each TASK_XXX.md for quality                        │     │
│  │  ├─ Checks: completeness, clarity, gate compliance,             │     │
│  │  │   dependency accuracy, scope appropriateness                 │     │
│  │  └─ Can request regeneration if quality is lacking              │     │
│  │                                                                 │     │
│  │  mvt_generator.prompt.md                                        │     │
│  │  ├─ Creates docs/tasks/MVT_MX_<name>.md per milestone           │     │
│  │  ├─ Manual verification test covering all tasks in milestone    │     │
│  │  └─ Includes: Prerequisites, Test Cases, Pass/Fail Criteria     │     │
│  │                                                                 │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  FINALIZATION (called once at the end)                          │     │
│  │                                                                 │     │
│  │  progress_generator.prompt.md                                   │     │
│  │  ├─ Creates docs/PROGRESS.md                                    │     │
│  │  ├─ All tasks: Status = NOT STARTED                             │     │
│  │  ├─ Progress Summary table with milestones                      │     │
│  │  └─ Includes: Status Legend, Milestone tables, Subagent IDs     │     │
│  │                                                                 │     │
│  │  final_reviewer.prompt.md                                       │     │
│  │  ├─ Validates plan ↔ tasks alignment                            │     │
│  │  ├─ Checks all features have tasks, all MVTs exist              │     │
│  │  └─ Verifies PROGRESS.md has all tasks as NOT STARTED           │     │
│  │                                                                 │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Per-Milestone Subagent Call Sequence

```
Given a milestone M1 with features A, B, C:

  ┌───────┐    ┌───────┐    ┌───────┐    ┌───────┐    ┌───────┐
  │ gen A │───▶│ rev A │───▶│ gen B │───▶│ rev B │───▶│ gen C │──┐
  └───────┘    └───────┘    └───────┘    └───────┘    └───────┘    │
                                                                   │
  ┌────────────────────────────────────────────────────────────────┘
  │
  ▼
  ┌───────┐    ┌───────────────────┐    ┌─────────────────┐    ┌─────────┐
  │ rev C │───▶│ gen integration?  │───▶│ rev integration │───▶│ gen MVT │
  └───────┘    │ (if multi-comp)   │    │ (if generated)  │    │   M1    │
               └───────────────────┘    └─────────────────┘    └─────────┘

  gen = task_generator subagent
  rev = task_reviewer subagent
```

### Gate-Green Invariant

The task agent enforces a critical rule: **every generated task must be self-contained and leave all quality gates passing after implementation**.

```
  Anti-patterns (REJECTED):              Correct patterns (ENFORCED):
  ─────────────────────────              ──────────────────────────────

  Task A: define types                   Task A: types + impl + tests
  Task B: implement types                         (vertical slice)
  Task C: write tests
                                         Task A: full feature with stubs
  ▲ Task A fails typecheck               Task B: replace stubs with real
    (unused types)                                 logic

  ▲ Task C fails tests
    (no implementation exists)
```

### Output Files

```
docs/
├── PROGRESS.md                         ← Created by progress_generator
├── GENERATION_STATE.md                 ← Temp coordination file (deleted)
└── tasks/
    ├── TASK_001_<feature_a>.md         ← Created by task_generator
    ├── TASK_002_<feature_b>.md
    ├── TASK_003_<feature_c>.md
    ├── TASK_004_integrate_m1.md        ← Integration task (if needed)
    ├── MVT_M1_<milestone_name>.md      ← Created by mvt_generator
    ├── TASK_005_<feature_d>.md
    ├── TASK_006_<feature_e>.md
    ├── MVT_M2_<milestone_name>.md
    └── ...
```
