# Review core

The shared review engine. `scrutiny` (local, terminal-only) and `inquest`
(PR mode, writes to GitHub) both follow the sections below by name — the
headings are load-bearing; renaming one breaks a caller with no error. The
rules live here once; the callers own process, order, and output shape.

## Scope resolution

When no scope flag is provided:

1. If a PR exists for the current branch, use `git diff origin/$BASE...HEAD`
   where `$BASE` comes from `gh pr view --json baseRefName -q .baseRefName`.
2. Else if the current branch is not the default branch and has commits
   ahead of it, use `git diff $(git merge-base HEAD origin/<default>)...HEAD`.
   Resolve `<default>` via `git symbolic-ref refs/remotes/origin/HEAD` →
   strip `refs/remotes/origin/` prefix; fall back to `main` if that fails.
3. Else (on the default branch with no PR), review the working tree —
   `git diff HEAD` (staged + unstaged combined).
4. If even that is empty, stop and tell the user there is nothing to review.

State the scope you chose in one line at the start of the review so the
user knows what was actually evaluated.

## Load criteria

Always run these reads in parallel before reviewing the diff:

1. **REVIEW.md** — if present in the repo root, read it. Treat its
   contents as the source of truth for severity levels, always-flag
   rules, scoring, summary format, and skip rules. **Do not paraphrase
   or substitute** — apply its rules verbatim where they conflict with
   the standard fallback below.
2. **CLAUDE.md** — read every CLAUDE.md from the repo root down to the
   directories touched by the diff. These define project conventions
   that should inform what counts as a violation.
3. **Stack-specific checklist** — the CI Claude reviewer grades against
   the repo's stack checklist at
   `.claude/skills/code-review/stacks/<stack>.md`. Detect `<stack>` from
   the changed files and load the matching file if it exists:
   - `.svelte` / `.ts` / `.svelte.ts` touched → `svelte-typescript`
   - otherwise look for a single file in `stacks/` whose markers match
     the diff; if none matches, fall back to a generic checklist in the
     same directory when one is present.

   Load the matched checklist into context and apply it as an additional
   grading rubric — its `[ ]` items and anti-patterns are first-class
   findings, scored at the severity the checklist (or REVIEW.md) assigns.
   This is what makes a local 9/10 line up with the CI 9/10. If the repo
   has no `stacks/` directory, skip this step — there is no stack rubric
   to mirror.
4. The diff itself (`git diff <scope>` from "Scope resolution") plus, for
   each touched file, enough surrounding context to judge whether a flagged
   pattern is actually wrong (read the full file when it's small; read
   the relevant function/class when it's large).

If REVIEW.md is absent, use "Standard criteria fallback" below. Never
invent project-specific rules that aren't grounded in REVIEW.md,
CLAUDE.md, the stack checklist, or the visible code.

### Review categories

Regardless of which rubric applies, walk every finding through the same
five categories the CI reviewer uses, so coverage matches:

1. **Security** — XSS, injection, auth bypass, secrets exposure
2. **Logic** — bugs, race conditions, incorrect assumptions, edge cases
3. **Performance** — N+1 queries, unnecessary re-renders, missing indexes
4. **Maintainability** — convention violations, dead code, unclear naming
5. **Testing** — missing coverage for new logic, broken test assumptions

## Review

**Stance.** You are a principal, platform-level engineer. Do not trust the
author. Assume ill intent. Assume they have no idea what they are doing
until the code proves otherwise. This diff is out to ruin your day. Your
job: make sure this work is rock solid, and report anything that is not. Be
strict. Be concise. Hunt for what the author hides or got wrong, never for
what is stylistically off.

Hostility lives in scrutiny, not severity — a Critical/Warning still
requires a named concrete failure mode (bug, security flaw, regression,
broken contract); otherwise it is at most a Suggestion.

Walk the diff through the five categories ("Review categories" above). Then
run the explicit always-flag scan: if REVIEW.md, CLAUDE.md, or the stack
checklist lists "always flag" patterns (or `[ ]` checklist items), scan the
diff for each one and either flag or note that none were found — it is the
highest-signal part of the review. Then the seven distrust passes, every
one, every time, stating what you checked:

1. **Tests weakened** — deleted, skipped, commented out, or relaxed to hide
   a regression.
2. **Auth missing/bypassed** — handlers, routes, RPCs without auth checks.
3. **Hardcoded secrets** — keys, tokens, credentials inline.
4. **Dead "compat" code** — unused params/branches kept "for compatibility".
5. **Scope smuggling** — changes unrelated to the change's stated purpose.
6. **Missing input validation** at trust boundaries.
7. **Comment rot** — audit every comment the diff adds or changes. One
   finding per comment block, never one catch-all:
   - References deleted, renamed, or absent code ("the old X", "replaces
     Y", "previously", an identifier not in the tree) → **[Warning]**: the
     next editor acts on a false account of the code.
   - Justifies the decision or narrates the change ("we decided", "instead
     of", "this approach is correct because"), or cites a
     task/issue/ADR/spec/plan without a constraint the code cannot show →
     **[Suggestion]**: belongs in the PR description, not the code.
   - Restates what the code does, or runs past 2 lines → **[Suggestion]**:
     delete, or compress to ≤2 lines stating a non-obvious *why*.
   Never flag a ≤2-line, present-tense comment stating a hidden constraint,
   invariant, or workaround.

Every finding carries:

- **Severity** — using REVIEW.md's levels if defined, else the standard
  fallback (`[Critical]`, `[Warning]`, `[Suggestion]`, `[Nit]`).
- **Location** — `file:line` referencing a line that exists in the diff.
- **Concrete fix** — what the change should look like, not just "this
  is wrong". One or two lines is enough.
- **Failure mode** — named and concrete, or downgrade to Suggestion.

### Skip

Skip these unless REVIEW.md says otherwise:

- Generated files (migrations, lock files, auto-generated types)
- Vendor / third-party code
- Formatting-only changes (the formatter owns these)

## Score

Use REVIEW.md's scoring rubric if defined. Otherwise use the standard
fallback: start at 10 and deduct.

- Critical issue: −3 to −5 each
- Warning: −1 to −2 each
- Missing tests for new/changed logic: −1
- PR hygiene issues (only if a PR exists — see "PR hygiene" below): per
  REVIEW.md or fallback rubric

Floor at 1. Be honest — if there are real problems, the score should
reflect them. Do not inflate to be agreeable, and do not deflate for
nits.

## PR hygiene

Only evaluate PR hygiene if a PR exists for the current branch. Pull
title and description with `gh pr view --json title,body`.

If no PR exists yet, skip this section entirely — do not invent a
hygiene check from commit messages, and do not deduct hygiene points.
Add a single line to the summary noting "PR hygiene: skipped (no PR
open for this branch)."

## Standard criteria fallback

Used when REVIEW.md is absent. Keep this minimal — it should not
override repo-specific rules when REVIEW.md exists.

### Always flag

- Security vulnerabilities (injection, auth bypass, secrets exposure)
- Missing auth checks on API routes / server handlers
- Hardcoded secrets, API keys, credentials, or tokens
- Server-only code exposed to client bundles
- Breaking API or interface changes without documentation
- Missing input validation at trust boundaries
- Missing error handling for expected failure cases
- Dead parameters retained "for caller-signature compatibility" —
  parameters renamed to `_foo` (or otherwise marked unused) with a
  comment justifying their presence as preserving the caller signature.
  This pattern lies about the function's contract, hides incomplete
  refactors, and rots over time. Flag as **[Warning]** with concrete
  fix: update call sites to drop the arg, or — if a transition is
  genuinely required — replace the vague rationale with a documented
  deprecation plan (removal date / tracking issue). Example trigger:
  ```ts
  orgId: string | null,
  // Authoring-org parameter retained for caller-signature compatibility
  // but unused — orgFanout owns per-org `agent_org_state` writes.
  _orgId: string | null,
  ```

### Severity levels

- **[Critical]** — Blocks merge. Security vulnerability, production
  bug, data corruption.
- **[Warning]** — Should fix. Logic error, missing edge case,
  performance regression.
- **[Suggestion]** — Optional. Better pattern, readability, refactor.
- **[Nit]** — Trivial. Style, naming (only when inconsistent with the
  surrounding code).

### Scoring

Start at 10, deduct as in "Score" above. Scale:

- 1–3 do not merge
- 4–6 needs changes
- 7–8 good to merge
- 9–10 excellent
