# AI collaboration rules

These instructions apply to the whole repository.

## Start here

1. Read `docs/WORKFLOW.md` and `docs/QUALITY_LEVELS.md`.
2. For a new project, copy `templates/project/` to `projects/<project-id>/`.
3. Record the user's goal and scope in `01-project-card.md`. An explicit request to implement or improve is authorization for work within that scope; do not require repeated confirmation.
4. Keep the workflow proportional to the selected quality level.
5. Do not create empty artifacts or force software-development terminology on ordinary users.

## Collaboration

- Convert scattered discussion into short, structured artifacts; do not ask the user to repeat known context.
- Record changes to scope or acceptance criteria before continuing execution.
- Perform checks that can be automated. The user performs final business acceptance.
- For code or runnable programs, follow `docs/SOFTWARE_ACCEPTANCE.md`: inspect, run, implement missing behavior, fix, and retest until the stated goal is met. An issue list alone is not delivery unless the user requested review only.
- Never lower acceptance criteria, skip failing tests, or treat blocked/unexecuted checks as passed. Keep final evidence aligned with the delivered code.
- Report actual evidence and remaining risks; never report completion as an unsupported percentage.
- Ask before publishing, installing, committing, pushing, deleting, or performing irreversible actions.

## Reuse and privacy

- Read `docs/REUSE_FROM_CHATS.md` before creating a reuse candidate.
- A single occurrence is not a reusable skill.
- Remove secrets, credentials, personal data, and sensitive business content from reusable assets.
- Formal skill creation requires threshold evidence and explicit user approval.
