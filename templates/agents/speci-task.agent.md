---
name: speci-task
description: This custom agent generates implementation tasks from a source document using an orchestrator-subagent architecture for autonomous, focused task generation with quality reviews.
---

Generate implementation tasks from a source document using an orchestrator-subagent architecture for autonomous, focused task generation with quality reviews.

This prompt uses the orchestrator-subagent architecture optimized for **minimal orchestrator context**. The orchestrator only coordinates; all heavy generation work happens in spawned subagents.

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
.github/agents/subagents/          # Subagent prompt files
    ├── task_generator.prompt.md
    ├── task_reviewer.prompt.md
    ├── mvt_generator.prompt.md
    ├── progress_generator.prompt.md
    └── final_reviewer.prompt.md
```

---

## GENERATION_STATE.md Format

The orchestrator and subagents communicate through this file.

> **CRITICAL DISTINCTION:**
>
> - **Gen Status / Review Status** = Whether the task FILE was created and reviewed (tracked here)
> - **Implementation Status** = Whether the task WORK has been done (tracked in PROGRESS.md)
>
> When generation is complete, all tasks should have `Gen Status: COMPLETE` and `Review Status: COMPLETE` in this file, but `Status: NOT STARTED` in PROGRESS.md because no implementation work has been done yet.

```markdown
# Task Generation State

Last Updated: [ISO timestamp]

## Source Configuration

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Source Document** | {path to source, e.g., docs/plan.md} |
| **Context**         | {user-provided context or "None"}    |

## Milestone Overview

| Milestone | Name         | Tasks   | MVT    | Gen Status  |
| --------- | ------------ | ------- | ------ | ----------- |
| M1        | Core Systems | 001-005 | MVT_M1 | IN PROGRESS |
| M2        | Combat       | 006-012 | MVT_M2 | NOT STARTED |

## Generation Status (file creation, NOT implementation)

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
├── Identify integration points (components that must be wired together)
└── Create GENERATION_STATE.md

PHASE 1: GENERATION LOOP (spawn subagents)
├── For each milestone:
│   ├── For each feature: spawn task_generator
│   ├── For each task: spawn task_reviewer
│   ├── INTEGRATION CHECK: If milestone has 2+ components that interact,
│   │   spawn task_generator for an integration/wiring task
│   │   (covers: registration, imports, initialization, end-to-end test)
│   ├── Review integration task if generated
│   └── Spawn mvt_generator
└── Update GENERATION_STATE.md after each

PHASE 2: FINALIZATION (spawn subagents)
├── Spawn progress_generator
└── Spawn final_reviewer

PHASE 3: CLEANUP
├── Delete GENERATION_STATE.md
└── Report summary
```

### Orchestrator Prompt

```markdown
<SOURCE>{user-provided-path}</SOURCE>
<CONTEXT>{user-provided-context or empty}</CONTEXT>
<STATE>docs/GENERATION_STATE.md</STATE>
<SUBAGENT_PROMPTS>.github/agents/subagents/</SUBAGENT_PROMPTS>

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
For each feature: 1. Spawn subagent: "Read .github/agents/subagents/task_generator.prompt.md and generate TASK_XXX for [feature] in milestone [M]" 2. Update <STATE> 3. Spawn subagent: "Read .github/agents/subagents/task_reviewer.prompt.md and review TASK_XXX" 4. Update <STATE>

After all features in a milestone: 5. INTEGRATION CHECK: Review the plan's Section 3.4 (Integration Map) and Section 4 Phase 3 (Integration & Wiring). If multiple components in this milestone need to be wired together, registered in entry points, or connected to existing systems:

- Spawn task_generator for a dedicated integration task (e.g., TASK_XXX_integrate_milestone_components)
- This task should cover: importing new modules, registering in routers/registries, updating config/initialization, adding end-to-end integration tests
- The integration task should depend on ALL component tasks it wires together
- Review the integration task

6. Spawn subagent: "Read .github/agents/subagents/mvt_generator.prompt.md and generate MVT_MX" 7. Update <STATE>

**FINALIZATION:**

1. Spawn: "Read .github/agents/subagents/progress_generator.prompt.md and create PROGRESS.md. CRITICAL: All tasks must have Status: NOT STARTED because no implementation work has been done yet."
2. Spawn: "Read .github/agents/subagents/final_reviewer.prompt.md and validate alignment. Verify all tasks in PROGRESS.md are marked NOT STARTED."

**COMPLETION:**

1. Delete <STATE>
2. Report: milestones, tasks, MVTs created
3. Confirm: "All tasks are marked NOT STARTED, ready for implementation"
```

---

## Subagent Prompt Files

Store each subagent prompt in its own file under `.github/agents/subagents/`. This keeps orchestrator context minimal while giving subagents full instructions.

| File                           | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `task_generator.prompt.md`     | Generates TASK_XXX files                             |
| `task_reviewer.prompt.md`      | Reviews tasks for quality                            |
| `mvt_generator.prompt.md`      | Creates MVT milestone tests                          |
| `progress_generator.prompt.md` | Creates PROGRESS.md (all tasks start as NOT STARTED) |
| `final_reviewer.prompt.md`     | Final alignment check                                |

---

## Subagent Invocation Pattern

When spawning subagents, keep the prompt minimal. The subagent reads full instructions from its file.

**Pattern:**

```
"Read .github/agents/subagents/{name}.prompt.md and execute.
Target: {specific target}
Context: {minimal context needed}"
```

**Examples:**

```markdown
# Task Generator

"Read .github/agents/subagents/task_generator.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: TASK_003 for 'Selection Manager' in M1
Source ref: §2.3"

# Task Reviewer

"Read .github/agents/subagents/task_reviewer.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: docs/tasks/TASK_003_selection_manager.md"

# MVT Generator

"Read .github/agents/subagents/mvt_generator.prompt.md and execute.
Source: docs/my_spec.md
Context: REST API with Express.js
Target: MVT_M1 covering TASK_001-005"

# Progress Generator

"Read .github/agents/subagents/progress_generator.prompt.md and execute.
Source: docs/my_spec.md
CRITICAL: All tasks must have Status: NOT STARTED in PROGRESS.md.
Generation being complete does NOT mean implementation is complete."

# Final Reviewer

"Read .github/agents/subagents/final_reviewer.prompt.md and execute.
Source: docs/my_spec.md"
```

---

## Task Format Reference

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

## MVT Format Reference

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

## PROGRESS.md Format Reference

> **CRITICAL**: All tasks MUST be marked `NOT STARTED` when PROGRESS.md is generated. This file tracks IMPLEMENTATION status, not generation status.

```markdown
# Project Name - Implementation Progress

## Status Legend

| Marker      | Meaning                        |
| ----------- | ------------------------------ |
| COMPLETE    | Task implemented and verified  |
| IN PROGRESS | Currently being implemented    |
| IN REVIEW   | Implementation done, in review |
| NOT STARTED | Task not yet begun             |
| BLOCKED     | Waiting on dependency          |

## Progress Summary

| Milestone | Name         | Tasks   | Complete | Total | Status      |
| --------- | ------------ | ------- | -------- | ----- | ----------- |
| M1        | Core Systems | 001-005 | 0        | 6     | NOT STARTED |

## Milestone: M1 - Core Systems

| Task ID  | Title        | Status      | Priority | Complexity | Dependencies |
| -------- | ------------ | ----------- | -------- | ---------- | ------------ |
| TASK_001 | Spatial Hash | NOT STARTED | HIGH     | M (4-8h)   | None         |
| TASK_002 | Pathfinding  | NOT STARTED | HIGH     | L (8-16h)  | TASK_001     |
| MVT_M1   | Manual Test  | NOT STARTED | —        | 30 min     | TASK_001-002 |
```

**Key Points for Progress Generator:**

- Every task status = `NOT STARTED`
- Every MVT status = `NOT STARTED`
- Complete column = `0` for all milestones
- Milestone Status = `NOT STARTED`
- This is a TODO list, not a completion report

---

## Key Rules

### Orchestrator (Coordinator Only)

- **NEVER** write task content
- **ALWAYS** spawn subagents for generation
- Track via GENERATION_STATE.md
- Spawn SEQUENTIALLY

### Subagents (Full Context, Isolated)

- Read instructions from `.github/agents/subagents/`
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

1. All plan features have tasks (task files created)
2. All tasks reviewed (task content validated)
3. Every milestone has MVT
4. PROGRESS.md created with **ALL tasks marked as NOT STARTED**
5. Final review ≥8/10
6. GENERATION_STATE.md deleted

> **IMPORTANT**: "Completion" here means task GENERATION is complete, not task IMPLEMENTATION. The PROGRESS.md file should show all tasks as `NOT STARTED` because the actual implementation work hasn't begun yet. This file tracks what needs to be built, not what has been built.
