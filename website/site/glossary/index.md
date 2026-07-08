---
title: Glossary
description: Key terms and concepts used across speci.
sitemap:
  priority: 0.6
  changefreq: monthly
---

# Glossary

This glossary defines the core terms used in speci docs, CLI output, and architecture.

| Term                         | Definition                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Agent                        | A Copilot prompt file that performs a specific role (for example `plan`, `impl`, or `review`).                                    |
| Agent dispatch               | The act of invoking a role-specific Copilot agent from a command or loop state.                                                   |
| Agent template               | A bundled markdown prompt under `templates/agents/` copied into `.github/agents/` by `speci init`.                                |
| BLOCKED (loop state)         | Loop state where remaining tasks cannot proceed, so the `tidy` agent is dispatched.                                               |
| Bundled agents               | Built-in agent templates shipped with speci. In config, setting an agent path to `null` uses bundled defaults.                    |
| CommandContext               | Dependency-injection object passed to commands, containing filesystem, logger, config loader, Copilot runner, and other adapters. |
| Custom agent path            | A user-specified path in `speci.config.json` that overrides a bundled agent template.                                             |
| Dependency Injection (DI)    | Design pattern where commands depend on interfaces (`CommandContext`) instead of concrete implementations.                        |
| Dry run                      | `speci run --dry-run` mode that prints intended actions without dispatching agents or running gates.                              |
| Environment override         | A `SPECI_*` environment variable that overrides config fields at runtime.                                                         |
| Error code                   | Structured diagnostic identifier like `ERR-PRE-01` or `ERR-EXE-04` used for consistent troubleshooting.                           |
| Fix agent                    | Agent dispatched after gate failures to attempt automated repairs.                                                                |
| Fix attempt                  | A single cycle of running the `fix` agent and re-running quality gates.                                                           |
| Gate                         | A validation command (lint, typecheck, test, etc.) run to verify code quality.                                                    |
| Gate strategy                | Execution mode for gates: `sequential` (default) or `parallel`.                                                                   |
| Human-in-the-loop mode       | `speci run --verify`; pauses at milestone validation boundaries (MVT checkpoints).                                                |
| impl agent                   | The implementation agent dispatched when loop state is `WORK_LEFT`.                                                               |
| IN_REVIEW (loop state)       | Loop state where tasks are ready for evaluation; dispatches the `review` agent.                                                   |
| Lock file                    | The `.speci-lock` file used to prevent concurrent `speci run` or `speci yolo` executions.                                         |
| maxFixAttempts               | Config value controlling how many automatic fix cycles run after gate failures.                                                   |
| maxIterations                | Maximum number of loop iterations allowed before `speci run` exits.                                                               |
| Milestone                    | A grouped section in `PROGRESS.md` used for tracking related tasks and MVT readiness.                                             |
| MVT (Manual Validation Task) | A manual validation checkpoint tied to a milestone. In verify mode, the loop pauses until the MVT is marked `COMPLETE`.           |
| NO_PROGRESS (loop state)     | State indicating no `PROGRESS.md` was found; usually resolved by running `speci task`.                                            |
| Preflight checks             | Startup validations (Copilot CLI, git repo, config, progress file, agents) before command execution.                              |
| PROGRESS.md                  | Central state file that tracks milestones, task statuses, and loop progression.                                                   |
| review agent                 | Agent dispatched when loop state is `IN_REVIEW` to evaluate completed implementation work.                                        |
| SpeciConfig                  | The validated runtime configuration object loaded from `speci.config.json` plus defaults and env overrides.                       |
| State cache                  | Short-lived cache used when reading `PROGRESS.md` repeatedly (default TTL: 200 ms).                                               |
| Task file                    | A generated markdown task artifact in `docs/tasks/` created by `speci task`.                                                      |
| Task status                  | Canonical per-task value in `PROGRESS.md`: `NOT STARTED`, `IN PROGRESS`, `IN REVIEW`, `BLOCKED`, or `COMPLETE`.                   |
| tidy agent                   | Agent dispatched when loop state is `BLOCKED` to clean up or unblock task dependencies.                                           |
| WORK_LEFT (loop state)       | Loop state where incomplete tasks remain; dispatches the `impl` agent.                                                            |
| yolo command                 | `speci yolo`, a single-command pipeline that runs `plan -> task -> run` with unattended flow.                                     |

## Related docs

- [Getting Started](/getting-started/)
- [Commands Overview](/commands/)
- [`speci run`](/commands/run/)
- [`speci task`](/commands/task/)
- [`speci plan`](/commands/plan/)
