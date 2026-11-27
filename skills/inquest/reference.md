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
gh pr checks <N>   # or: gh api repos/{owner}/{repo}/commits/"$HEAD_SHA"/check-runs
```

Threads come from GraphQL, the only source of `isResolved` and `isOutdated`.
Fetch every page: a PR with more than 100 threads loses dedup otherwise.
Strip control characters before `jq`; one raw byte in a body breaks the parse.

```bash
CURSOR=null; : > threads.jsonl
while :; do
  page=$(gh api graphql -F owner="$OWNER" -F repo="$REPO" -F n=<N> -F after="$CURSOR" -f query='
    query($owner:String!,$repo:String!,$n:Int!,$after:String){ repository(owner:$owner,name:$repo){ pullRequest(number:$n){
      reviewThreads(first:100, after:$after){ pageInfo{hasNextPage endCursor} nodes{
        isResolved isOutdated path line originalLine
        comments(first:100){ nodes{ databaseId body author{login} } } } } } } }' \
    | LC_ALL=C tr -d '\000-\010\013\014\016-\037')
  printf '%s' "$page" | jq -c '.data.repository.pullRequest.reviewThreads.nodes[]' >> threads.jsonl
  [ "$(printf '%s' "$page" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')" = true ] || break
  CURSOR=$(printf '%s' "$page" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')
done
```

Each replier's permission, once per login. A bot or an unknown login has
none, and its reply is never a decline:

```bash
for login in $(jq -r '.comments.nodes[].author.login' threads.jsonl | sort -u); do
  printf '%s %s\n' "$login" "$(gh api "repos/$OWNER/$REPO/collaborators/$login/permission" -q .permission 2>/dev/null || echo none)"
done > permissions.txt
```

One thread per line. `line` is null on an outdated thread; use `originalLine`.
`databaseId` is the REST comment id: pass the first comment's as
`in_reply_to_id` for a reply. A thread with no `databaseId` gets the "stay
silent" dedup action only; never reply without a target id.

## 3. Codex head guard — catch-up path (Phase 2)

Only when `$CODEX_DIR` is a `bench` worktree — the state map's `path` for
`<N>` — and `$CUR` differs from `$HEAD_SHA`, which means the PR gained
commits after the worktree was provisioned.

Same-repo PR — the worktree is on the PR's branch and tracks it:

```bash
git -C "$CODEX_DIR" pull --ff-only
git -C "$CODEX_DIR" rev-parse HEAD          # must now equal $HEAD_SHA
```

A failed fast-forward means the local branch diverged from the PR. Do not
reset it — it can hold the user's work. Record
`invalid — working tree is not at the PR head` and skip Codex.

Fork PR — the worktree is on `inquest/<N>`, which nobody works on:

```bash
git -C "$CODEX_DIR" fetch origin pull/<N>/head
git -C "$CODEX_DIR" checkout -B inquest/<N> FETCH_HEAD
git -C "$CODEX_DIR" rev-parse HEAD          # must now equal $HEAD_SHA
```

The branch moves forward; the worktree is never detached. Phases 3–5 then
read the same tree Codex does, and `bench --archive` can still find the
worktree by its `branch` line.

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
  "commit_id": "<HEAD_SHA>",
  "event": "REQUEST_CHANGES",
  "body": "> [!NOTE]\n> Posted by Claude on behalf of <NAME>.\n\nRequest changes — three unaudited callsites. Score and detail in the sticky; findings in the inline threads.",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT",
      "body": "> [!NOTE]\n> Posted by Claude on behalf of <NAME>.\n\n[Warning] <fix> — <named failure mode>" },
    { "path": "src/cart.py", "line": 17, "side": "RIGHT",
      "body": "> [!NOTE]\n> Posted by Claude on behalf of <NAME>.\n\n[Critical] <fix> — <named failure mode>\n\n<details>\n<summary>Repro</summary>\n\n`.prove/2/test_total.py`\n```python\n<source>\n```\n\nRun from the repo root: `<repro command>`\n```text\n<output>\n```\n\n</details>" }
  ]
}
JSON
out=$(gh api --method POST repos/{owner}/{repo}/pulls/<N>/reviews --input review.json 2>&1) || case "$out" in
  *"HTTP 422"*)   # one anchor is off the diff: post the verdict alone, then each comment alone
    jq 'del(.comments)' review.json | gh api --method POST repos/{owner}/{repo}/pulls/<N>/reviews --input -
    jq -c --arg sha "$HEAD_SHA" '.comments[] | . + {commit_id: $sha}' review.json | while read -r c; do
      printf '%s' "$c" | gh api --method POST repos/{owner}/{repo}/pulls/<N>/comments --input - >/dev/null \
        || echo "OFF_DIFF $(printf '%s' "$c" | jq -r '"\(.path):\(.line)"')"
    done ;;
  *) echo "$out"; false ;;
esac
```

`commit_id` pins every thread to the reviewed head. A 422 on the batch means
one comment's line is not in the diff at that commit; the fallback keeps the
verdict and every comment that does anchor. Fold each `OFF_DIFF` finding into
the sticky, then run `check-sticky.sh` again before the sticky posts. Any
other failure stops the post.

Every `body` — the review's and each comment's — opens with the on-behalf
alert from razor WRITE; `<NAME>` is `git config user.name`. The same alert
opens every reply posted in Phase 8.

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
