---
title: speci refactor
description: Analyse the codebase for refactoring opportunities via Copilot.
sitemap:
  priority: 0.7
  changefreq: monthly
---

# `speci refactor`

One-shot codebase refactoring analysis via GitHub Copilot CLI. Dispatches the `speci-refactor` agent to identify and document refactoring opportunities.

## Usage

```bash
speci refactor [-s <path-or-glob>] [-o <path>] [-v]
```

## Options

| Flag                         | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `-s, --scope <path-or-glob>` | Limit analysis to a path or glob pattern (e.g. `src/utils`, `lib/**`) |
| `-o, --output <path>`        | Path to write the refactoring analysis                                |
| `-v, --verbose`              | Show the full prompt and agent output                                 |

## Flow

1. **Scope validation** — if `--scope` is a path (not a glob), resolves it and warns if it doesn't exist (non-fatal). Glob patterns are passed as-is.
2. **Initialise** — loads config, runs preflight, resolves the `speci-refactor` agent.
3. **Dispatch agent** — runs `speci-refactor.agent.md` with the scope context.
4. **Write output** — saves the refactoring analysis to the output file.

## Example

```bash
speci refactor --scope src/api --output docs/api-refactor.md
```
