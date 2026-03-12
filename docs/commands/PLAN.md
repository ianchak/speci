# `speci plan` — Command Flow

Interactive plan generation via GitHub Copilot CLI.

## Usage

```
speci plan --prompt "Build a REST API" --input docs/spec.md --output docs/plan.md
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        speci plan                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
               ┌────────────────────────┐
               │   Validate Inputs      │
               │                        │
               │  InputValidator:       │
               │  ├─ requireInput()     │
               │  │   (need --input     │
               │  │    or --prompt)     │
               │  └─ validateFiles()    │
               │      (check --input    │
               │       files exist)     │
               └───────────┬────────────┘
                           │
                    ┌──────┴──────┐
                    │  Valid?     │
                    └──────┬──────┘
                     no ╱     ╲ yes
                       ╱       ╲
                      ▼         ▼
           ┌──────────────┐  ┌──────────────────────────┐
           │ Return error │  │  initializeCommand()     │
           │ (exit 1)     │  │                          │
           └──────────────┘  │  ├─ Load speci.config    │
                             │  ├─ Skip preflight       │
                             │  │   (no Copilot check)  │
                             │  └─ Resolve agent name   │
                             │     "plan.agent.md"      │
                             └────────────┬─────────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │  Build Prompt          │
                             │                        │
                             │  Combines:             │
                             │  ├─ Input file refs    │
                             │  │   (resolved paths)  │
                             │  ├─ User --prompt text │
                             │  └─ Output path hint   │
                             │     (if --output set)  │
                             └────────────────────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │  Display Info Box      │
                             │  ┌──────────────────┐  │
                             │  │ Plan Generation  │  │
                             │  │ Agent: plan.md   │  │
                             │  │ Output: docs/... │  │
                             │  │ Input: spec.md   │  │
                             │  └──────────────────┘  │
                             └────────────────────────┘
                                          │
                                          ▼
                             ┌────────────────────────┐
                             │  Print Prompt Preview  │
                             │  ──────────────────    │
                             │  Initial prompt:       │
                             │  <full prompt text>    │
                             │  ──────────────────    │
                             └────────────────────────┘
                                          │
                                          ▼
                        ┌─────────────────────────────────┐
                        │  copilotRunner.buildArgs()      │
                        │                                 │
                        │  Builds CLI args for Copilot:   │
                        │  ├─ --agent plan.agent.md       │
                        │  ├─ --prompt "<assembled text>" │
                        │  └─ --allow-all (if configured) │
                        └─────────────────────────────────┘
                                        │
                                        ▼
                        ┌─────────────────────────────────┐
                        │  executeCopilotCommand()        │
                        │                                 │
                        │  Spawns `copilot ...`           │
                        │  ├─ stdio: 'inherit'            │
                        │  │   (streams to terminal)      │
                        │  └─ Waits for process exit      │
                        └─────────────────────────────────┘
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

| Aspect         | Value                                    |
| -------------- | ---------------------------------------- |
| Mode           | One-shot (non-interactive)               |
| Agent          | `plan.agent.md` (bundled or custom)      |
| Preflight      | **Skipped** (no Copilot/git check)       |
| Lock           | Not acquired                             |
| Side Effects   | May write `--output` file via agent      |
| Error Handling | `handleCommandError()` → structured code |

## Input Validation Rules

```
Has --input files?  ──yes──▶  validateFiles() — all must exist & be readable
       │
       no
       │
Has --prompt?  ──yes──▶  OK (prompt alone is valid input)
       │
       no
       │
       ▼
  FAIL: "Provide --input <files> or --prompt <text>"
```

---

## Agent: `speci-plan.agent.md` — Plan Orchestrator

The plan agent is itself an **orchestrator** that spawns **13 subagents** across 7 phases. It maintains minimal context; all findings are written directly to the plan document by subagents.

### Agent Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     speci-plan (Orchestrator)                            │
│                                                                          │
│  Role: Coordinate subagents, create skeleton, track phase progress       │
│  Context: MINIMAL — only dispatches, never writes plan content           │
│  Output: docs/<feature>_implementation_plan.md                           │
│                                                                          │
│  Subagent prompts loaded from: .github/agents/subagents/                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  Plan Agent — 7 Phases, 13 Subagent Calls                │
│                                                                          │
│  PHASE 1: Generate Plan Skeleton ─────────────── (orchestrator direct)   │
│  │  create_file → docs/<feature>_implementation_plan.md                  │
│  │  ├─ 14 sections with placeholder structure                            │
│  │  └─ Status: SKELETON                                                  │
│  │                                                                       │
│  PHASE 2: Gather Initial Context ─────────────── (orchestrator direct)   │
│  │  ├─ grep_search (keyword matches)                                     │
│  │  ├─ file_search (pattern matches)                                     │
│  │  └─ semantic_search (concept matches)                                 │
│  │  Gate: ≥ 3 relevant files found                                       │
│  │                                                                       │
│  PHASE 3: Requirements Deep Dive ─────────────── (1 subagent)            │
│  │  └─ ⬡ plan_requirements_deep_dive                                     │
│  │     Fills: §1.1–1.5 (Functional, Non-Functional, Implicit,            │
│  │            Scope Boundaries, Assumptions)                             │
│  │  Gate: ≥ 3 func reqs, scope boundaries defined, ≥ 2 assumptions       │
│  │                                                                       │
│  PHASE 4: Codebase Context ───────────────────── (1 subagent)            │
│  │  └─ ⬡ plan_codebase_context                                           │
│  │     Fills: §2.1–2.5 (Existing Code, Patterns, Types,                  │
│  │            Integration Points, Constraints)                           │
│  │  Gate: ≥ 3 files, ≥ 2 patterns, ≥ 1 integration point                 │
│  │                                                                       │
│  PHASE 5: Finalize Initial Plan ──────────────── (1 subagent)            │
│  │  └─ ⬡ plan_initial_planner                                            │
│  │     Fills: §3–12 (Architecture, Steps, Files, Data Structures,        │
│  │            API, Edge Cases, Errors, Tests, Deps, Risks)               │
│  │  Gate: ≥ 4 phases, files listed, ≥ 2 data structures, ≥ 3 tests       │
│  │                                                                       │
│  PHASE 6: 10 Refinement Rounds ──────────────── (9+1 subagents)          │
│  │  ├─ ⬡ plan_refine_requirements     Round 1: Requirements              │
│  │  ├─ ⬡ plan_refine_architecture     Round 2: Architecture              │
│  │  ├─ ⬡ plan_refine_dataflow         Round 3: Data Flow                 │
│  │  ├─ ⬡ plan_refine_errors           Round 4: Error Handling            │
│  │  ├─ ⬡ plan_refine_edgecases        Round 5: Edge Cases                │
│  │  ├─ ⬡ plan_refine_testing          Round 6: Testing Coverage          │
│  │  ├─ ⬡ plan_refine_integration      Round 7: Integration Points        │
│  │  ├─ ⬡ plan_refine_performance      Round 8: Performance               │
│  │  └─ ⬡ plan_refine_security         Round 9: Security Review           │
│  │                                                                       │
│  PHASE 7: Open Questions Resolution ─────────── (orchestrator direct)    │
│  │  ├─ Auto-resolve from codebase (definitive answers)                   │
│  │  └─ Defer with documented defaults (judgment calls)                   │
│  │                                                                       │
│  PHASE 8: Final Validation ──────────────────── (1 subagent)             │
│     └─ ⬡ plan_refine_final            Round 10: Final Validation         │
│                                                                          │
│  Status: SKELETON → INITIAL_PLAN → COMPLETE                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Subagent Dispatch Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Subagent Prompt Files                               │
│                  .github/agents/subagents/                               │
│                                                                          │
│  ┌────────────────────────────┐  ┌─────────────────────────────────┐     │
│  │  CONTEXT GATHERING         │  │  INITIAL PLANNING               │     │
│  │                            │  │                                 │     │
│  │  plan_requirements_        │  │  plan_initial_planner           │     │
│  │    deep_dive.prompt.md     │  │    .prompt.md                   │     │
│  │    → §1.1–1.5              │  │    → §3–12 (full plan)          │     │
│  │                            │  │                                 │     │
│  │  plan_codebase_            │  └─────────────────────────────────┘     │
│  │    context.prompt.md       │                                          │
│  │    → §2.1–2.5              │                                          │
│  └────────────────────────────┘                                          │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  REFINEMENT ROUNDS (10 sequential passes over the plan)           │   │
│  │                                                                   │   │
│  │  Round  Subagent File                       Focus Area            │   │
│  │  ─────  ────────────────────────────────     ───────────────────  │   │
│  │    1    plan_refine_requirements.prompt.md   Requirements         │   │
│  │    2    plan_refine_architecture.prompt.md   Architecture         │   │
│  │    3    plan_refine_dataflow.prompt.md       Data Flow            │   │
│  │    4    plan_refine_errors.prompt.md         Error Handling       │   │
│  │    5    plan_refine_edgecases.prompt.md      Edge Cases           │   │
│  │    6    plan_refine_testing.prompt.md        Testing Coverage     │   │
│  │    7    plan_refine_integration.prompt.md    Integration Points   │   │
│  │    8    plan_refine_performance.prompt.md    Performance          │   │
│  │    9    plan_refine_security.prompt.md       Security Review      │   │
│  │   10    plan_refine_final.prompt.md          Final Validation     │   │
│  │                                                                   │   │
│  │  Each subagent EDITS the plan document directly.                  │   │
│  │  The plan file is the single source of truth.                     │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Output: Plan Document Structure

```
docs/<feature>_implementation_plan.md
│
├── §0  Requirements (Raw)
├── §1  Requirements Analysis (filled by requirements_deep_dive)
├── §2  Codebase Context (filled by codebase_context)
├── §3  Technical Architecture (filled by initial_planner)
│   └── §3.4 Integration Map — component wiring table
├── §4  Implementation Steps (filled by initial_planner)
├── §5  File Changes (filled by initial_planner)
│   └── §5.3 Integration Touchpoints
├── §6  Data Structures
├── §7  API Contracts
├── §8  Edge Cases (table: ID, Scenario, Handling, Test Case)
├── §9  Error Handling (table: Type, Cause, Recovery, Message)
├── §10 Testing Strategy
├── §11 Dependencies
├── §12 Risks & Mitigations
├── §13 Refinement Log (10 rounds tracked)
└── §14 Open Questions / Deferred Decisions
```
