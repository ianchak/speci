---
'speci': patch
---

Enforce integration wiring across all agent templates to prevent orphaned components

Added "Integration Wiring" checks to every stage of the agent pipeline — planning, task generation, implementation, and review. New components must now document who consumes them, where they're registered, and how they're activated. Orphaned components (created but never wired in) are flagged as failures during review.

Key additions:

- Plan skeleton: Section 3.4 (Integration Map), Section 5.3 (Integration Touchpoints), enhanced Phase 3 wiring steps
- Refinement rounds: orphan detection, wiring traceability checks, integration test coverage verification
- Task generator/reviewer: mandatory "Integration Wiring" section in task files, dedicated integration tasks for multi-component milestones
- Impl agent: must execute wiring steps and verify component reachability
- Review agent: orphaned components are now a blocking review failure
