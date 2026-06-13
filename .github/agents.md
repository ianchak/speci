# Copilot Agent Context: speci

## Project Overview

**speci** is a TypeScript ESM CLI tool (Node ≥22) that orchestrates Copilot-driven development workflows. It dispatches AI agents through a structured loop — **Plan → Task → Run** — with quality gates (lint / typecheck / test) between iterations, retry/fix logic, and lock-file concurrency control. It ships as the `speci` npm package with a single runtime dependency (`commander`).

- Entry point: `bin/speci.ts` → compiled to `dist/bin/speci.js`
- Configuration file: `speci.config.json` (walked up from cwd)
- Agent templates: `templates/agents/speci-*.agent.md`
- Installed agent dir: `.github/agents/` (separate from this file)

---

## Architecture: Ports & Adapters

The codebase is strictly layered. Depend inward — never outward.

```
lib/types.ts          ← pure types & enums (zero runtime deps)
lib/interfaces/       ← DI contracts (I-prefixed; no implementations)
lib/errors.ts         ← structured error codes & factory
lib/config/           ← config loading, defaults, env overrides, path resolution
lib/state.ts          ← PROGRESS.md parsing → STATE enum
lib/copilot.ts        ← copilot CLI wrapper
lib/commands/         ← business logic commands
lib/adapters/         ← Node.js implementations of interfaces
lib/cli/              ← commander setup, command registration
lib/ui/               ← terminal rendering, colours, glyphs, progress
lib/utils/helpers/    ← shared command helpers (init, build names, prompts)
lib/utils/infrastructure/ ← low-level utilities (logger, errors, gates, locks)
lib/validation/       ← input & config validation
```

### Key types (lib/types.ts)

- `STATE` enum — `WORK_LEFT | IN_REVIEW | BLOCKED | DONE | NO_PROGRESS`
- `SpeciConfig` — runtime config shape (`paths`, `copilot`, `gate`, `loop`)
- `CommandResult` — `{ success: boolean; exitCode: number; error?: string }`
- `AgentRunResult` — discriminated union on `isSuccess`
- `GateResult`, `TaskStats`, `CurrentTask`, `CommandName`

### DI interfaces (lib/interfaces/)

Barrel-exported from `lib/interfaces/index.ts`.

| Interface | Domain |
|---|---|
| `IFileSystem` | fs reads/writes/checks |
| `ILogger` | `info` / `warn` / `error` / `success` / `debug` / `muted` / `raw` (+ `*Plain` variants, `setVerbose`) |
| `IProcess` | process.env, cwd, exit |
| `IConfigLoader` | config discovery & loading |
| `ICopilotRunner` | spawns copilot agent |
| `IStateReader` | parses PROGRESS.md |
| `ILockManager` | lock-file lifecycle |
| `IGateRunner` | runs lint/typecheck/test gate |
| `IPreflight` | pre-run checks |
| `ISignalManager` | SIGINT/SIGTERM handling |

**`CommandContext`** (`lib/interfaces/command.ts`) is the DI container passed to every command — it carries all of the above.

### Adapters (lib/adapters/)

- `node-*.ts` files are the Node.js implementations (never import these directly in domain code).
- `context-factory.ts` → `createProductionContext()` wires all production adapters.
- `test-context.ts` provides a mock context for tests.

---

## Coding Standards

### TypeScript

- **Target**: ES2022, NodeNext module resolution, `strict: true`
- **Extra strictness**: `noUnusedLocals`, `noUnusedParameters` (prefix unused params with `_`), `noImplicitReturns`, `noFallthroughCasesInSwitch`
- **No `any`**: `@typescript-eslint/no-explicit-any` is an error
- Import pure types with the `type` keyword to avoid circular deps

### Imports

```typescript
// ✅ Correct
import { join } from 'node:path';
import { getDefaults } from '@/config/index.js';
import type { SpeciConfig } from '@/types.js';

// ❌ Wrong
import { getDefaults } from '../../config/index';  // no alias, no .js
import { SpeciConfig } from '@/types.js';           // missing `type`
```

Rules:
1. Use `@/` path aliases (maps to `lib/`) — never deep relative paths
2. Always include `.js` extension (ESM requirement)
3. Group order: `node:*` builtins → external packages → `@/` aliases → relative
4. Obtain types from `lib/types.ts` or `lib/interfaces/`; never from implementations

### Naming

| Thing | Convention |
|---|---|
| Files | `kebab-case.ts` |
| Classes | `PascalCase` |
| Infrastructure interfaces | `IPascalCase` (e.g. `IFileSystem`) |
| Functions | `camelCase` |
| Constants | `UPPER_SNAKE_CASE` |
| Enums & values | `PascalCase` |
| Test files | `source-name.test.ts` |

### Style

- JSDoc on all public exports: `@param`, `@returns`, `@throws`, `@example`
- No barrel re-exports unless creating a deliberate public API (like `lib/interfaces/index.ts`)
- Avoid circular dependencies — use the type layer to break cycles

---

## Command Pattern

Every command follows this exact signature:

```typescript
export async function myCommand(
  options: MyCommandOptions,
  context: CommandContext,
  preloadedConfig?: SpeciConfig
): Promise<CommandResult>
```

Rules:
- **Never call `process.exit()`** — return `{ success: false, exitCode: 1, error: '...' }` instead
- Always use injected `context.logger`, `context.fs`, `context.process` — never global equivalents
- Use `initializeCommand()` from `lib/utils/helpers/command-helpers.ts` to load config and run preflight
- Use `failResult()` from `lib/utils/infrastructure/error-handler.ts` to convert errors to `CommandResult`

### Adding a new command

1. Create `lib/commands/mycommand.ts` with the standard function signature above
2. Add `registerMyCommandCommand()` to `CommandRegistry` in `lib/cli/command-registry.ts` and call it from `registerCommands()`
3. Create `test/commands/mycommand.test.ts` (mirrors lib structure)
4. If the command dispatches an agent, add `templates/agents/speci-mycommand.agent.md`

---

## Error Handling

All error codes live in `lib/errors.ts` as the `ERROR_CODES` map.

| Prefix | Category |
|---|---|
| `ERR-PRE-*` | Prerequisites / preflight |
| `ERR-INP-*` | Input validation |
| `ERR-STA-*` | State / PROGRESS.md |
| `ERR-EXE-*` | Execution / runtime |
| `ERR-UI-*` | UI rendering |

- Use `createError(code, contextJson?)` (from `lib/errors.ts`) to create structured errors; `formatError()` renders them for display
- Convert errors to `CommandResult` with `failResult()` / `failValidation()`, or handle them with `handleCommandError()` (from `lib/utils/infrastructure/error-handler.ts`)
- Check existing codes before adding new ones

---

## Testing

**Framework**: Vitest 4, Node environment, globals enabled.

| Suite | Files | Timeout |
|---|---|---|
| Unit | `test/**/*.test.ts` (excl. `integration/`) | default |
| Integration | `test/integration/**/*.integration.test.ts` | 30 s, forks pool |

**Coverage targets**: lines/statements/branches ≥ 80%, functions ≥ 70%.

Conventions:
- `test/` mirrors `lib/` exactly (e.g. `lib/commands/init.ts` → `test/commands/init.test.ts`)
- Mock via interface contracts — use `test-context.ts` mock factories, not concrete adapters
- Isolate filesystem tests with `tmpdir`; clean up in `afterEach`
- Describe blocks use full descriptions; test names use imperative mood (`should return CommandResult on success`)
- Integration tests perform real I/O; unit tests must be pure/mocked

---

## Build & Tooling

```
npm run gate            # lint + typecheck + test (run before marking work done)
npm run build           # tsc + tsc-alias (compiles to dist/, resolves path aliases)
npm run dev             # build, then run dist/bin/speci.js
npm run typecheck       # tsc --noEmit (type-check only)
npm run lint            # eslint .
npm run format          # prettier --write **/*.{ts,json,md}
npm run test            # vitest unit tests
npm run test:coverage   # unit tests + coverage report
npm run test:integration # integration tests
npm run test:all        # unit + integration
npm run changeset       # create a .changeset/*.md entry
npm run version-packages # bump versions from changeset files
npm run release         # publish to npm
```

- Husky is installed via the `prepare` script; the `.husky/pre-push` hook runs `npm run gate` before every push
- `npm run gate` is the quality gate — CI runs the same sequence

---

## Configuration Layering

Config is resolved in this priority order (later wins):

1. Hardcoded defaults → `getDefaults()` in `lib/config/index.ts`
2. File config → `speci.config.json` loaded by `lib/config/loader.ts` (walks up from cwd)
3. Environment overrides → `lib/config/env-overrides.ts`
4. CLI flags → passed as `options` to the command function

---

## Key Constants (lib/constants.ts)

```typescript
CONFIG_FILENAME        // 'speci.config.json'
AGENT_FILENAME_PREFIX  // 'speci-'
ENV.SPECI_DEBUG        // 'SPECI_DEBUG'
ENV.NO_COLOR           // 'NO_COLOR'
EXIT_CODE.SUCCESS      // 0
EXIT_CODE.ERROR        // 1
EXIT_CODE.SIGINT       // 130
EXIT_CODE.SIGTERM      // 143
DEFAULT_PATHS.*        // PROGRESS, TASKS, LOGS, LOCK file paths
MESSAGES.*             // user-facing message strings
```

Always use these constants instead of hard-coding string literals.

---

## Do / Don't

| Do | Don't |
|---|---|
| Use `@/` aliases + `.js` extension in imports | Use relative `../../` paths or bare names |
| Return `CommandResult` from commands | Call `process.exit()` in command code |
| Inject deps via `CommandContext` | Import `node-*` adapters directly in domain code |
| Add types to `lib/types.ts` | Scatter type definitions across implementation files |
| Use `createError()` with an `ERROR_CODES` entry | Throw raw `Error` strings |
| Run `npm run gate` before considering work done | Skip lint/typecheck/tests |
| Prefix unused function params with `_` | Leave unused params without `_` prefix |
| Write tests in `test/` mirroring `lib/` | Put tests next to source in `lib/` |
