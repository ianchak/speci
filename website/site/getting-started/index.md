---
title: Getting Started
description: Install speci and run your first Copilot workflow in minutes.
---

# Getting Started

## Prerequisites

- **Node.js** ≥ 22
- **GitHub Copilot** with the Copilot CLI extension enabled in VS Code
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

This creates a `speci.config.json` in your project root and copies the built-in agent templates into `.github/agents/`.

## Run your first workflow

```bash
# 1. Generate a plan from a prompt
npx speci plan -p "Add user authentication with JWT"

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
  "gates": {
    "lint": "npm run lint",
    "typecheck": "npm run typecheck",
    "test": "npm test"
  }
}
```

See the [command reference](/commands/) for all available options.
