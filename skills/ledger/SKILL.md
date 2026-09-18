---
name: ledger
description: Write what leaves the session. `/ledger` commits the staged changes with a conventional message; `/ledger pr [N]` writes a bullet-only PR description of the change, posts one comment with the most impactful lines, an optional shape diagram, and the main flows, links the two, then creates or edits the PR. Use when asked to "write a commit message", "commit this", "write the PR description", "open a PR", or when razor's WRITE rule points here.
argument-hint: "[pr [pr-number]]"
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion
---

# Ledger

Writes the two texts that outlive the session: the commit message and the
pull request body. One skill, two paths. The commit path reads the index and
commits at once. The PR path reads the branch, prints the description and the details
comment, and asks before anything reaches GitHub.

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

### 2. Policy file

When `.github/pr-metadata.json` exists, read it first. Its `types`, `scopes`,
`scopeAliases`, and `maxTitleLength` override the tables below. Use only a
type and a canonical scope it lists; map an alias to its canonical name.
The tables below are the fallback for a repo without that file.

### 3. Scope

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

### 4. Type

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
| `infra` | Infrastructure or deployment |
| `chore` | Maintenance and tooling outside `src` |

Hints: new files under `src/` → `feat`. Only test files → `test`. Only
Markdown → `docs`. `package.json` or a lockfile → `build`. Deleted files only
→ `refactor` or `chore`. The diff removes a wrong branch or a crash → `fix`.

### 5. Message

```
type(scope): imperative summary

Optional body.
```

- The summary is under 72 characters, imperative, no trailing period. Its
  first letter is lowercase. No ticket IDs in the summary; they go in the
  body or the branch name.
- Add a body only when the summary cannot carry the why. One or two full
  sentences. Say why the change exists. Never narrate the diff.
- Follow "Footers" above.

### 6. Commit

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

Read in parallel, when present: `.github/pr-metadata.json` (see "Policy
file" above; it governs the title), `REVIEW.md` at the repo root, every
`CLAUDE.md` from the root down to the directories the diff touches, and the
PR template. Find the template by name in any case, in `.github/`, `docs/`,
or the root:

```bash
find .github docs . -maxdepth 1 -iname 'pull_request_template.md' 2>/dev/null | head -1
```

Where the template or `REVIEW.md` defines body sections, keep every one of
them, in their order, and fill each as one-line bullets. A section named
Verification, Testing, or Checks lists the commands this session ran and
their results, one bullet each, taken from the session's own output. When
nothing ran, write one bullet that says what was not run and why. Never
invent a result.

### 3. Body

Every block is a bullet list. Every bullet is one line, imperative mood, a
full sentence in STE. No prose paragraphs. No headings other than the ones
below.

The body is two files. `body.md` is the PR description: the change bullets,
any template sections, and one `Details:` line. `details.md` is one PR
comment: the on-behalf alert, a marker, then Most impactful, Shape when the
diff changes structure, and Main flows. The description stays short, so a
squash merge carries only the change bullets into the commit.

`body.md`:

```
- One bullet per change, the general description. No heading above these.

Details: <link to the ledger comment, filled in step 5>
```

`details.md`:

```
> [!NOTE]
> Posted by Claude on behalf of <name>.

<!-- ledger:details -->
<details>
<summary>Most impactful</summary>

- [`path/file.ext:line`](https://github.com/<owner>/<repo>/pull/<N>/files#diff-<sha256 of path>R<line>) — what the line does now and why it matters.

</details>

<details>
<summary>Shape</summary>

```diff
 <one visual: file-tree, call-tree, or pseudocode diff, or a Mermaid sequence>
```

</details>

## Main flows
- As <actor>, <action>; expect <result>.
```

Template sections from step 2 stay in `body.md`, in their order, above the
`Details:` line. Add the three ledger blocks to `details.md` when the template
has no heading with the same meaning.

- **The change** opens the body. One bullet per change in the diff, no
  heading. What changed is the point of the PR; a title above it says
  nothing.
- **Most impactful** is collapsed by default; it is technical detail. Keep
  the blank line after `</summary>` and before `</details>`, or GitHub
  renders the bullets as plain text. Ranked, three to five bullets, one
  `file:line` anchor each, from the diff's post-image line numbers. Each
  anchor is a link into the PR's diff. GitHub names a file's block `diff-`
  plus the SHA-256 of its path, and `R<line>` picks the post-image line.
  Write the body with plain anchors first; step 5 turns them into links once
  the PR number is known.

  ```bash
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  link_anchors() {  # $1 = PR number, $2 = file; rewrites `path:line` anchors into links
    perl -pi -e 's{^- `([^`:]+):(\d+)`}{"- [`$1:$2`](https://github.com/'"$REPO"'/pull/'"$1"'/files#diff-".sha256_hex($1)."R$2)"}e; BEGIN{use Digest::SHA qw(sha256_hex)}' "$2"
  }
  ```
- **Shape** is optional and collapsed. Add it only when the diff moves or
  adds modules, changes call order, changes a branch, or adds a flow between
  two components. A text-only change or a change inside one function gets no
  Shape block. Most PRs carry none. One visual, never two; pick the smallest
  form that shows the change:

  | Change | Form |
  |---|---|
  | Modules moved or added | file-tree `diff` |
  | Call order changed | call-tree `diff` |
  | A branch or loop changed | pseudocode `diff` |
  | A new exchange between two components | Mermaid `sequenceDiagram` |

  ````
  ```diff
   src/
   ├── commands/
  +│   └── ledger.ts       # expands the slash command
  -└── transport.ts
  +└── transport/
  +    ├── client.ts
  +    └── stream.ts
  ```

  ```diff
   submitForm
     createSession
  +    expandSkillMention
       launchAgent
  ```

  ```diff
   on(save)
  -  write content
  +  if content is unchanged
  +    return cached result
  +  write new content
  ```

  ```mermaid
  sequenceDiagram
      participant UI
      participant Daemon
      UI->>Daemon: send expanded prompt
      Daemon-->>UI: stream result
  ```
  ````

  Keep only the files, calls, or states the change touches, plus the one
  parent that shows where they sit. Real names from the diff, no
  placeholders. Keep the blank line after `</summary>` and before
  `</details>`, or GitHub renders the fence as plain text. No HTML files;
  nothing hosts them.
- **Main flows** are two to four bullets in the story shape `proof`
  reads, so `/proof <N> <bullet>` runs unchanged. Actor names come from the
  `role` fields in `.claude/proof.json` when that file exists, else the role
  name as the app shows it. Cover user-visible behaviour only. When the diff
  has no user-visible surface, the section holds the single bullet
  `- None; no user-visible surface.`

Blocks `ledger` adds on its own carry no test-case list, no follow-ups,
and no verification section. A template section with one of those names
stays in `body.md` and is filled as bullets.

### 4. Title

`type(scope): imperative summary`, under 72 characters or the policy file's
`maxTitleLength`. The summary starts lowercase, ends without a period, and
carries no ticket ID. Take type and scope from the first `feat` or `fix`
subject in `log.txt`, else from the first subject; map an alias to its
canonical scope when the policy file exists. When the PR exists, keep its
title unless the user asks to change it.

### 5. Confirm and send

Print the title, `body.md`, and `details.md` in one code block. Then ask with
`AskUserQuestion`, two options, set by step 1:

- No PR: **Create** / **Abort**.
- PR exists: **Edit** / **Abort**.

Create is one chained command. The comment needs the PR number, and the
description needs the comment's URL, so the order is create, comment, edit.
A failure mid-chain leaves a PR with the change bullets and a bare
`Details:` line; rerun `/ledger pr` to finish it.

```bash
URL=$(gh pr create --base "$BASE" --title "$TITLE" --body-file "$TMP/body.md") \
&& N=${URL##*/} && link_anchors "$N" "$TMP/details.md" \
&& C=$(gh api "repos/$REPO/issues/$N/comments" -F body=@"$TMP/details.md" -q .html_url) \
&& perl -pi -e 's{^Details: .*$}{Details: '"$C"'}' "$TMP/body.md" \
&& gh pr edit "$N" --body-file "$TMP/body.md"
```

Edit updates the marked comment in place, or creates it when missing, then
refreshes the description. Never post a second details comment.

```bash
link_anchors "$N" "$TMP/details.md"
CID=$(gh api "repos/$REPO/issues/$N/comments" --paginate \
  -q '.[] | select(.body | contains("<!-- ledger:details -->")) | .id' | head -1)
if [ -n "$CID" ]; then
  C=$(gh api -X PATCH "repos/$REPO/issues/comments/$CID" -F body=@"$TMP/details.md" -q .html_url)
else
  C=$(gh api "repos/$REPO/issues/$N/comments" -F body=@"$TMP/details.md" -q .html_url)
fi
perl -pi -e 's{^Details: .*$}{Details: '"$C"'}' "$TMP/body.md"
gh pr edit "$N" --body-file "$TMP/body.md"
```

`-F body=@file` reads the file; lowercase `-f` would post the literal string.

Abort prints nothing more. Print the PR URL after Create or Edit.

## Boundaries

This skill never stages, splits, amends, rebases, or pushes. It never changes
a PR's base, reviewers, or labels. It writes text and runs the commands that
carry it.
