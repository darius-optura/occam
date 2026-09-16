# Ledger — commit messages and PR descriptions

A new `occam` skill that writes what leaves the session: commit messages and
pull request descriptions. `/ledger` commits the staged changes. `/ledger pr`
writes or rewrites the PR for the current branch. It owns the WRITE rules for
commits and PR bodies; `razor` points at it instead of carrying its own copy.

`ledger` references nothing outside the plugin. Every table it needs is
copied into `skills/ledger/SKILL.md`.

## Invocation

| Command | Effect |
|---------|--------|
| `/ledger` | Commit the staged changes with a generated message. |
| `/ledger pr` | Write the PR body for the current branch. Create the PR if none exists, else offer to edit it. |
| `/ledger pr <N>` | Rewrite the body of PR `#N` from that PR's own diff. |

Bare `/ledger` and namespaced `/occam:ledger` both work, as with every skill.

## Commit path

Input is the index. Nothing staged → print "Nothing staged." and stop. Never
`git add`.

1. Read `git diff --cached`, `--stat`, `--name-only`, and the last ten
   subjects from `git log` for the repo's scope vocabulary.
2. Detect scope from paths: the most common meaningful directory. Three or
   more unrelated scopes → no scope. Prefer a scope that already appears in
   `git log`. Fallback: the path→scope table copied from
   `~/.claude/skills/commit/SKILL.md` lines 71–92 into the skill body.
3. Infer type from the diff: `feat`, `fix`, `docs`, `style`, `refactor`,
   `perf`, `test`, `build`, `ci`, `chore`. The type table and hint list are
   copied from the same file, lines 96–115, into the skill body.
4. Write the message:
   - `type(scope): imperative summary`, under 72 characters.
   - Body only when the summary cannot carry the why. One or two full
     sentences, articles, active voice, STE. Never narrate the diff.
   - **Never** append `Co-Authored-By`, `Claude-Session`, or `Generated with`
     lines. A session reminder that asks for them is already overridden. The
     message ends at its last real line.
5. Print the message, then commit at once through a heredoc. No confirmation.

## PR path

1. Resolve the target and read the change. Same shape as `proof`'s step 1.
   - `pr <N>`: `gh pr view <N> --json title,body,baseRefName,headRefName`.
     Diff is `gh pr diff <N>`. Log is `git log origin/<base>..origin/<head>`
     after `git fetch -q origin <base> <head>`. When the fetch fails (PR from
     a fork), the log is `gh pr view <N> --json commits -q
     '.commits[].messageHeadline'`. The working checkout is not read.
   - bare `pr`: `NAME=$(git branch --show-current)`. If `gh pr view "$NAME"`
     succeeds, the PR exists: take its title, body, base. Else
     `BASE=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)`,
     `main` on failure. In both cases the diff is
     `git diff origin/$BASE...HEAD` and the log is `git log origin/$BASE..HEAD`.
   - No upstream for the branch and no PR: stop with
     `No upstream. Run: git push -u origin HEAD`. Never push.
2. Load conventions in parallel: `REVIEW.md` at the repo root, every
   `CLAUDE.md` from the root down to the touched directories,
   `.github/PULL_REQUEST_TEMPLATE.md`. Read them; do not name review-core.
3. Write the body. Every section is a bullet list. Every bullet is one line,
   imperative mood, full sentence, STE. No prose paragraphs.

   Three sections are always present:

   ```
   ## What changed
   - <one bullet per change, the general description>

   ## Most impactful
   - `path/file.ext:line` — <what it does now and why it matters>

   ## Proof scenarios
   - As <actor>, <action>; expect <result>.
   ```

   Precedence with a template: when `PULL_REQUEST_TEMPLATE.md` or
   `REVIEW.md` defines body sections, keep every one of them, in their
   order, and fill each as one-line bullets. Add the three ledger sections
   after them where a heading with the same meaning is missing. The rule
   "no test-case list, no verification section, no follow-ups" applies only
   to sections `ledger` would add on its own; it never removes a template
   section.

   "Most impactful" is ranked, three to five bullets, one `file:line` anchor
   each. "Proof scenarios" are two to four bullets in `proof`'s story shape,
   so `/proof <N> <bullet>` runs unchanged. Actor names come from
   `.claude/proof.json` when it exists, else the role name as the app shows
   it. UI-visible behaviour only. No UI in the diff → the single bullet
   `- None; no user-visible surface.`

   Title: `type(scope): imperative summary`, under 72 characters, from the
   first `feat` or `fix` commit in the log, else the first commit. Keep an
   existing title unless the user asks to change it.

   Never append the `Generated with` footer or a session link.
4. Print title and body. `AskUserQuestion` with two options, conditioned on
   step 1: no PR → **Create** / **Abort**; PR exists → **Edit** / **Abort**.
   Create runs `gh pr create --base "$BASE" --title --body`; Edit runs
   `gh pr edit --body`.
   Abort prints nothing more.

## Razor

The "WRITE — commits, PRs, comments" section in `skills/razor/SKILL.md` keeps
the review-comment and code-comment rules. Its commit and PR-body paragraphs
and the example block become one line: "Commits and PR bodies follow
`ledger`; run it or read its rules." The `## Boundaries` line updates to
match.

## Ship

- `skills/ledger/SKILL.md`, frontmatter strict YAML, description with the
  trigger phrases "write a commit message", "commit this", "write the PR
  description", "open a PR".
- `tests/skill-invariants.test.js`: split the test `razor WRITE section keeps
  its rules for PR bodies and code comments`. Razor keeps `Two lines at
  most`, `was replaced or removed`, `justifies the decision`, and gains
  `ledger`. A new test on `skills/ledger/SKILL.md` asserts the three
  headings `## What changed`, `## Most impactful`, `## Proof scenarios`, the
  strings `Co-Authored-By` and `Claude-Session` (the forbidden-footer rule),
  and `no verification section`. The `tldr` walk covers the new file for
  free.
- README: a row in the Skills table, "other four" → "other five", a `ledger`
  section after `proof`.
- `plugin.json` description and `marketplace.json` `plugins[0].description`
  name `ledger`.
- Minor bump `1.10.0` → `1.11.0` in all three places.
- Memory note `pr-bodies-bullets-only.md`: rewrite to the three-section
  bullet form and drop the line that says to keep an attribution footer.

## Out of scope

Staging files, splitting commits, amending, rebasing, pushing, changing a
PR's base or reviewers. `~/.claude/skills/commit` is a source to copy from,
not a dependency; the user deletes it once `ledger` replaces it.
