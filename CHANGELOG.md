# speci

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
