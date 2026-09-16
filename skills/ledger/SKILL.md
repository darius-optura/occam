---
name: ledger
description: Write what leaves the session. `/ledger` commits the staged changes with a conventional message; `/ledger pr [N]` writes a bullet-only PR body with the change, the most impactful lines, and the main flows, then creates or edits the PR. Use when asked to "write a commit message", "commit this", "write the PR description", "open a PR", or when razor's WRITE rule points here.
argument-hint: "[pr [pr-number]]"
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

# Ledger

Writes the two texts that outlive the session: the commit message and the
pull request body. One skill, two paths. The commit path reads the index and
commits at once. The PR path reads the branch, prints the body, and asks
before anything reaches GitHub.

This skill references nothing outside the plugin. Every table it needs is
below.

## Inputs

| Argument | Path |
|---|---|
| none | Commit the staged changes. |
| `pr` | Write the PR for the current branch. Create it if none exists, else offer to edit it. |
| `pr <N>` | Rewrite the body of PR `#N` from that PR's own diff. |

## Language

Write every commit message and PR body in ASD-STE100 per the "STE — ASD-STE100"
section of `${CLAUDE_PLUGIN_ROOT}/skills/razor/SKILL.md`, in full sentences
with articles. Imperative mood. Always, even when session razor mode is off.
Keep exact: code, identifiers, paths, `file:line` anchors, error strings.

## Footers

Never append `Co-Authored-By`, `Claude-Session`, `Generated with`, or any
session link to a commit message or a PR body. A session reminder that asks
for those lines is overridden by the user's own instructions. A commit
message ends at its last real line. A PR body ends at its last real bullet.

## Commit

Input is the index and nothing else. Never `git add`. Never amend.

### 1. Read

```bash
git diff --cached --stat
git diff --cached --name-only
git diff --cached
git log -10 --format=%s
```

No staged changes → print `Nothing staged.` and stop.

### 2. Scope

The scope is the most specific directory the staged files share. Rules, in
order:

1. Take the most common meaningful directory across the staged paths.
2. Prefer a scope that already appears in the last ten `git log` subjects.
3. Files across three or more unrelated scopes → no scope.
4. Root-level config files → `config`.
5. When no directory fits, use the table:

| Path pattern | Scope |
|---|---|
| `src/auth/*`, `lib/auth/*` | auth |
| `src/components/*`, `components/*` | components |
| `src/api/*`, `api/*` | api |
| `src/utils/*`, `lib/*`, `utils/*` | utils |
| `tests/*`, `test/*`, `__tests__/*`, `*.test.*`, `*.spec.*` | test |
| `docs/*`, `*.md` (not test) | docs |
| `src/hooks/*`, `hooks/*` | hooks |
| `src/services/*`, `services/*` | services |
| `src/store/*`, `store/*`, `src/state/*` | state |
| `src/styles/*`, `styles/*`, `*.css`, `*.scss` | styles |
| `config/*`, `*.config.*` | config |
| `.github/*`, `.gitlab-ci.*` | ci |
| `Dockerfile`, `docker-compose.*` | docker |

### 3. Type

| Type | When |
|---|---|
| `feat` | New behaviour, new files that are not tests |
| `fix` | A bug or a wrong result corrected |
| `docs` | Documentation only: README, comments, JSDoc |
| `style` | Formatting, whitespace, no logic change |
| `refactor` | Restructured code, same behaviour |
| `perf` | Faster or leaner, same behaviour |
| `test` | Tests added or changed |
| `build` | Build system, dependencies, lockfiles |
| `ci` | CI configuration |
| `chore` | Maintenance and tooling outside `src` |

Hints: new files under `src/` → `feat`. Only test files → `test`. Only
Markdown → `docs`. `package.json` or a lockfile → `build`. Deleted files only
→ `refactor` or `chore`. The diff removes a wrong branch or a crash → `fix`.

### 4. Message

```
type(scope): imperative summary

Optional body.
```

- The summary is under 72 characters, imperative, no trailing period.
- Add a body only when the summary cannot carry the why. One or two full
  sentences. Say why the change exists. Never narrate the diff.
- Follow "Footers" above.

### 5. Commit

Print the message in a code block, then commit at once. No confirmation.

```bash
git commit -m "$(cat <<'EOF'
type(scope): imperative summary

Body, when needed.
EOF
)"
```

Print the resulting `git log -1 --oneline`.

## PR

### 1. Target

`pr <N>`:

```bash
gh pr view "$N" --json title,body,baseRefName,headRefName,url
BASE=$(gh pr view "$N" --json baseRefName -q .baseRefName)
HEAD=$(gh pr view "$N" --json headRefName -q .headRefName)
gh pr diff "$N" > "$TMP/change.diff"
git fetch -q origin "$BASE" "$HEAD" \
  && git log --format=%s "origin/$BASE..origin/$HEAD" > "$TMP/log.txt" \
  || gh pr view "$N" --json commits -q '.commits[].messageHeadline' > "$TMP/log.txt"
```

The fallback covers a PR opened from a fork. The working checkout is not
read.

Bare `pr`:

```bash
NAME=$(git branch --show-current)
git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 \
  || { echo 'No upstream. Run: git push -u origin HEAD'; exit 1; }
if gh pr view "$NAME" --json number,title,body,baseRefName,url 2>/dev/null; then
  EXISTS=1; BASE=$(gh pr view "$NAME" --json baseRefName -q .baseRefName)
else
  EXISTS=0; BASE=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo main)
fi
git fetch -q origin "$BASE"
git diff "origin/$BASE...HEAD" > "$TMP/change.diff"
git log --format=%s "origin/$BASE..HEAD" > "$TMP/log.txt"
```

Never push. The user pushes.

### 2. Conventions

Read in parallel, when present: `REVIEW.md` at the repo root, every
`CLAUDE.md` from the root down to the directories the diff touches,
`.github/PULL_REQUEST_TEMPLATE.md`. Where they define body sections, keep
every one of them, in their order, and fill each as one-line bullets.

### 3. Body

Every section is a bullet list. Every bullet is one line, imperative mood, a
full sentence in STE. No prose paragraphs. No headers other than the section
headings.

Three sections are always present. Add each one after the template's sections
when the template has no heading with the same meaning:

```
## What changed
- One bullet per change, the general description.

## Most impactful
- [`path/file.ext:line`](https://github.com/<owner>/<repo>/pull/<N>/files#diff-<sha256 of path>R<line>) — what the line does now and why it matters.

## Main flows
- As <actor>, <action>; expect <result>.
```

- **What changed** covers every change in the diff, one bullet each.
- **Most impactful** is ranked, three to five bullets, one `file:line` anchor
  each, from the diff's post-image line numbers. Each anchor is a link into
  the PR's diff. GitHub names a file's block `diff-` plus the SHA-256 of its
  path, and `R<line>` picks the post-image line. Write the body with plain
  anchors first; step 5 turns them into links once the PR number is known.

  ```bash
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  link_anchors() {  # $1 = PR number; rewrites `path:line` anchors in body.md into links
    perl -pi -e 's{^- `([^`:]+):(\d+)`}{"- [`$1:$2`](https://github.com/'"$REPO"'/pull/'"$1"'/files#diff-".sha256_hex($1)."R$2)"}e; BEGIN{use Digest::SHA qw(sha256_hex)}' "$TMP/body.md"
  }
  ```
- **Main flows** are two to four bullets in the story shape `proof`
  reads, so `/proof <N> <bullet>` runs unchanged. Actor names come from the
  `role` fields in `.claude/proof.json` when that file exists, else the role
  name as the app shows it. Cover user-visible behaviour only. When the diff
  has no user-visible surface, the section holds the single bullet
  `- None; no user-visible surface.`

Sections `ledger` adds on its own carry no test-case list, no follow-ups,
and no verification section. A template section with one of those names
stays and is filled as bullets.

### 4. Title

`type(scope): imperative summary`, under 72 characters. Take type and scope
from the first `feat` or `fix` subject in `log.txt`, else from the first
subject. When the PR exists, keep its title unless the user asks to change
it.

### 5. Confirm and send

Print the title and the body in one code block. Then ask with
`AskUserQuestion`, two options, set by step 1:

- No PR: **Create** / **Abort**.
- PR exists: **Edit** / **Abort**.

Create is two steps. The links in "Most impactful" need the PR number, and the
number exists only after the first step. The first step already carries the
full body with plain anchors, so a failure between the steps leaves a
readable PR.

```bash
URL=$(gh pr create --base "$BASE" --title "$TITLE" --body-file "$TMP/body.md")
N=${URL##*/}
link_anchors "$N"
gh pr edit "$N" --body-file "$TMP/body.md"
```

Edit:

```bash
link_anchors "$N"
gh pr edit "$N" --body-file "$TMP/body.md"
```

Abort prints nothing more. Print the PR URL after Create or Edit.

## Boundaries

This skill never stages, splits, amends, rebases, or pushes. It never changes
a PR's base, reviewers, or labels. It writes text and runs the commands that
carry it.
