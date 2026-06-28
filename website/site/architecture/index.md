---
title: Architecture
description: Module organisation, dependency boundaries, and design principles of the speci codebase.
---

# Architecture

This page describes the module boundaries, dependency rules, and design principles of the speci codebase.

## Architectural Principles

1. **Dependency Inversion** — high-level modules depend on abstractions (interfaces), not concrete implementations.
2. **Single Responsibility** — each module has one clear purpose.
3. **Minimal Coupling** — modules interact through well-defined interfaces, not direct imports.
4. **Testability First** — all modules can be tested in isolation using interface mocks.

## Module map

```
bin/
  speci.ts            ← CLI entry point (commander)

lib/
  types.ts            ← shared types & enums (no deps)
  interfaces/         ← DI interface contracts
  commands/           ← command implementations (run, plan, task, …)
  adapters/           ← concrete interface implementations (Node.js)
  config/             ← config file loading & validation
  cli/                ← command registry + initialise()
  ui/                 ← terminal output helpers
  utils/              ← pure utility helpers
  validation/         ← input / path / config validators
  state.ts            ← PROGRESS.md state machine helpers
  copilot.ts          ← Copilot CLI invocation helpers
  errors.ts           ← structured error codes (ERR-PRE-*, ERR-INP-*, ERR-EXE-*, ERR-STA-*)
  constants.ts        ← shared constants
```

## Core modules

### `lib/types.ts` — Shared type definitions

Pure types module with **zero runtime dependencies**. All other modules import types from here rather than from implementation modules.

Key exports: `STATE` enum, `SpeciConfig`, `AgentRunResult`, `GateResult`, `LockFileData`, `CommandName`, and more.

### `lib/interfaces/` — Dependency injection contracts

Defines the `CommandContext` shape: a bundle of injected dependencies (`IFileSystem`, `ILogger`, `IConfigLoader`, `ICopilotRunner`, `IStateReader`, `ILockManager`, `IGateRunner`, `IPreflight`, `ISignalManager`) that every command receives.

Commands never `import` Node.js APIs directly — they use the injected abstractions.

### `lib/adapters/` — Concrete implementations

Node.js implementations of every interface in `lib/interfaces/`. Tests swap these out for lightweight in-memory fakes.

### `lib/commands/` — Command implementations

Each file exports a single `async function <name>Command(ctx: CommandContext): Promise<CommandResult>`. Commands are pure business logic — no I/O outside the injected context.

### `lib/config/` — Configuration loading

Walks up the directory tree to find `speci.config.json`, parses and validates it, and merges defaults. All config access in commands goes through `ctx.config`.

### `lib/validation/` — Validators

- `ConfigValidator` — ensures the config file schema is valid.
- `InputValidator` — validates CLI flag combinations (e.g. requires `--prompt` or `--input`).
- `PathValidator` — ensures paths exist, are readable, and are within the project root.

## Dependency rules

```
bin → cli → commands → interfaces ← adapters
                     ↘
                      types (no deps)
```

- `types.ts` has **no** imports from other `lib/` modules.
- `interfaces/` imports only from `types.ts`.
- `commands/` import from `interfaces/` and `types.ts` — **never** from `adapters/`.
- `adapters/` are wired together in `lib/adapters/context-factory.ts`.
- `bin/speci.ts` calls `cli/initialize.ts` which calls `context-factory.ts`.

## Testing approach

Unit tests pass fake adapter implementations via `CommandContext`. The `lib/adapters/test-context.ts` helper builds a fully in-memory context for fast, hermetic tests. Integration tests use real adapters against temp directories.
