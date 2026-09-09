---
name: scrutiny
description: Use when asked to "review my changes", "review this branch", "do a local review", or "score my diff" — a read-only review of the working tree or branch diff, printed to the terminal, nothing posted to GitHub. Follow every phase in the skill body.
---

# Scrutiny

The same adversarial review as `inquest`, run locally against the working
tree or branch diff — no Codex pass, no PR thread history, and **no GitHub
posting, no fix loop, no thread management.** This is read-only analysis
that prints a review to the terminal. It keeps the CI review's severity
tags, scoring, and summary format so scores line up.

For the post-and-fix workflow against a real PR, use `inquest` instead.

The review engine lives in `review-core.md` next to this file — `inquest`
reads the same file. Each phase below names the section to run; read the
core once, up front, and follow the named sections verbatim.

The review itself never runs in this session. This session is the
orchestrator: it resolves scope and criteria paths, dispatches three review
lanes as fresh subagents, hands their reports to a fresh judge, and prints
the result. It adds, drops, and regrades nothing — a session that wrote the
diff cannot grade it. The briefs need `review-core.md` as an absolute
path: `${CLAUDE_PLUGIN_ROOT}/skills/scrutiny/review-core.md`.

On invocation, create one TodoWrite todo per phase (scope resolution,
criteria paths resolved, three lanes dispatched, lanes returned with all
seven passes checked, judge returned with score, PR hygiene, output). Mark
each complete only after the work is done and its evidence exists.

## Inputs

Arguments can appear in any order. Parse by format, not position:

- `<ref>` (optional): A git ref or `<base>...<head>` range. If omitted,
  the skill picks a sensible default (see Phase 0).
- `--staged` — review only staged changes (`git diff --cached`).
- `--unstaged` — review only unstaged changes (`git diff`).
- `--working` — review staged + unstaged combined (`git diff HEAD`).
- `--full` — force full branch review even if a smaller scope was given.

Examples:

```text
/scrutiny                    # auto-detect: branch diff vs base, or working tree
/scrutiny main               # diff main...HEAD
/scrutiny origin/main...HEAD # explicit range
/scrutiny --staged           # just what's staged
/scrutiny --unstaged         # just unstaged edits
```

## Phase 0: Scope

A flag or ref above sets the scope directly. Otherwise run "Scope
resolution" in `review-core.md`, including its scope line at the start of
the review.

## Phase 1: Criteria paths

Resolve the inputs of "Load criteria" in `review-core.md` without running
it: which of REVIEW.md, the CLAUDE.md chain and the stack checklist exist,
and the pinned SHAs (or `HEAD` for a working-tree scope) the diff command
needs. Run `git diff --stat` for the scope line. Do not read the diff
beyond that — the lanes read it.

## Phase 2: Dispatch

Run "Dispatch" in `review-core.md`: fill the lane brief once, launch lanes
A, B and C in one message as fresh `general-purpose` subagents, never
`fork`. When they return, confirm every lane printed a `Checked:` line for
each of its passes; re-run a lane that did not. No Agent tool → the inline
fallback in "Dispatch", and its `Reviewers:` line in the output.

## Phase 3: Judge

Run "Judge" in `review-core.md` with the three lane reports verbatim and
`External pass: none`. Its findings and `Score:` line are final. Run
"Review" in `review-core.md` only through the lanes and the judge, never
here.

## Phase 4: PR hygiene (conditional)

Run "PR hygiene" in `review-core.md`.

## Phase 5: Output

Print the review to the terminal in the same shape the CI sticky
summary uses, so it is interchangeable with the GitHub version:

1. **Header** — `### Merge confidence: N/10` on its own line, then a
   one-line assessment.
2. **Scope** — one line stating exactly what was diffed (e.g.
   `Scope: git diff origin/main...HEAD (24 files, +812/-130)`), then
   `Reviewers: 3 lanes + judge, fresh subagents` — or the in-session line
   from "Dispatch" when the Agent tool was missing.
3. **Summary** — what the change does and its impact.
4. **PR Hygiene** — pass/fail checklist if a PR exists, else skipped.
5. **Critical Issues (N)** — table: `# | File:Line | Issue | Suggested fix`.
   Findings, severities and count come from the judge, unchanged.
6. **Warnings (N)** — same table format.
7. **Suggestions (N)** — numbered list with `file:line` references.
8. **Security** — assessment, or "No security concerns found".
9. **Files Reviewed** — table: `File | Changes`.

If a section is empty, print the header with `(0)` and a single line
("No critical issues." / "No warnings." / etc.) so the structure is
predictable.

Do NOT post anything to GitHub. Do NOT modify any files. Do NOT run
formatters, linters, or tests as part of this skill — review only.
If the user wants to apply fixes, they can ask separately and run their
fix workflow.
