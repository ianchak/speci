---
title: speci init
description: Initialise speci in your project.
sitemap:
  priority: 0.7
  changefreq: monthly
---

# `speci init`

Initialise speci in an existing project. Creates `speci.config.json` and copies the built-in agent templates into `.github/agents/`.

## Usage

```bash
speci init [-u] [-v]
```

## Options

| Flag                  | Description                                   |
| --------------------- | --------------------------------------------- |
| `-u, --update-agents` | Update agent files even if they already exist |
| `-v, --verbose`       | Show detailed output                          |

## What it creates

| File / Directory                         | Description                                      |
| ---------------------------------------- | ------------------------------------------------ |
| `speci.config.json`                      | Project configuration (gates, agent paths, etc.) |
| `docs/tasks/`                            | Directory for generated task files               |
| `.speci-logs/`                           | Directory for run log files                      |
| `.github/agents/speci-plan.agent.md`     | Plan generation agent                            |
| `.github/agents/speci-impl.agent.md`     | Implementation agent                             |
| `.github/agents/speci-review.agent.md`   | Review agent                                     |
| `.github/agents/speci-fix.agent.md`      | Gate failure fix agent                           |
| `.github/agents/speci-task.agent.md`     | Task generation agent                            |
| `.github/agents/speci-tidy.agent.md`     | Blocked-state tidy agent                         |
| `.github/agents/speci-refactor.agent.md` | Refactor analysis agent                          |
| `.github/agents/subagents/`              | 33 multi-pass subagent prompts                   |
