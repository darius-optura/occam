---
name: bench
description: >-
  Provision or archive an isolated git worktree for a GitHub PR, through the hw fish function,
  Supacode, herdr, or plain git — whichever is installed. Use when asked to "work on PR #N in
  isolation", spin up a worktree for a PR, or clean one up. `/bench <N>` provisions;
  `/bench --archive <N>` archives.
---

# Bench

Provisions (or archives) an isolated worktree for a GitHub PR, on the PR's
own branch (tracking `origin`), checked out at the PR's head SHA. A fork PR
has no branch on `origin`, so it lands on `inquest/<N>` instead. Any "work
on PR #N in isolation" task uses this, not only review — `inquest`
delegates to it for worktree lifecycle rather than duplicating this logic.

This skill only manages the worktree. It does not review code, post to
GitHub, or run tests.

## Inputs

Parse by format, not position:

- `<pr-number>` — provision a worktree for this PR.
- `--archive <pr-number>` — archive the worktree for this PR instead of
  creating one.

Exactly one of these is expected per invocation.

## Backend

Resolve `BACKEND` first. Do not assume a workspace manager is present.

`hw` is a fish function (not on PATH), so probe it through fish. It wraps
herdr and does more than a worktree — it runs the repo's `.herdr/setup.sh`
(deps, database, doc symlinks) and lays out the workspace — so it wins over
bare herdr whenever both are present:

```bash
if   [ -n "${BENCH_BACKEND:-}" ];          then BACKEND="$BENCH_BACKEND"
elif command -v fish >/dev/null 2>&1 \
     && fish -c 'type -q hw' 2>/dev/null;  then BACKEND=hw
elif command -v supacode >/dev/null 2>&1;  then BACKEND=supacode
elif command -v herdr    >/dev/null 2>&1;  then BACKEND=herdr
else                                            BACKEND=git
fi
echo "backend=$BACKEND"
```

Print the result. A silent choice hides why a later command failed.

`BENCH_BACKEND` overrides the probe. Use it to exercise a path that is not
the one installed here, and to force plain git when a workspace manager is
present but unwanted.

The backend chosen at provision time is written to the state file, because
the archive flow must use the same one.

## Provision flow

`/bench <N>`:

1. Resolve the PR's head branch, head SHA and author:
   ```bash
   gh pr view <N> --json headRefName,headRefOid,headRepositoryOwner,isCrossRepository,author
   ```
   `SHA` is `headRefOid`. Resolve `MAIN_ROOT` now — see "State file" below.
2. Pick `WT_BRANCH`, the branch the worktree lands on:
   - **Same-repo PR** (`isCrossRepository` false) — the PR's own branch,
     `headRefName`. The worktree tracks `origin/<headRefName>`, so a
     `git pull` or `git push` inside it reaches the PR.
   - **Fork PR** — the head branch is not on `origin`, so nothing can track
     it. Use `inquest/<N>`, created at `pull/<N>/head`.
3. Fetch. Stop if the fetch fails, so no later step reads a stale ref:
   ```bash
   # same-repo
   git fetch origin "$WT_BRANCH" || { echo "fetch failed for $WT_BRANCH"; exit 1; }
   # fork — GitHub exposes pull/<N>/head on origin for every PR
   git fetch origin pull/<N>/head || { echo "fetch failed for PR <N>"; exit 1; }
   ```
4. Look for a local `WT_BRANCH` that already exists:
   ```bash
   git worktree list --porcelain     # block with "branch refs/heads/$WT_BRANCH"?
   git show-ref --verify --quiet "refs/heads/$WT_BRANCH"
   ```
   - **Checked out in a linked worktree** → that is the PR's worktree. Set
     `WT_PATH` to it, keep the backend from the state map (else `git`), and
     go to step 6. Do not create a second one.
   - **Checked out in `MAIN_ROOT`** → stop and report: "`$WT_BRANCH` is
     checked out in the main checkout". git cannot check out one branch in
     two places, and bench does not switch the user's main checkout.
   - **Local branch, no worktree** → a fork's `inquest/<N>` is leftover from
     an earlier run: delete it (`git branch -D inquest/<N>`). A same-repo
     branch can carry the user's unpushed work: never delete it. Skip the
     workspace manager and use the **git** fallback below without `-b`.
   - **No local branch** → step 5.
5. Create the worktree with the resolved backend.

   **hw** — same-repo: give only the branch. With no base, `hw` fetches
   `origin/<branch>`, bases the worktree on it and sets the upstream. Fork:
   pass the fetched SHA, which `hw` uses as given. Run it from `MAIN_ROOT`
   — it resolves the repo from its cwd:
   ```bash
   ( cd "$MAIN_ROOT" && fish -c "hw '$WT_BRANCH'" )           # same-repo
   ( cd "$MAIN_ROOT" && fish -c "hw inquest/<N> $SHA" )       # fork
   ```
   `hw` creates `$MAIN_ROOT/.claude/worktrees/$WT_BRANCH`, runs the repo's
   `.herdr/setup.sh` if present, and starts a claude agent in the worktree.
   It refuses an existing directory — that lands in "When the backend's own
   create fails" below. Read `WT_PATH` and `WT_ID` back the same way as
   **herdr**.

   For the rest of this step, `BASE_REF` is `origin/$WT_BRANCH` for a
   same-repo PR and `$SHA` for a fork.

   **supacode** — capture the printed ID in the same Bash call that creates
   the worktree. Per the Supacode ID-tracking rule the ID is never
   re-derived after the fact, only captured at creation. Take the last line
   of stdout; this assumes the ID is the final line Supacode prints, and
   breaks if `worktree-new` starts emitting progress noise after it:
   ```bash
   WT_ID=$(supacode repo worktree-new --branch "$WT_BRANCH" --name inquest-<N> --base "$BASE_REF" | tail -n1)
   ```
   `WT_ID` is the worktree's percent-encoded path, the value `-w` takes.

   Supacode does not print the path, so resolve `WT_PATH` from `git worktree
   list --porcelain` — the output is a sequence of `worktree <path>` /
   `HEAD <sha>` / `branch <ref>` triples per worktree. Find the block whose
   `branch` line is `refs/heads/$WT_BRANCH` and read the `worktree <path>`
   line two lines above it, the first line of that block:
   ```bash
   git worktree list --porcelain
   ```

   **herdr** — `herdr worktree create` opens the worktree as a workspace.
   Pass `--no-focus` so provisioning never steals the pane the user is in.
   Pass `--path` — without it herdr puts the worktree under `~/.herdr`, not
   in the repo:
   ```bash
   herdr worktree create --cwd "$MAIN_ROOT" --branch "$WT_BRANCH" \
     --base "$BASE_REF" --label inquest-<N> --no-focus \
     --path "$MAIN_ROOT/.claude/worktrees/<owner>/inquest-<N>"
   ```
   Then read both values back from the list, which has a stable shape:
   ```bash
   herdr worktree list --cwd "$MAIN_ROOT" \
     | jq -r --arg b "$WT_BRANCH" \
       '.result.worktrees[] | select(.branch==$b) | .path, .open_workspace_id'
   ```
   First line is `WT_PATH`, second is `WT_ID`. `open_workspace_id` is the
   value `herdr worktree remove --workspace` accepts. Without `jq`, read the
   same two fields with `node -e` off the same JSON.

   **git** — no workspace manager, so there is no ID. Anchor the path to
   `MAIN_ROOT`, never a relative `.claude/worktrees/...`, which nests
   wrongly when this skill runs from inside an existing worktree.
   `<owner>` is `headRepositoryOwner` from step 1:
   ```bash
   WT_PATH="$MAIN_ROOT/.claude/worktrees/<owner>/inquest-<N>"
   git worktree add -b "$WT_BRANCH" "$WT_PATH" "$BASE_REF"
   ```
   `-b` is not optional when the branch is new. `git worktree add <path>
   <sha>` checks out a **detached HEAD**, and a detached worktree has no
   `branch` line in `git worktree list --porcelain` — so the archive flow's
   branch lookup would never find it.

   Step 4's existing same-repo branch is the one case without `-b` — the
   branch exists, so name it and bring it to the PR head. A failed
   fast-forward means the local branch has diverged from the PR: stop and
   report it, do not reset it:
   ```bash
   git worktree add "$WT_PATH" "$WT_BRANCH"
   git -C "$WT_PATH" merge --ff-only "origin/$WT_BRANCH"
   ```

   Leave `WT_ID` empty.

   Same-repo, every backend — make sure the branch tracks the PR. `hw` and
   git set this themselves; the other managers may not:
   ```bash
   git -C "$WT_PATH" branch --set-upstream-to="origin/$WT_BRANCH"
   ```
6. Confirm the checkout is at the PR's head before handing it to the caller:
   ```bash
   git -C "$WT_PATH" rev-parse HEAD    # must equal $SHA
   ```
   A mismatch means the branch was created from the wrong base, or a reused
   worktree is behind. In a reused same-repo worktree try
   `git -C "$WT_PATH" pull --ff-only` once. Still different → stop and
   report it; do not review a tree that is not the PR.
7. Persist the mapping so `--archive` (and re-runs) can find this worktree
   again — see "State file" below. Record `BACKEND` and `WT_BRANCH` with it.
8. Find the claude agent in the worktree, if the backend started one
   (**hw** does; the others do not):
   ```bash
   AGENT_PANE=$(herdr agent list 2>/dev/null | jq -r --arg p "$WT_PATH" \
     '.result.agents[]? | select(.agent=="claude" and .cwd==$p) | .pane_id' | head -n1)
   ```
9. Print `BACKEND`, `WT_BRANCH`, `WT_ID`, `WT_PATH` and `AGENT_PANE` (empty
   when there is none), so the caller can hand work to that agent or move
   into the worktree (e.g. `cd "$WT_PATH"`).

### When the backend's own create fails

If `hw`, `supacode repo worktree-new` or `herdr worktree create` rejects the
call — the worktree directory or branch already exists, or the manager
is unreachable (`hw` needs a running herdr server) — fall back to the
**git** branch of step 5 and record
`"backend": "git"` in the map. Say so in the output: the workspace manager
will not know about this worktree until it next refreshes its list.

Never record a backend the worktree was not actually created with. The
archive flow trusts that field.

## Archive flow

`/bench --archive <N>`:

1. Read the entry from the state map:
   ```bash
   BACKEND=$(jq -r --arg n "<N>" '.[$n].backend // empty' "$MAP" 2>/dev/null)
   WT_ID=$(jq   -r --arg n "<N>" '.[$n].id      // empty' "$MAP" 2>/dev/null)
   WT_PATH=$(jq -r --arg n "<N>" '.[$n].path    // empty' "$MAP" 2>/dev/null)
   WT_BRANCH=$(jq -r --arg n "<N>" '.[$n].branch // "inquest/\($n)"' "$MAP" 2>/dev/null)
   ```
   (`$MAP` is resolved as in "State file" below. An entry written before
   `branch` existed is on `inquest/<N>`.)
2. If the map has no entry, resolve `WT_BRANCH` as in provision steps 1–2,
   re-probe the backend as in "Backend" above, and ask it for the worktree
   on that branch:
   - **supacode**, **git** — scan `git worktree list --porcelain` for the
     block whose `branch` line is `refs/heads/$WT_BRANCH`, and read its
     `worktree <path>` line, two lines above. This works because every
     backend creates the branch; a worktree left on a detached HEAD has no
     `branch` line and cannot be found this way.
   - **hw**, **herdr** — `herdr worktree list --cwd "$MAIN_ROOT"`, select on
     `.branch == $WT_BRANCH`, take `.path` and `.open_workspace_id`.
3. If nothing resolves, stop and report: "no worktree for PR <N>" — there is
   nothing to archive.
4. A same-repo worktree is on the PR's real branch, and the user may have
   worked in it. Archiving deletes the checkout, and `hw-rm` also deletes
   the branch. Check both before anything is removed:
   ```bash
   git -C "$WT_PATH" status --porcelain                       # must be empty
   git -C "$WT_PATH" rev-list --count "@{upstream}..HEAD"     # must be 0
   ```
   Either one fails → stop and report the uncommitted files or unpushed
   commits. Do not archive. A fork's `inquest/<N>` skips this check.
5. Remove the `<N>` entry from the map **first** — see the delete command in
   "State file" below. This has to happen before the archive call: if the
   caller is running from inside the worktree being archived, archiving
   closes that surface, and nothing scripted after it can be relied on to
   still run.
6. Archive as the final operation, with nothing after it in this flow:

   **hw** — `hw-rm` runs the repo's `.herdr/teardown.sh` (drops the
   database, salvages docs) before it removes the worktree, so a worktree
   `hw` set up must come down through it:
   ```bash
   ( cd "$MAIN_ROOT" && fish -c "hw-rm '$WT_PATH'" )
   ```
   If `hw-rm` is absent (`fish -c 'type -q hw-rm'` fails), use the **herdr**
   command below with `WT_ID`.

   **supacode**
   ```bash
   supacode worktree archive -w "$WT_ID"
   ```
   With no `WT_ID`, percent-encode the absolute path and use that
   (`jq -rn --arg p "$WT_PATH" '$p|@uri'`, which encodes `/` as `%2F`).

   **herdr**
   ```bash
   herdr worktree remove --workspace "$WT_ID" --force
   ```

   **git**
   ```bash
   git worktree remove "$WT_PATH" --force
   git branch -D "$WT_BRANCH" 2>/dev/null || true
   ```
   Step 4 made sure the branch holds nothing that is not on `origin`.

## State file

Plain JSON, no code — both `bench` and `inquest` read/write it with `jq`.
Lives at the main repo root (not inside any worktree), so it survives
worktree archival and is visible from every worktree:

```json
{ "1234": { "backend": "herdr", "branch": "feat/x", "id": "<WT_ID or empty>", "path": "/abs/path/inquest-1234" } }
```

`backend` and `branch` are required. `id` is empty for the `git` backend.

Resolve the main repo root — this works correctly even when the skill is
invoked from inside a worktree, where `git rev-parse --show-toplevel` would
wrongly point at the worktree instead of the main checkout:

```bash
MAIN_ROOT=$(git rev-parse --path-format=absolute --git-common-dir | sed 's/\/\.git$//')
MAP="$MAIN_ROOT/.claude/worktrees/.inquest-map.json"
```

If this git's `rev-parse` doesn't support `--path-format` (older git), fall
back to the form below. Plain `dirname` on `--git-common-dir` can return a
relative path (e.g. `.`) depending on cwd, so resolve it to absolute via
`cd`+`pwd`:

```bash
MAIN_ROOT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)
```

Merge-write a mapping — never clobber other PRs' entries:

```bash
mkdir -p "$(dirname "$MAP")"
[ -f "$MAP" ] || echo '{}' > "$MAP"
tmp=$(mktemp)
jq --arg n "<N>" --arg b "$BACKEND" --arg br "$WT_BRANCH" --arg id "$WT_ID" --arg p "$WT_PATH" \
   '.[$n] = {backend:$b, branch:$br, id:$id, path:$p}' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```

Delete an entry (used by the archive flow, before the archive call):

```bash
tmp=$(mktemp)
jq --arg n "<N>" 'del(.[$n])' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```
