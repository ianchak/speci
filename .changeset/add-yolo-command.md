---
'speci': minor
---

feat(commands): add `yolo` command

Introduces the `yolo` command (`lib/commands/yolo.ts`) that runs the full
`plan → task → run` pipeline in a single unattended invocation.

- Added `YoloOptions` interface for command configuration
- Registered `yolo` command in the CLI entry point (`bin/speci.ts`)
- Wires `plan`, `task`, and `run` phases with phase-aware error messages and performance logging
