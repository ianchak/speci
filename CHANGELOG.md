# speci

## 0.12.0

### Minor Changes

- [#6](https://github.com/ianchak/speci/pull/6) [`9726f92`](https://github.com/ianchak/speci/commit/9726f9228e55f3006d119b231f7d167a793bf319) Thanks [@ianchak](https://github.com/ianchak)! - feat(cli): add --sleep-after flag to put machine to sleep after command completes

## 0.11.0

### Minor Changes

- [#4](https://github.com/ianchak/speci/pull/4) [`951af1d`](https://github.com/ianchak/speci/commit/951af1df553a5767478a61066788bf70e8fbbc25) Thanks [@ianchak](https://github.com/ianchak)! - feat(run): display task progress box during confirmation and dry-run prompts

- [#4](https://github.com/ianchak/speci/pull/4) [`6c5836d`](https://github.com/ianchak/speci/commit/6c5836dae28d0ad1bd460588f8a508b77eee55bc) Thanks [@ianchak](https://github.com/ianchak)! - feat(run): add --verify flag for human-in-the-loop milestone verification (MVT) pausing

## 0.10.5

### Patch Changes

- [`f4aebe6`](https://github.com/ianchak/speci/commit/f4aebe6d11cacf5c556a1c6967a0289185342a8d) Thanks [@ianchak](https://github.com/ianchak)! - fix(ui): add symmetric 2-char border overhang on both sides of progress bar content

- [`5f585da`](https://github.com/ianchak/speci/commit/5f585da3c58b46b2f44affc1722d4dbd3fa8fcad) Thanks [@ianchak](https://github.com/ianchak)! - fix(status): wrap long task names to banner width and prevent footer duplication in narrow terminals

## 0.10.4

### Patch Changes

- [#2](https://github.com/ianchak/speci/pull/2) [`a341b17`](https://github.com/ianchak/speci/commit/a341b17c2f2f974618d4ed15a9d0673be10610fe) Thanks [@ianchak](https://github.com/ianchak)! - fix(banner): pad version line to banner width for correct centering in status dashboard

- [#2](https://github.com/ianchak/speci/pull/2) [`fe0db71`](https://github.com/ianchak/speci/commit/fe0db7128bf917acf1237604cda1ac180ff805d3) Thanks [@ianchak](https://github.com/ianchak)! - perf(core): hoist module-level constants and cache computed values in state, config, status, and renderer (M0 TASK_001–004)

- [#2](https://github.com/ianchak/speci/pull/2) [`fe0db71`](https://github.com/ianchak/speci/commit/fe0db7128bf917acf1237604cda1ac180ff805d3) Thanks [@ianchak](https://github.com/ianchak)! - fix(core): fix stateFileCache path keying, O(n²) stdout concat in gate, clean command try/catch, add global rejection handlers, and consolidate cleanup guard (M1 TASK_005–010)

- [#2](https://github.com/ianchak/speci/pull/2) [`fe0db71`](https://github.com/ianchak/speci/commit/fe0db7128bf917acf1237604cda1ac180ff805d3) Thanks [@ianchak](https://github.com/ianchak)! - refactor(core): standardize naming conventions and strengthen type safety with literal unions, keyof error codes, JSON parse validation, and discriminated unions (M2A TASK_011–016, M2B TASK_017–023)

- [#2](https://github.com/ianchak/speci/pull/2) [`fe0db71`](https://github.com/ianchak/speci/commit/fe0db7128bf917acf1237604cda1ac180ff805d3) Thanks [@ianchak](https://github.com/ianchak)! - refactor(core): extract shared helpers (makeAction, toErrorMessage, walkUpToFind, dispatchAgent), decompose yolo and dashboard, split lock parsers, and merge animation frames (M3 TASK_024–034)

- [#2](https://github.com/ianchak/speci/pull/2) [`fe0db71`](https://github.com/ianchak/speci/commit/fe0db7128bf917acf1237604cda1ac180ff805d3) Thanks [@ianchak](https://github.com/ianchak)! - refactor(architecture): add adapter unit tests, injectable prompts, and signal reset; consolidate color detection and banner output; split config/interfaces into submodules; reorganize utils/ and mirror test structure (M4A–C TASK_035–048)

## 0.10.3

### Patch Changes

- [`a215734`](https://github.com/ianchak/speci/commit/a215734379632e2a244d7c3dcc89694829e7e476) Thanks [@ianchak](https://github.com/ianchak)! - refactor(ui): remove redundant Mode and Output fields from command info boxes

## 0.10.2

### Patch Changes

- [`a2b90de`](https://github.com/ianchak/speci/commit/a2b90dee03edac90702a8d48e6d7561d4f25142e) Thanks [@ianchak](https://github.com/ianchak)! - fix(cli): capitalize help descriptions and replace deprecated addHelpCommand with helpCommand

## 0.10.1

### Patch Changes

- [`ef9ca0a`](https://github.com/ianchak/speci/commit/ef9ca0a4d3bd67c4cc91b8a08e463cccb3c2d51e) Thanks [@ianchak](https://github.com/ianchak)! - fix(status): use renderBanner with gradient effect instead of flat-colored BANNER_ART

## 0.10.0

### Minor Changes

- [`66c6f9a`](https://github.com/ianchak/speci/commit/66c6f9a89c2db89c304bc1adf1d7688e0fc46529) Thanks [@ianchak](https://github.com/ianchak)! - feat(interfaces): add IStateReader, ILockManager, IGateRunner, IPreflight, and ISignalManager interfaces with Node adapter implementations

### Patch Changes

- [`6a6e173`](https://github.com/ianchak/speci/commit/6a6e173ac83977a0d932901b06081c6e43176f5a) Thanks [@ianchak](https://github.com/ianchak)! - chore(dx): add husky git hooks, gate convenience script, and remove madge dependency

- [`66c6f9a`](https://github.com/ianchak/speci/commit/66c6f9a89c2db89c304bc1adf1d7688e0fc46529) Thanks [@ianchak](https://github.com/ianchak)! - refactor(types): update SpeciConfig imports to use `@/types.js` across all modules

- [`4dad641`](https://github.com/ianchak/speci/commit/4dad6415c7f16f7100fa9a613a263a6dfb33330e) Thanks [@ianchak](https://github.com/ianchak)! - fix(agents): enforce gate-green invariant in task generation and implementation prompts

## 0.9.0

### Minor Changes

- [`b855edb`](https://github.com/ianchak/speci/commit/b855edbaa77e34b5b3990fee725b833efeffb2ec) Thanks [@ianchak](https://github.com/ianchak)! - feat(clean): add `speci clean` command and `--clean` flag to `speci task` to reset task files and PROGRESS.md

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
