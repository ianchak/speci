---
title: speci plan
description: Generate a structured implementation plan via GitHub Copilot.
---

# `speci plan`

Interactive plan generation via GitHub Copilot CLI.

## Usage

```bash
speci plan --prompt "Build a REST API" --input docs/spec.md --output docs/plan.md [--verbose]
```

## Options

| Flag | Description |
|------|-------------|
| `-p, --prompt <text>` | Free-text prompt describing the feature or change |
| `-i, --input <files...>` | One or more input files (spec, design docs, etc.) |
| `-o, --output <path>` | Path to write the generated plan (default: `docs/plan.md`) |
| `--verbose` | Show the full prompt and agent output |

At least one of `--prompt` or `--input` is required.

## Flow

1. **Validate inputs** — ensures `--prompt` or `--input` is provided and that input files exist.
2. **Initialise** — loads `speci.config.json`, runs preflight checks (Copilot CLI available?), resolves the `speci-plan` agent.
3. **Build prompt** — combines input file references, the `--prompt` text, and the `--output` path hint.
4. **Dispatch agent** — runs the `speci-plan.agent.md` via Copilot CLI and streams output.
5. **Write plan** — saves the generated plan to the output path.

## Example

```bash
speci plan -p "Add OAuth2 login with GitHub" --output docs/auth-plan.md
```

Next: run [`speci task`](/commands/task/) to break the plan into tasks.
