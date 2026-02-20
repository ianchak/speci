---
'speci': minor
---

Add `writeFailureNotes` to populate the `### For Fix Agent` section of PROGRESS.md with structured gate failure context.

The orchestration loop in `run` now calls `writeFailureNotes` immediately after the initial gate failure and after each subsequent retry failure, so the fix agent always has up-to-date information on which commands failed, the primary error message, and a root-cause hint before it is dispatched.
