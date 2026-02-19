---
'speci': patch
---

Fix npm audit vulnerabilities by upgrading devDependencies: eslint v4→v10, @eslint/js v9→v10, typescript-eslint v8.0→v8.56, madge v7→v8. Added npm override for minimatch ≥10.2.1 to patch transitive ReDoS vulnerability. Reduces total vulnerabilities from 21 to 9 (all high-severity eliminated).
