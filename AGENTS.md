# ScaleLab Development Rules

These rules apply to every implementation in this repository.

## Code quality

- Write clean, simple, maintainable code.
- Prefer clear structure over unnecessary abstraction.
- Keep functions focused and reasonably small.
- Use meaningful names for variables, functions, files, and modules.
- Avoid premature optimization.
- Do not introduce new technologies unless the current milestone requires them.

## Comments

- Add comments where they explain important reasoning, architecture, non-obvious logic, performance-related behavior, concurrency, transactions, or infrastructure concepts.
- Do not add comments that merely restate obvious code.
- Comments should help someone learning backend/system-design concepts understand why something exists.

## Documentation

Maintain:

`docs/IMPLEMENTATION_LOG.md`

For every meaningful implementation or architectural change, append a new section containing:

1. A short summary headline.
2. What was implemented.
3. Why it was implemented.
4. How it works.
5. Important files changed/added.
6. Configuration introduced.
7. How to run/test it.
8. Verification performed.
9. Any limitations or things intentionally postponed.

Documentation should reflect the actual implementation. Do not document features that were not implemented.

## Verification

Before considering a task complete:

- typecheck
- run relevant tests
- build affected applications
- verify runtime behavior where practical
- update `docs/IMPLEMENTATION_LOG.md`

Do not proceed into future milestones unless explicitly requested.