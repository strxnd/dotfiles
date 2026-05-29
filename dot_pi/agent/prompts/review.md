---
description: Review current changes with code-reviewer
argument-hint: "[focus]"
---
Use the global `code-reviewer` subagent to review the current changes for bugs, security issues, regressions, and maintainability problems.

Focus especially on: $ARGUMENTS

Ask `code-reviewer` to:
- Inspect the repo state with `git status` and `git diff`
- Read relevant changed files and nearby context
- Call the `security-engineer` subagent for security/data-handling concerns
- Include critical issues that should block merging
- Include likely bugs or edge cases
- Include security or data-handling concerns
- Include performance concerns
- Include test coverage gaps
- Include suggestions to simplify or improve maintainability

Prioritize actionable findings over general style feedback. Do not edit files.
