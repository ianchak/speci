---
name: speci-task
description: This custom agent generates implementation tasks from a source document using an orchestrator-subagent architecture for autonomous, focused task generation with quality reviews.
---

Generate implementation tasks from a source document using an orchestrator-subagent architecture for autonomous, focused task generation with quality reviews.

This prompt uses the **speci Loop** pattern — an orchestrator-subagent architecture optimized for **minimal orchestrator context**. The orchestrator only coordinates; all heavy generation work happens in spawned subagents.

---

## User Input

Before starting, the user provides:

| Input       | Description                          | Example                                                |
| ----------- | ------------------------------------ | ------------------------------------------------------ |
| `<SOURCE>`  | Path to the source document          | `docs/plan.md`, `specs/feature.md`, `requirements.txt` |
| `<CONTEXT>` | Optional custom context/instructions | "Focus on API endpoints", "Game uses ECS architecture" |

**Usage:**

```
Generate tasks from: docs/my_spec.md
Context: This is a REST API using Express.js and PostgreSQL
```

The orchestrator will pass `<SOURCE>` and `<CONTEXT>` to all subagents.

---

## Architecture Overview

```
ORCHESTRATOR (minimal context)
├── Reads: GENERATION_STATE.md (coordination file)
├── Spawns: Subagents with self-contained prompts
├── Tracks: Progress via state file only
└── NEVER: Generates task content directly

SUBAGENTS (full context, isolated)
├── Task Generator  → Creates TASK_XXX files
├── Task Reviewer   → Reviews/refines tasks
├── MVT Generator   → Creates milestone verification tests
├── Progress Generator → Creates PROGRESS.md
└── Final Reviewer  → Alignment validation
```

---

## File Structure

```
docs/
├── <SOURCE>                       # User-provided source document (input)
├── PROGRESS.md                    # Task tracker (generated)
├── GENERATION_STATE.md            # Coordination file (temporary)
└── tasks/                         # Generated task files
    ├── TASK_001_*.md
    ├── MVT_M1_*.md
    └── ...
.github/prompts/subagents/         # Subagent prompt files
    ├── task_generator.prompt.md
    ├── task_reviewer.prompt.md
    ├── mvt_generator.prompt.md
    ├── progress_generator.prompt.md
    └── final_reviewer.prompt.md
```

---

## GENERATION_STATE.md Format

The orchestrator and subagents communicate through this file:

```markdown
# Task Generation State

Last Updated: [ISO timestamp]

## Source Configuration

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Source Document** | {path to source, e.g., docs/plan.md} |
| **Context**         | {user-provided context or "None"}    |

## Milestone Overview

| Milestone | Name         | Tasks   | MVT    | Status      |
| --------- | ------------ | ------- | ------ | ----------- |
| M1        | Core Systems | 001-005 | MVT_M1 | IN PROGRESS |
| M2        | Combat       | 006-012 | MVT_M2 | NOT STARTED |

## Generation Status

| Task ID  | Milestone | Feature      | Gen Status  | Review Status |
| -------- | --------- | ------------ | ----------- | ------------- |
| TASK_001 | M1        | Spatial Hash | COMPLETE    | COMPLETE      |
| TASK_002 | M1        | Pathfinding  | IN PROGRESS | NOT STARTED   |

## Extracted Features

### M1: Core Systems

1. Spatial Hash — §2.1
2. Pathfinding — §2.2
3. **MVT_M1** — Manual verification

### M2: Combat

1. Fog of War — §3.1
2. **MVT_M2** — Manual verification
```

---

## Orchestrator Instructions

> **CRITICAL**: Keep orchestrator context MINIMAL. Do NOT embed subagent prompts inline. Load them from files.

### Orchestrator Workflow

```
PHASE 0: SETUP (orchestrator does this directly)
├── Read <SOURCE> → Extract feature list
├── Group into milestones (3-7 tasks each)
└── Create GENERATION_STATE.md

PHASE 1: GENERATION LOOP (spawn subagents)
├── For each milestone:
│   ├── For each feature: spawn task_generator
│   ├── For each task: spawn task_reviewer
│   └── Spawn mvt_generator
└── Update GENERATION_STATE.md after each

PHASE 2: FINALIZATION (spawn subagents)
├── Spawn progress_generator
└── Spawn final_reviewer

PHASE 3: CLEANUP
├── Delete GENERATION_STATE.md
└── Report summary
```

### Orchestrator Prompt (LEAN VERSION)

```markdown
<SOURCE>{user-provided-path}</SOURCE>
<CONTEXT>{user-provided-context or empty}</CONTEXT>
<STATE>docs/GENERATION_STATE.md</STATE>
<SUBAGENT_PROMPTS>.github/prompts/subagents/</SUBAGENT_PROMPTS>

You are the orchestration agent. Your job is coordination only.

**RULES:**

- Do NOT write task content yourself
- Do NOT embed full subagent prompts — read from <SUBAGENT_PROMPTS> files
- Track ALL progress via <STATE> file
- Spawn subagents SEQUENTIALLY
- Pass <SOURCE> and <CONTEXT> to every subagent

**SETUP:**

1. Read <SOURCE>, extract features, group into milestones
2. Create <STATE> with milestone/feature list (include SOURCE path and CONTEXT)

**GENERATION LOOP:**
For each milestone in <STATE>:
For each feature: 1. Spawn subagent: "Read .github/prompts/subagents/task_generator.prompt.md and generate TASK_XXX for [feature] in milestone [M]" 2. Update <STATE> 3. Spawn subagent: "Read .github/prompts/subagents/task_reviewer.prompt.md and review TASK_XXX" 4. Update <STATE>

After all features: 5. Spawn subagent: "Read .github/prompts/subagents/mvt_generator.prompt.md and generate MVT_MX" 6. Update <STATE>

**FINALIZATION:**

1. Spawn: "Read .github/prompts/subagents/progress_generator.prompt.md and create PROGRESS.md"
2. Spawn: "Read .github/prompts/subagents/final_reviewer.prompt.md and validate alignment"

**COMPLETION:**

1. Delete <STATE>
2. Report: milestones, tasks, MVTs created
```

---

## Subagent Prompt Files

Store each subagent prompt in its own file under `.github/prompts/subagents/`. This keeps orchestrator context minimal while giving subagents full instructions.

| File                           | Purpose                     |
| ------------------------------ | --------------------------- |
| `task_generator.prompt.md`     | Generates TASK_XXX files    |
| `task_reviewer.prompt.md`      | Reviews tasks for quality   |
| `mvt_generator.prompt.md`      | Creates MVT milestone tests |
| `progress_generator.prompt.md` | Creates PROGRESS.md         |
| `final_reviewer.prompt.md`     | Final alignment check       |

---

## Subagent Invocation Pattern

When spawning subagents, keep the prompt minimal. The subagent reads full instructions from its file.

**Pattern:**

```
"Read .github/prompts/subagents/{name}.prompt.md and execute.
Target: {specific target}
Context: {minimal context needed}"
```

**Examples:**

```markdown
# Task Generator

"Read .github/prompts/subagents/task_generator.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: TASK_003 for 'Selection Manager' in M1
Source ref: §2.3"

# Task Reviewer

"Read .github/prompts/subagents/task_reviewer.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: docs/tasks/TASK_003_selection_manager.md"

# MVT Generator

"Read .github/prompts/subagents/mvt_generator.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: MVT_M1 covering TASK_001-005"

# Progress Generator

"Read .github/prompts/subagents/progress_generator.prompt.md and execute.
Source: docs/my_spec.md"

# Final Reviewer

"Read .github/prompts/subagents/final_reviewer.prompt.md and execute.
Source: docs/my_spec.md"
```

---

## Task Format Reference (Brief)

```markdown
# TASK_XXX: [Name]

## Metadata

| Field          | Value            |
| -------------- | ---------------- |
| Milestone      | MX               |
| Priority       | High/Med/Low     |
| Complexity     | S/M/L/XL         |
| Dependencies   | TASK_YYY or None |
| Plan Reference | §X.Y             |

## Description

[What and why]

## Acceptance Criteria

- [ ] Criterion (per plan §X.Y)

## Technical Approach

[Architecture, algorithm, integration]

## Files to Create/Modify

| File | Action | Purpose |

## Testing Strategy

- [ ] Tests

## Out of Scope

[Exclusions]
```

---

## MVT Format Reference (Brief)

```markdown
# MVT_MX: [Milestone] - Manual Verification Test

## Metadata

| Field          | Value               |
| -------------- | ------------------- |
| Dependencies   | All milestone tasks |
| Estimated Time | X minutes           |

## Prerequisites

- All tasks COMPLETE
- Tests pass

## Test Cases

| Step | Action | Expected | Pass/Fail |

## Pass/Fail Criteria

- ALL test cases must pass
- No crashes
```

---

## Key Rules

### Orchestrator (Coordinator Only)

- **NEVER** write task content
- **ALWAYS** spawn subagents for generation
- Track via GENERATION_STATE.md
- Spawn SEQUENTIALLY

### Subagents (Full Context, Isolated)

- Read instructions from `.github/prompts/subagents/`
- Update GENERATION_STATE.md on complete
- Return summary to orchestrator

### Milestones

- 3-7 tasks each
- Every milestone has MVT
- MVT depends on ALL milestone tasks

---

## Error Handling

| Situation        | Action                    |
| ---------------- | ------------------------- |
| Subagent fails   | Retry once, then escalate |
| Plan ambiguity   | Note in task, continue    |
| Dependency cycle | Break weakest link        |
| MVT fails        | Retry with more context   |

---

## Completion Criteria

1. All plan features have tasks
2. All tasks reviewed
3. Every milestone has MVT
4. PROGRESS.md created
5. Final review ≥8/10
6. GENERATION_STATE.md deleted

---

## Quick Start

1. Create subagent prompts in `.github/prompts/subagents/`
2. Ensure plan at `docs/plan.md`
3. Run orchestrator with `#runSubagent` access
4. Monitor `docs/GENERATION_STATE.md`
5. Output: `docs/tasks/`, `docs/PROGRESS.md`
