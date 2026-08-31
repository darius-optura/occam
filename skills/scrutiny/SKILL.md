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

On invocation, create one TodoWrite todo per phase (scope resolution, load
criteria, adversarial review + always-flag scan + seven distrust passes,
score, PR hygiene, output). Mark each complete only after the work is done.
The always-flag scan and the distrust passes are their own steps — do not
fold them into the general review.

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

## Phase 1: Load criteria

Run "Load criteria" in `review-core.md` — REVIEW.md, the CLAUDE.md chain,
the stack checklist, and the diff with surrounding context, read in
parallel.

## Phase 2: Review

Run "Review" in `review-core.md` — the stance, the five categories, the
always-flag scan, and all seven distrust passes, every one, every time,
stating what you checked. Every finding carries severity, in-diff
`file:line`, concrete fix, and named failure mode.

## Phase 3: Score

Run "Score" in `review-core.md` (REVIEW.md rubric when present, else the
fallback).

## Phase 4: PR hygiene (conditional)

Run "PR hygiene" in `review-core.md`.

## Phase 5: Output

Print the review to the terminal in the same shape the CI sticky
summary uses, so it is interchangeable with the GitHub version:

1. **Header** — `### Merge confidence: N/10` on its own line, then a
   one-line assessment.
2. **Scope** — one line stating exactly what was diffed (e.g.
   `Scope: git diff origin/main...HEAD (24 files, +812/-130)`).
3. **Summary** — what the change does and its impact.
4. **PR Hygiene** — pass/fail checklist if a PR exists, else skipped.
5. **Critical Issues (N)** — table: `# | File:Line | Issue | Suggested fix`.
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
