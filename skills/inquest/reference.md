# inquest — command reference

Mechanics for `SKILL.md`. Each section is referenced from a phase. The rules
live in `SKILL.md`; this file only holds the how.

## 1. Shared identifiers (Phase 4)

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)
HEAD_SHA=$(gh pr view <N> --json headRefOid -q .headRefOid)
ME=$(gh api user -q .login 2>/dev/null \
  || gh api graphql -f query='{viewer{login}}' -q .data.viewer.login 2>/dev/null)
# last resort: git config user.name / user.email matched against the PR author.
# Best-effort only — a git identity can differ from the GitHub login.
```

Retry transient 503/404 with backoff (3 attempts, 1s/2s/4s) before treating
data as unavailable.

## 2. Prior state + CI pulls (Phase 4)

```bash
gh pr view <N> --json reviews,comments            # sticky lives in comments
gh api repos/{owner}/{repo}/pulls/<N>/comments --paginate
#   each: .path, .line / .original_line, .body, .user.login, .id, .in_reply_to_id
gh pr checks <N>   # or: gh api repos/{owner}/{repo}/commits/"$HEAD_SHA"/check-runs
```

`--paginate` concatenates one JSON array per page — parse per page or add
`--slurp` and flatten.

### GraphQL fallback for inline comments (REST 503/404)

```bash
gh api graphql -f query='
{ repository(owner:"'"$OWNER"'", name:"'"$REPO"'") {
    pullRequest(number: <N>) {
      reviewThreads(first: 100) { nodes {
        isResolved
        comments(first: 50) { nodes { databaseId path line body author { login } } }
      } }
    } } }'
```

Mapping: GraphQL `author.login` = REST `user.login`; `databaseId` = REST `id`
(pass as `in_reply_to_id` for replies). `isResolved` is the reliable
resolved-signal. No `databaseId` available → restrict the fallback to the
"stay silent" dedup action; never reply without a target id.

## 3. Codex head guard — catch-up path (Phase 2)

Only when `$CODEX_DIR` is a `bench` worktree — its branch is
`inquest/<N>` — and `$CUR` differs from `$HEAD_SHA`, which means the PR
gained commits after the worktree was provisioned:

```bash
git -C "$CODEX_DIR" fetch origin pull/<N>/head
git -C "$CODEX_DIR" checkout -B inquest/<N> FETCH_HEAD
git -C "$CODEX_DIR" rev-parse HEAD          # must now equal $HEAD_SHA
```

The branch moves forward; the worktree is never detached. Phases 3–5 then
read the same tree Codex does, and `bench --archive` can still find the
worktree by its `branch refs/heads/inquest/<N>` line.

In any other directory, do not move the checkout. Record
`invalid — working tree is not at the PR head` and skip Codex.

## 4. Codex invocation + output (Phases 2 and 6)

```bash
if [ -n "$BASE" ]; then
  node "$COMPANION" adversarial-review --cwd "$CODEX_DIR" --base "$BASE" --scope branch
else
  node "$COMPANION" adversarial-review --cwd "$CODEX_DIR" --scope branch
fi
```

Ignore the verbose `[codex] …` progress lines.

`adversarial-review` takes `--base <ref>`, `--scope <auto|working-tree|branch>`,
`--model` and `--cwd <path>` as values, and `--json`, `--wait`, `--background`
as switches. Anything else on the line is focus text. `node "$COMPANION"
--help` prints the usage if you need to check. Parse the tail: the last assistant-message
JSON carries `verdict` and `summary`; findings are in the final review text
before it.

## 5. Single reviews POST (Phase 8)

One JSON payload — `event`, `body`, `comments[]` — via `--input` with **no
`-f` fields** (mixing `-f` with `--input` drops the body and strands a
PENDING review):

```bash
cat > review.json <<'JSON'
{
  "event": "REQUEST_CHANGES",
  "body": "Request changes — three unaudited callsites. Score and detail in the sticky; findings in the inline threads.",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT",
      "body": "[Warning] <fix> — <named failure mode>" }
  ]
}
JSON
gh api --method POST repos/{owner}/{repo}/pulls/<N>/reviews --input review.json
```

Each comment: `path` relative to repo root, `line` present in the diff hunks,
`side: RIGHT` for added/changed lines. Off-diff finding → fold into the sticky
(GitHub rejects comments off the diff). Empty `comments[]` still submits the
verdict.

## 6. Labels (Phase 8, non-self-authored only)

```bash
# APPROVE:
gh label create claude-approved --color 2ea44f --description "inquest passed" 2>/dev/null || true
gh pr edit <N> --add-label claude-approved 2>/dev/null || true
# REQUEST_CHANGES or downgraded COMMENT:
gh pr edit <N> --remove-label claude-approved 2>/dev/null || true
```

## 7. Provenance SHAs (Phase 8)

```bash
BASE=$(gh pr view <N> --json baseRefName -q .baseRefName)
BASE_SHA=$(gh pr view <N> --json baseRefOid -q .baseRefOid)
# worktree mode — report the merge-base the three-dot diff actually used:
HEAD_SHA=$(git rev-parse HEAD)
BASE_SHA=$(git merge-base HEAD "origin/$BASE")
```

Both paths report the base the diff compared against.

## 8. Sticky post/update (Phase 8)

Post the **contents** of `sticky.md`, never its path.
**Never `-f body=@file`** — lowercase `-f` posts the literal string `@file`.
Use `$(cat file)` or `-F` (capital, reads the file).

```bash
STICKY_ID=$(gh api repos/{owner}/{repo}/issues/<N>/comments --paginate \
  -q '.[] | select(.body | contains("<!-- inquest:sticky -->")) | .id' | head -1)
# non-empty → update in place:
gh api -X PATCH repos/{owner}/{repo}/issues/comments/$STICKY_ID -f body="$(cat sticky.md)"
# else create:
gh api repos/{owner}/{repo}/issues/<N>/comments -f body="$(cat sticky.md)"
```
