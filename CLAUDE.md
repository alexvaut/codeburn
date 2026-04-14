# CodeBurn Development Rules

## Verification
- NEVER commit without running locally first and confirming it works
- Run `npx tsx src/cli.ts report` and `npx tsx src/cli.ts today` to verify changes before any commit
- For dashboard changes: run the interactive TUI and visually confirm rendering
- For new features: test the happy path AND edge cases (empty data, missing config, pipe mode)

## Code Quality
- Clean, minimal code. No dead code, no commented-out blocks, no TODO placeholders
- No emoji anywhere in the codebase
- No em dashes. Use hyphens or rewrite the sentence
- No AI slop: no "streamline", "leverage", "robust", "seamless" in user-facing text
- No unnecessary abstractions. Three similar lines > premature helper function

## Accuracy
- Every user-facing number (cost, tokens, calls) must be verified against real data
- LiteLLM pricing model names must match exactly. No guessing model IDs
- Date range calculations must be tested with edge cases (month boundaries, billing day > days in month)

## Style
- TypeScript strict mode. No `any` types
- No comments unless the WHY is non-obvious
- Imports: node builtins first, then deps, then local (separated by blank line)
- Single quotes, no semicolons inconsistency (follow existing: no trailing semicolons in most files)

## Git
- Commits from: AgentSeal <hello@agentseal.org>
- NEVER add Co-Authored-By lines
- NEVER include personal names or usernames in commits
- Small, focused commits. One feature per commit
- Test locally before every commit
