# `speci refactor` — Command Flow

One-shot codebase refactoring analysis via GitHub Copilot CLI.

## Usage

```
speci refactor [--scope src/utils] [--output docs/refactor-plan.md] [--verbose]
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       speci refactor                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
               ┌────────────────────────┐
               │   --scope provided?    │
               └───────────┬────────────┘
                     no ╱     ╲ yes
                       ╱       ╲
                      │         ▼
                      │  ┌──────────────────────────────────────┐
                      │  │  validateScope()                     │
                      │  │                                      │
                      │  │  Is it a glob pattern?               │
                      │  │  (contains *, ?, [, ])               │
                      │  │       │                              │
                      │  │  yes ╱ ╲ no                          │
                      │  │     ╱   ╲                            │
                      │  │    ▼     ▼                           │
                      │  │  Return  ┌────────────────────────┐  │
                      │  │  as-is   │ Resolve path           │  │
                      │  │          │ PathValidator:         │  │
                      │  │          │ └─ isWithinProject()   │  │
                      │  │          │                        │  │
                      │  │          │ Check existence:       │  │
                      │  │          │ ├─ exists → OK         │  │
                      │  │          │ └─ missing → warn      │  │
                      │  │          │    (non-fatal)         │  │
                      │  │          └────────────────────────┘  │
                      │  │                                      │
                      │  │  ┌──────────────┐                    │
                      │  │  │ Validation   │                    │
                      │  │  │ failed?      │                    │
                      │  │  └──────┬───────┘                    │
                      │  │   yes ╱   ╲ no                       │
                      │  │      ╱     ╲                         │
                      │  │     ▼       ╲                        │
                      │  │  Return      ╲                       │
                      │  │  error        ╲                      │
                      │  └──────────────────────────────────────┘
                      │                   │
                      ◄───────────────────┘
                      │
                      ▼
         ┌────────────────────────────────────┐
         │  initializeCommand()               │
         │                                    │
         │  ├─ Load speci.config.json         │
         │  ├─ Run preflight checks           │
         │  │   ├─ Copilot CLI installed?     │
         │  │   └─ Config file exists?        │
         │  └─ Resolve agent:                 │
         │     "speci-refactor"               │
         └───────────────┬────────────────────┘
                         │
                         ▼
         ┌──────────────────────────────────┐
         │  Display Info Box                │
         │  ┌────────────────────────────┐  │
         │  │ Refactor Analysis          │  │
         │  │ Scope: src/utils           │  │
         │  │ Agent: speci-refactor      │  │
         │  │        .agent.md          │  │
         │  │ Output: docs/refactor.md   │  │
         │  └────────────────────────────┘  │
         └──────────────────────────────────┘
                         │
                         ▼
         ┌──────────────────────────────────┐
         │  Build Prompt                    │
         │                                  │
         │  No scope:                       │
         │    "Analyze the codebase and     │
         │     generate refactoring         │
         │     recommendations."            │
         │                                  │
         │  With scope:                     │
         │    "Analyze the codebase at      │
         │     scope \"<path>\" and         │
         │     generate refactoring         │
         │     recommendations."            │
         └──────────────────────────────────┘
                         │
                         ▼
         ┌──────────────────────────────────┐
         │  copilotRunner.buildArgs()       │
         │                                  │
         │  ├─ --agent speci-refactor       │
         │  │         .agent.md              │
         │  ├─ --prompt "<built prompt>"    │
         │  └─ --allow-all (if configured)  │
         └──────────────────────────────────┘
                         │
                         ▼
         ┌──────────────────────────────────┐
         │  executeCopilotCommand()         │
         │                                  │
         │  Spawns `copilot ...`            │
         │  ├─ stdio: 'inherit'             │
         │  └─ Waits for exit               │
         └──────────────────────────────────┘
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

## Scope Validation Logic

```
                       --scope value
                            │
                            ▼
                ┌───────────────────────┐
                │  Contains *, ?, [, ]? │
                └───────────┬───────────┘
                      yes ╱     ╲ no
                         ╱       ╲
                        ▼         ▼
              ┌─────────────┐  ┌──────────────────────────┐
              │  Glob mode  │  │  Directory/file mode     │
              │             │  │                          │
              │  Return     │  │  resolve(cwd, scope)     │
              │  as-is      │  │       │                  │
              │  (no local  │  │       ▼                  │
              │   check)    │  │  isWithinProject(cwd)?   │
              └─────────────┘  │   no → ERROR             │
                               │  yes → check existence:  │
                               │   ├─ exists → OK         │
                               │   └─ missing → WARN      │
                               └──────────────────────────┘
```

## Key Details

| Aspect         | Value                                         |
| -------------- | --------------------------------------------- |
| Mode           | One-shot (non-interactive)                    |
| Agent          | `speci-refactor.agent.md` (bundled or custom) |
| Preflight      | Partial (Copilot, config)                     |
| Lock           | Not acquired                                  |
| Side Effects   | May write `--output` file via agent           |
| Error Handling | `handleCommandError()` → structured code      |

---

## Agent: `speci-refactor.agent.md` — Refactor Orchestrator

The refactor agent is an **orchestrator** that spawns **15 subagents** across 4 phases: 10 analysis subagents + 5 review subagents. It performs a comprehensive codebase analysis and generates a detailed refactoring plan.

### Agent Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    speci-refactor (Orchestrator)                         │
│                                                                          │
│  Role: Coordinate analysis + review subagents for refactoring plan       │
│  Context: MINIMAL — only dispatches, compiles proposals between phases   │
│  Output: docs/REFACTORING_PLAN.md                                        │
│                                                                          │
│  Subagent prompts loaded from: templates/agents/subagents/              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Refactor Agent — 5 Phases, 15 Subagent Calls                │
│                                                                          │
│  PHASE 1: Generate Plan Skeleton ─────────────── (orchestrator direct)   │
│  │  create_file → docs/REFACTORING_PLAN.md                               │
│  │  ├─ 12 sections with placeholder structure                            │
│  │  ├─ Analysis Log table (10 rows)                                      │
│  │  ├─ Review Log table (5 rows)                                         │
│  │  └─ Status: SKELETON                                                  │
│  │                                                                       │
│  PHASE 2: Codebase Analysis Loops ───────────── (10 subagents)           │
│  │  Each subagent analyzes the codebase from a different angle,          │
│  │  edits the plan document directly (§1.X + Analysis Log)               │
│  │                                                                       │
│  │  ├─ ⬡ refactor_analyze_structure     1: Architecture                  │
│  │  ├─ ⬡ refactor_analyze_types         2: Type Safety                   │
│  │  ├─ ⬡ refactor_analyze_errors        3: Error Handling                │
│  │  ├─ ⬡ refactor_analyze_duplication   4: DRY Violations                │
│  │  ├─ ⬡ refactor_analyze_functions     5: Function Design               │
│  │  ├─ ⬡ refactor_analyze_naming        6: Naming & Docs                 │
│  │  ├─ ⬡ refactor_analyze_state         7: State Management              │
│  │  ├─ ⬡ refactor_analyze_performance   8: Performance                   │
│  │  ├─ ⬡ refactor_analyze_testing       9: Testing                       │
│  │  └─ ⬡ refactor_analyze_crosscutting  10: Cross-Cutting                │
│  │                                                                       │
│  PHASE 3: Compile Refactoring Proposals ─────── (orchestrator direct)    │
│  │  ├─ Review all findings across 10 analysis sections                   │
│  │  ├─ Create detailed proposals in §7                                   │
│  │  ├─ Populate priority tables (§2 Critical, §3 High,                   │
│  │  │   §4 Medium, §5 Low)                                               │
│  │  ├─ Build implementation roadmap in §6                                │
│  │  └─ Update Code Quality Metrics (§8)                                  │
│  │                                                                       │
│  PHASE 4: Plan Review & Refinement ──────────── (5 subagents)            │
│  │  Each review subagent refines the plan from a different angle,        │
│  │  edits the plan document directly (improvements + Review Log)         │
│  │                                                                       │
│  │  ├─ ⬡ refactor_review_completeness   1: Coverage Gaps                 │
│  │  ├─ ⬡ refactor_review_technical      2: Technical Accuracy            │
│  │  ├─ ⬡ refactor_review_risks          3: Risk Assessment               │
│  │  ├─ ⬡ refactor_review_roadmap        4: Dependency Order              │
│  │  └─ ⬡ refactor_review_final          5: Final Polish                  │
│  │                                                                       │
│  PHASE 5: Finalize Plan ─────────────────────── (orchestrator direct)    │
│     ├─ Update Status: COMPLETE                                           │
│     ├─ Write Executive Summary                                           │
│     └─ Final verification all sections filled                            │
│                                                                          │
│  Status: SKELETON → INITIAL_PLAN → COMPLETE                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Subagent Dispatch Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Subagent Prompt Files                               │
│                  templates/agents/subagents/                             │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  ANALYSIS SUBAGENTS (10 sequential deep-dives)                    │   │
│  │                                                                   │   │
│  │  #   Subagent File                           Focus                │   │
│  │  ──  ─────────────────────────────────────    ──────────────────  │   │
│  │   1  refactor_analyze_structure.prompt.md     Architecture        │   │
│  │   2  refactor_analyze_types.prompt.md         Type Safety         │   │
│  │   3  refactor_analyze_errors.prompt.md        Error Handling      │   │
│  │   4  refactor_analyze_duplication.prompt.md   DRY Violations      │   │
│  │   5  refactor_analyze_functions.prompt.md     Function Design     │   │
│  │   6  refactor_analyze_naming.prompt.md        Naming & Docs       │   │
│  │   7  refactor_analyze_state.prompt.md         State Management    │   │
│  │   8  refactor_analyze_performance.prompt.md   Performance         │   │
│  │   9  refactor_analyze_testing.prompt.md       Testing             │   │
│  │  10  refactor_analyze_crosscutting.prompt.md  Cross-Cutting       │   │
│  │                                                                   │   │
│  │  Each edits §1.X in the plan + updates §11 Analysis Log           │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  REVIEW SUBAGENTS (5 sequential refinement passes)                │   │
│  │                                                                   │   │
│  │  #   Subagent File                           Focus                │   │
│  │  ──  ─────────────────────────────────────    ──────────────────  │   │
│  │   1  refactor_review_completeness.prompt.md   Coverage Gaps       │   │
│  │   2  refactor_review_technical.prompt.md      Feasibility         │   │
│  │   3  refactor_review_risks.prompt.md          Risk Assessment     │   │
│  │   4  refactor_review_roadmap.prompt.md        Dependencies        │   │
│  │   5  refactor_review_final.prompt.md          Final Polish        │   │
│  │                                                                   │   │
│  │  Each refines plan content + updates §12 Review Log               │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Analysis → Proposal Pipeline

```
  Phase 2: Analysis                Phase 3: Compile              Phase 4: Review
  ────────────────                 ─────────────────             ────────────────

  ┌────────────────┐               ┌──────────────┐             ┌──────────────┐
  │ 10 subagents   │               │ Orchestrator │             │ 5 subagents  │
  │ fill §1.1–1.10 │──────────────▶│ reads §1.*   │────────────▶│ refine full  │
  │ with findings  │               │ creates:     │             │ plan:        │
  │                │               │ §2 Critical  │             │ completeness │
  │ Each operates  │               │ §3 High      │             │ feasibility  │
  │ independently  │               │ §4 Medium    │             │ risk         │
  │ on the codebase│               │ §5 Low       │             │ roadmap      │
  │                │               │ §6 Roadmap   │             │ polish       │
  │                │               │ §7 Proposals │             │              │
  └────────────────┘               └──────────────┘             └──────────────┘
```

### Output: Refactoring Plan Structure

```
docs/REFACTORING_PLAN.md
│
├── Executive Summary
├── §1  Analysis Findings
│   ├── §1.1  Architecture        (refactor_analyze_structure)
│   ├── §1.2  Type Safety         (refactor_analyze_types)
│   ├── §1.3  Error Handling      (refactor_analyze_errors)
│   ├── §1.4  DRY Violations      (refactor_analyze_duplication)
│   ├── §1.5  Function Design     (refactor_analyze_functions)
│   ├── §1.6  Naming & Docs       (refactor_analyze_naming)
│   ├── §1.7  State Management    (refactor_analyze_state)
│   ├── §1.8  Performance         (refactor_analyze_performance)
│   ├── §1.9  Testing             (refactor_analyze_testing)
│   └── §1.10 Cross-Cutting       (refactor_analyze_crosscutting)
├── §2  Critical Issues (table)
├── §3  High Priority Tasks (table)
├── §4  Medium Priority Improvements (table)
├── §5  Low Priority / Nice-to-Have (table)
├── §6  Refactoring Roadmap (4 phases with timelines)
├── §7  Detailed Proposals (per-issue breakdown)
├── §8  Code Quality Metrics (current → target)
├── §9  Dependencies Between Tasks
├── §10 Implementation Guidelines
├── §11 Analysis Log (10 iterations tracked)
├── §12 Review Log (5 reviews tracked)
└── Appendix: Issue List, Pattern Violations, Code Standards
```

## Comparison with `plan`

```
┌──────────────────────────────────────────────────────────────────────┐
│                      plan vs refactor                                │
├────────────────────────────┬─────────────────────────────────────────┤
│  plan                      │  refactor                               │
├────────────────────────────┼─────────────────────────────────────────┤
│  --input (files)           │  --scope (dir/glob)                     │
│  --prompt (required*)      │  No prompt needed                       │
│  --output                  │  --output                               │
│  Preflight: SKIPPED        │  Preflight: Partial (Copilot, config)    │
│  Validates input files     │  Validates scope path/glob              │
│  Builds composite prompt   │  Builds scope-aware prompt              │
│  agent: speci-plan.agent.md │  agent: speci-refactor.agent.md         │
│  13 subagent calls         │  15 subagent calls                      │
│  (2 context + 1 planner    │  (10 analysis + 5 review)               │
│   + 10 refine)             │                                         │
│  Output: feature plan      │  Output: refactoring plan               │
├────────────────────────────┴─────────────────────────────────────────┤
│  * plan requires either --input or --prompt                          │
│  Both use orchestrator pattern with minimal context retention        │
└──────────────────────────────────────────────────────────────────────┘
```
