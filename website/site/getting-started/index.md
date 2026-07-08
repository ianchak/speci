---
title: Getting Started
description: Install speci and run your first Copilot workflow in minutes.
sitemap:
  priority: 0.9
  changefreq: monthly
---

# Getting Started

## Prerequisites

- **Node.js** ≥ 22
- **GitHub Copilot CLI** installed and authenticated (`npm install -g @github/copilot`)
- A Git repository

## Install

```bash
# One-off with npx (no install needed)
npx speci init

# Or install globally
npm install -g speci
```

## Initialise your project

```bash
npx speci init
```

This creates a `speci.config.json` in your project root, creates `docs/tasks/` and `.speci-logs/` directories, and copies the built-in agent templates into `.github/agents/`.

## Run your first workflow

```bash
# 1. Generate a plan from a prompt
npx speci plan -p "Add user authentication with JWT" --output docs/plan.md

# 2. Break the plan into tasks
npx speci task --plan docs/plan.md

# 3. Start the implementation loop
npx speci run
```

## One-shot (yolo) mode

```bash
# Plan → task → run in a single command
npx speci yolo -p "Add user authentication with JWT"
```

## Configuration

Speci reads `speci.config.json` in your project root. A minimal config looks like:

```json
{
  "version": "1.0.0",
  "gate": {
    "commands": ["npm run lint", "npm run typecheck", "npm test"],
    "maxFixAttempts": 5,
    "strategy": "sequential"
  }
}
```

See the [command reference](/commands/) for all available options.
