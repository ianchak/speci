---
title: speci init
description: Initialise speci in your project.
sitemap:
  priority: 0.7
  changefreq: monthly
---

# `speci init`

Initialise speci in an existing project. Creates `speci.config.json`, sets up `copilot.models` from the live Copilot model list, and copies the built-in agent templates into `.github/agents/`.

## Usage

```bash
speci init [-u] [-v] [--preset <best|balanced|budget>] [--custom] [--reconfigure-models]
```

## Options

| Flag                    | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `-u, --update-agents`   | Update agent files even if they already exist                            |
| `--preset <preset>`     | Model preset: `best`, `balanced`, or `budget` (pre-selects menu default) |
| `--custom`              | Configure `copilot.models` role-by-role from the live model list         |
| `--reconfigure-models`  | Update `copilot.models` in an existing `speci.config.json`               |
| `-v, --verbose`         | Show detailed output                                                     |

## Model selection

On first init, speci fetches the live Copilot model list and presents a menu so you can choose how to configure `copilot.models`:

```
? Choose a model preset:
  1. Best-in-Class
  2. Balanced
  3. Budget-Friendly
  4. Custom (one-by-one)
```

- **Preset** — assigns the best available model to each role automatically.
- **Custom** — prompts you to pick a model for each of the seven roles: `plan`, `task`, `refactor`, `impl`, `review`, `fix`, and `tidy`.

Passing `--preset <value>` pre-selects the matching menu option so you can confirm or change it interactively. In non-interactive (CI) environments the preset is applied directly with no prompt.

Use `--reconfigure-models` to revisit model selection on an existing config; `--preset` then applies the preset immediately without showing a menu.

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
