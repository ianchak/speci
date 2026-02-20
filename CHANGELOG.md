# speci

## 0.8.5

### Patch Changes

- [`2eb4ba0`](https://github.com/ianchak/speci/commit/2eb4ba00be0523d605a775aa3449cc75cd1f70ff) Thanks [@ianchak](https://github.com/ianchak)! - fix(yolo): release yolo-held lock before run phase to prevent ERR-STA-01 lock conflict

## 0.8.4

### Patch Changes

- [`32dd044`](https://github.com/ianchak/speci/commit/32dd04436cf005c360e3aeeb18e7d93d3135fdfb) Thanks [@ianchak](https://github.com/ianchak)! - fix(pkg): add license and author fields to package.json and create LICENSE file for npm detection

## 0.8.3

### Patch Changes

- [`e4bc74f`](https://github.com/ianchak/speci/commit/e4bc74f39c265c04a1e43ecaf14827c1dfb81b58) Thanks [@ianchak](https://github.com/ianchak)! - fix(yolo): align default plan output path and --output prompt with plan agent's implementation_plan naming convention

## 0.8.2

### Patch Changes

- [`b251188`](https://github.com/ianchak/speci/commit/b251188a98be10b107d6cec21ee5ce5b414b8907) Thanks [@ianchak](https://github.com/ianchak)! - fix(plan): embed --output path in prompt instead of passing as a CLI flag to Copilot

## 0.8.1

### Patch Changes

- [`5245d03`](https://github.com/ianchak/speci/commit/5245d037bce572b4cfe498a3f29dff7522fc3cfc) Thanks [@ianchak](https://github.com/ianchak)! - fix(yolo): remove erroneous `requireProgress` preflight check

## 0.8.0

### Minor Changes

- [`6c939e6`](https://github.com/ianchak/speci/commit/6c939e6f10073aef3431c8f3d7c4e0f22dfab1d0) Thanks [@ianchak](https://github.com/ianchak)! - feat(commands): add `yolo` command

  Introduces the `yolo` command (`lib/commands/yolo.ts`) that runs the full
  `plan → task → run` pipeline in a single unattended invocation.
  - Added `YoloOptions` interface for command configuration
  - Registered `yolo` command in the CLI entry point (`bin/speci.ts`)
  - Wires `plan`, `task`, and `run` phases with phase-aware error messages and performance logging

- [`16cdfab`](https://github.com/ianchak/speci/commit/16cdfab7d6508428a6b26f32f01fa4a25c2a5c44) Thanks [@ianchak](https://github.com/ianchak)! - Add `writeFailureNotes` to populate the `### For Fix Agent` section of PROGRESS.md with structured gate failure context.

  The orchestration loop in `run` now calls `writeFailureNotes` immediately after the initial gate failure and after each subsequent retry failure, so the fix agent always has up-to-date information on which commands failed, the primary error message, and a root-cause hint before it is dispatched.

## 0.7.5

### Patch Changes

- [`7f2fa66`](https://github.com/ianchak/speci/commit/7f2fa66a49d88ec53b0427110c245363d7501379) Thanks [@ianchak](https://github.com/ianchak)! - Bump default Copilot model versions from claude-sonnet-4.5 to claude-sonnet-4.6 for task, refactor, review, and fix agents in the config template.

## 0.7.4

### Patch Changes

- [`4d7d108`](https://github.com/ianchak/speci/commit/4d7d1086e222fdca0320ede6770424893dc937c3) Thanks [@ianchak](https://github.com/ianchak)! - Fix npm audit vulnerabilities by upgrading devDependencies: eslint v4→v10, @eslint/js v9→v10, typescript-eslint v8.0→v8.56, madge v7→v8. Added npm override for minimatch ≥10.2.1 to patch transitive ReDoS vulnerability. Reduces total vulnerabilities from 21 to 9 (all high-severity eliminated).

## 0.7.3

### Patch Changes

- [`2983ddc`](https://github.com/ianchak/speci/commit/2983ddcca880a2f8f06ef8579c43e9d0ffbf40a8) Thanks [@ianchak](https://github.com/ianchak)! - Enforce integration wiring across all agent templates to prevent orphaned components

  Added "Integration Wiring" checks to every stage of the agent pipeline — planning, task generation, implementation, and review. New components must now document who consumes them, where they're registered, and how they're activated. Orphaned components (created but never wired in) are flagged as failures during review.

  Key additions:
  - Plan skeleton: Section 3.4 (Integration Map), Section 5.3 (Integration Touchpoints), enhanced Phase 3 wiring steps
  - Refinement rounds: orphan detection, wiring traceability checks, integration test coverage verification
  - Task generator/reviewer: mandatory "Integration Wiring" section in task files, dedicated integration tasks for multi-component milestones
  - Impl agent: must execute wiring steps and verify component reachability
  - Review agent: orphaned components are now a blocking review failure
