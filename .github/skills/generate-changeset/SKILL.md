---
name: generate-changeset
description: Generates a .changeset/<slug>.md file for the current changes using the @changesets/cli format. Use when the user asks to create a changeset, cut a release entry, or document what changed before publishing.
---

Create a single `.changeset/<slug>.md` file that accurately describes the current changes.

## Bump type selection

| Change type                                                                        | Bump    |
| ---------------------------------------------------------------------------------- | ------- |
| Breaking API / CLI change (removed flags, renamed commands, changed config schema) | `major` |
| New user-visible feature or command (backwards-compatible)                         | `minor` |
| Bug fix, refactor, perf improvement, doc update, dependency bump                   | `patch` |

When in doubt, choose the lower bump type.

## Steps

### 1. Inspect the changes

Run:

```
git diff --staged --stat
git diff --staged
```

If nothing is staged, fall back to:

```
git log --oneline -10
git diff HEAD~1 HEAD --stat
git diff HEAD~1 HEAD
```

### 2. Read the package name

```
cat package.json | grep '"name"'
```

### 3. Determine bump type and description

1. Identify the primary user-facing change.
2. Select bump type using the table above.
3. Write a ONE-sentence description in conventional commit format (≤ 120 characters).
   - Good: `feat(yolo): add --dry-run flag to skip gate execution`
   - Good: `fix(gate): handle non-zero exit from lint command correctly`
   - Bad: "Updated some files and fixed a few things."

### 4. Generate the slug

Create a short kebab-case slug (2-4 words) derived from the change — not random words.

Examples: `yolo-dry-run`, `gate-exit-fix`, `config-schema-v2`

### 5. Write the file

Create `.changeset/<slug>.md` with this exact format:

```markdown
---
'<package-name>': <patch|minor|major>
---

<one-sentence conventional commit description>
```

No trailing blank lines beyond the one after the description. No extra sections.

### 6. Confirm

Print the full path and contents of the created file, then stop. Do not modify any source files or commit anything.
