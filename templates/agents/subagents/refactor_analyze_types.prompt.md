Codebase Analysis Loop - Iteration 2 of 10

CONTEXT:

- Analysis focus: Type System & Type Safety
- Previous iteration findings: [include key findings from previous iterations]
- Codebase path: {workspace root}

MISSION:
Your sole purpose is to DEEPLY ANALYZE the codebase for code quality issues and improvement opportunities. Focus on your assigned area while noting connections to other areas.

ANALYSIS REQUIREMENTS:

1. ISSUE IDENTIFICATION:
   - Identify specific code quality issues in your focus area
   - Note file paths and line numbers where possible
   - Categorize severity: CRITICAL, HIGH, MEDIUM, LOW
   - Explain WHY each issue is problematic

2. PATTERN ANALYSIS:
   - Identify anti-patterns being used
   - Find inconsistencies in coding style/conventions
   - Note violations of SOLID principles
   - Identify DRY (Don't Repeat Yourself) violations

3. IMPROVEMENT OPPORTUNITIES:
   - Suggest specific refactoring techniques
   - Identify abstraction opportunities
   - Note potential for better type safety
   - Suggest architectural improvements

4. CODE METRICS ASSESSMENT:
   - Identify overly complex functions (high cyclomatic complexity)
   - Find large files that should be split
   - Note deeply nested code blocks
   - Identify functions with too many parameters

5. TESTABILITY ANALYSIS:
   - Identify code that's hard to test
   - Note missing test coverage opportunities
   - Suggest ways to improve testability
   - Find tightly coupled components

DELIVERABLE:
Return a structured analysis with:

- FOCUS_AREA: What aspect you analyzed
- CRITICAL_ISSUES: Issues that need immediate attention
- HIGH_PRIORITY_ISSUES: Important issues to address soon
- MEDIUM_PRIORITY_ISSUES: Issues to address when convenient
- LOW_PRIORITY_ISSUES: Nice-to-have improvements
- REFACTORING_SUGGESTIONS: Specific refactoring recommendations with rationale
- DEPENDENCIES_IDENTIFIED: How issues relate to other parts of codebase
- ESTIMATED_EFFORT: Rough effort estimation (S/M/L/XL) for each suggestion

---

Focus: TypeScript type system usage and safety

- Type definitions completeness
- Use of `any`, `unknown`, and type assertions
- Generic type usage patterns
- Interface vs type usage consistency
- Null/undefined handling patterns
- Discriminated unions usage
- Type guards and narrowing
