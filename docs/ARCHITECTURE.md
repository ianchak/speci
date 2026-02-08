# Speci Architecture Documentation

## Module Organization

This document describes the module boundaries, dependencies, and responsibilities across the Speci codebase. Understanding these boundaries is critical for maintaining code quality and preventing circular dependencies.

## Architectural Principles

1. **Dependency Inversion**: High-level modules depend on abstractions (interfaces), not concrete implementations
2. **Single Responsibility**: Each module has one clear purpose and responsibility
3. **Minimal Coupling**: Modules interact through well-defined interfaces, not direct imports
4. **Testability First**: All modules can be tested in isolation using interface mocks

## Core Modules

### `lib/types.ts` - Shared Type Definitions

**Purpose**: Central location for shared interfaces and type definitions used across the codebase.

**Exports**:
- `STATE` enum - Orchestration state machine values
- `SpeciConfig` - Configuration structure
- `TaskStats` - Task statistics
- `CurrentTask` - Current task metadata
- `CommandName` - Valid command/agent names
- `CopilotArgsOptions` - Copilot CLI argument options
- `AgentRunResult` - Agent execution result (discriminated union)

**Dependencies**: NONE (pure types module)

**Usage**: Import types from here instead of implementation modules to reduce coupling.

```typescript
// ✅ Good - import from types
import type { SpeciConfig, STATE } from '@/types.js';

// ❌ Avoid - import from implementation
import type { SpeciConfig } from '@/config.js';
```

**Design Rules**:
- NO runtime dependencies on other lib/ modules
- Only type definitions and enums (minimal runtime code)
- Interfaces should be stable and change infrequently
- Limit to ~10 most commonly used types

---

### `lib/interfaces.ts` - Dependency Injection Interfaces

**Purpose**: Define interface contracts for dependency injection (filesystem, process, logger, config, etc.).

**Exports**:
- `IFileSystem` - Filesystem operations abstraction
- `IProcess` - Process and environment abstraction
- `ILogger` - Logging interface
- `IConfigLoader` - Configuration loading interface
- `ICopilotRunner` - Copilot CLI execution interface
- `CommandContext` - Dependency injection context for commands
- `CommandResult` - Standard command result shape

**Dependencies**: `@/types.js` (for `SpeciConfig`, `AgentRunResult`, `CopilotArgsOptions`)

**Usage**: All commands receive a `CommandContext` with injected dependencies.

```typescript
export async function runCommand(ctx: CommandContext): Promise<CommandResult> {
  // Use injected dependencies
  const config = await ctx.config.load();
  ctx.logger.info('Starting...');
  // ...
}
```

---

### `lib/config.ts` - Configuration Loader

**Purpose**: Load, validate, and merge configuration from `speci.config.json`.

**Responsibilities**:
- Find config file by walking up directory tree
- Parse and validate JSON
- Merge with defaults
- Apply environment variable overrides
- Resolve agent and template paths

**Exports**:
- `SpeciConfig` type (re-exported from `@/types.js`)
- `loadConfig()` - Main config loading function
- `validateConfig()` - Config validation
- `resolveAgentPath()` - Agent path resolution
- Various template path helpers

**Dependencies**:
- `@/types.js` - For `SpeciConfig` type
- `@/interfaces.js` - For `IProcess` interface
- `@/utils/logger.js` - For logging
- `@/constants.js` - For config filename constants
- `node:fs`, `node:path`, `node:url` - Node built-ins

**Module Boundary**: Other modules should import `SpeciConfig` type from `@/types.js`, not from here.

---

### `lib/state.ts` - State Parser

**Purpose**: Read and parse `PROGRESS.md` to determine orchestration state.

**Responsibilities**:
- Detect current state (WORK_LEFT, IN_REVIEW, BLOCKED, DONE, NO_PROGRESS)
- Parse task statistics (total, completed, remaining, etc.)
- Extract current task information
- Provide state-detection patterns

**Exports**:
- `STATE` enum (re-exported from `@/types.js`)
- `TaskStats` interface (re-exported from `@/types.js`)
- `CurrentTask` interface (re-exported from `@/types.js`)
- `getState()` - Main state detection function
- `getTaskStats()` - Task statistics aggregation
- `getCurrentTask()` - Current task extraction

**Dependencies**:
- `@/types.js` - For `STATE`, `TaskStats`, `CurrentTask`, `SpeciConfig`
- `node:fs/promises`, `node:fs` - For file I/O

**Module Boundary**: Other modules should import `STATE` enum from `@/types.js`, not from here.

---

### `lib/copilot.ts` - Copilot CLI Wrapper

**Purpose**: Invoke GitHub Copilot CLI with proper argument handling and retry logic.

**Responsibilities**:
- Build copilot CLI arguments from config
- Execute copilot CLI via child_process.spawn
- Implement retry logic with exponential backoff
- Handle stdio and process lifecycle

**Exports**:
- `CommandName` type (re-exported from `@/types.js`)
- `CopilotArgsOptions` interface (re-exported from `@/types.js`)
- `AgentRunResult` type (re-exported from `@/types.js`)
- `buildCopilotArgs()` - CLI argument builder
- `runAgent()` - Main agent execution function

**Dependencies**:
- `@/types.js` - For all types
- `@/utils/logger.js` - For logging
- `@/constants.js` - For agent filename helpers
- `node:child_process` - For process spawning

**Module Boundary**: Other modules should import copilot types from `@/types.js`, not from here.

---

## Command Modules

All command modules follow the same pattern:

**Location**: `lib/commands/*.ts`

**Responsibilities**:
- Accept `CommandContext` with injected dependencies
- Execute command logic
- Return `CommandResult`
- Handle initialization via `initializeCommand()` helper

**Standard Dependencies**:
- `@/interfaces.js` - For `CommandContext`, `CommandResult`
- `@/adapters/context-factory.js` - For production context creation
- `@/utils/command-helpers.js` - For shared initialization
- `@/ui/*.js` - For terminal output
- Implementation-specific modules as needed

**Commands**:
- `init.ts` - Project initialization
- `plan.ts` - Generate implementation plan
- `task.ts` - Generate task breakdown
- `refactor.ts` - Generate refactoring plan
- `run.ts` - Orchestration loop
- `status.ts` - Show current status

---

## Utility Modules

### `lib/utils/` - Shared Utilities

**Purpose**: Reusable functionality across commands.

**Key Modules**:
- `command-helpers.ts` - Shared command initialization logic
- `gate.ts` - Quality gate execution (lint, typecheck, test)
- `lock.ts` - Lock file management
- `logger.ts` - Logging utilities
- `preflight.ts` - Pre-execution checks
- `signals.ts` - Signal handling (SIGINT, SIGTERM)

**Dependencies**: Vary by module, but all should:
- Import types from `@/types.js` when possible
- Accept injected dependencies (no direct global access)
- Be testable in isolation

---

## Adapter Modules

### `lib/adapters/` - Dependency Injection Adapters

**Purpose**: Concrete implementations of DI interfaces.

**Key Modules**:
- `context-factory.ts` - Create production CommandContext
- `node-config-loader.ts` - IConfigLoader implementation
- `node-copilot-runner.ts` - ICopilotRunner implementation
- `node-filesystem.ts` - IFileSystem implementation
- `node-logger.ts` - ILogger implementation
- `node-process.ts` - IProcess implementation
- `test-context.ts` - Test context factory with mocks

**Dependencies**:
- `@/interfaces.js` - For interface definitions
- `@/types.js` - For type definitions
- Implementation-specific modules (config, copilot, logger, etc.)

---

## Dependency Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        lib/types.ts                         │
│            (Shared types, STATE enum - no deps)             │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ import types
                              │
┌──────────────────┬──────────┼──────────┬────────────────────┐
│                  │          │          │                    │
│  lib/config.ts   │  lib/state.ts  lib/copilot.ts           │
│                  │          │          │                    │
│  - loadConfig()  │  - getState()  - runAgent()             │
│  - validate()    │  - getStats()  - buildArgs()            │
│                  │          │          │                    │
└────────▲─────────┴──────────┴──────────┴──────────▲─────────┘
         │                                           │
         │ implement                                 │ use types
         │                                           │
┌────────┴───────────────────────────────────────────┴─────────┐
│                     lib/interfaces.ts                        │
│         (DI interfaces: IConfigLoader, ICopilotRunner)       │
└────────────────────────────────▲─────────────────────────────┘
                                 │
                                 │ implement
                                 │
┌────────────────────────────────┴─────────────────────────────┐
│                     lib/adapters/*.ts                        │
│     (Concrete implementations + context factory)             │
└────────────────────────────────▲─────────────────────────────┘
                                 │
                                 │ use context
                                 │
┌────────────────────────────────┴─────────────────────────────┐
│                    lib/commands/*.ts                         │
│            (Commands accept CommandContext)                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Import Guidelines

### ✅ DO:

1. Import types from `@/types.js` for commonly shared types:
   ```typescript
   import type { SpeciConfig, STATE } from '@/types.js';
   ```

2. Import interfaces from `@/interfaces.js` for DI contracts:
   ```typescript
   import type { CommandContext, ILogger } from '@/interfaces.js';
   ```

3. Use dependency injection in commands:
   ```typescript
   export async function myCommand(ctx: CommandContext): Promise<CommandResult>
   ```

4. Import implementation functions directly when needed:
   ```typescript
   import { loadConfig } from '@/config.js'; // in adapters only
   ```

### ❌ DON'T:

1. Import types from implementation modules:
   ```typescript
   // ❌ Bad - creates unnecessary coupling
   import type { SpeciConfig } from '@/config.js';
   ```

2. Import implementations in commands directly:
   ```typescript
   // ❌ Bad - bypasses dependency injection
   import { runAgent } from '@/copilot.js';
   ```

3. Create circular dependencies:
   ```typescript
   // ❌ Bad - A imports B, B imports A
   ```

4. Add runtime dependencies to `types.ts`:
   ```typescript
   // ❌ Bad - types.ts should have no imports
   import { log } from '@/utils/logger.js';
   ```

---

## Verification Tools

### Check for Circular Dependencies

```bash
npx madge --circular --extensions ts lib/
```

Should output: `✔ No circular dependency found!`

### Visualize Dependency Graph

```bash
npx madge --image graph.png lib/
```

Generates a visual dependency diagram.

### Count Import Edges

```bash
# Before refactoring
grep -r "^import.*from.*lib/" lib/ | wc -l

# After refactoring (should be lower)
```

---

## Future Improvements

1. **Layered Architecture**: Consider organizing into layers (Commands → Services → Core → Utils)
2. **Plugin System**: Allow custom commands/agents via plugin interface
3. **Event Bus**: Decouple modules further with event-driven communication
4. **Dependency Graph Enforcement**: Add lint rules to prevent invalid imports

---

## Related Documentation

- `TASK_018_reduce_cross_module_coupling.md` - Implementation task details
- `TASK_005_dependency_injection_interfaces.md` - DI architecture
- `REFACTORING_PLAN.md` - Overall refactoring strategy
- `PROGRESS.md` - Implementation progress tracking

---

_Last Updated: 2026-02-08_
_Related Task: TASK_018_
