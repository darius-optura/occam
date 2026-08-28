---
name: bench
description: Provision or archive an isolated git worktree for a GitHub PR, through Supacode, herdr, or plain git — whichever is installed. Use when asked to "work on PR #N in isolation", spin up a worktree for a PR, or clean one up. `/bench <N>` provisions; `/bench --archive <N>` archives.
---

# Bench

Provisions (or archives) an isolated worktree for a GitHub PR, on branch
`inquest/<N>`, checked out at the PR's head SHA. Any "work on PR #N in
isolation" task uses this, not only review — `inquest` delegates to it for
worktree lifecycle rather than duplicating this logic.

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

```bash
if   [ -n "${BENCH_BACKEND:-}" ];          then BACKEND="$BENCH_BACKEND"
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

1. Resolve the PR's head branch and author:
   ```bash
   gh pr view <N> --json headRefName,headRepositoryOwner,isCrossRepository,author
   ```
2. Fetch the PR head — this works cross-fork because GitHub exposes
   `pull/<N>/head` on `origin` regardless of which fork the PR comes from.
   Stop if the fetch fails, so the next step can't read a stale
   `FETCH_HEAD` left over from an earlier fetch:
   ```bash
   git fetch origin pull/<N>/head || { echo "fetch failed for PR <N>"; exit 1; }
   SHA=$(git rev-parse FETCH_HEAD)
   ```
3. Delete a stale local branch from a prior run, if present:
   ```bash
   git branch -D inquest/<N> 2>/dev/null || true
   ```
4. Create the worktree with the resolved backend. Resolve `MAIN_ROOT` first
   — see "State file" below.

   **supacode** — capture the printed ID in the same Bash call that creates
   the worktree. Per the Supacode ID-tracking rule the ID is never
   re-derived after the fact, only captured at creation. Take the last line
   of stdout; this assumes the ID is the final line Supacode prints, and
   breaks if `worktree-new` starts emitting progress noise after it:
   ```bash
   WT_ID=$(supacode repo worktree-new --branch inquest/<N> --name inquest-<N> --base "$SHA" | tail -n1)
   ```
   `worktree-new` creates the branch, so pass the fetched SHA as `--base`
   rather than an existing ref.

   Supacode does not print the path, so resolve `WT_PATH` from `git worktree
   list --porcelain` — the output is a sequence of `worktree <path>` /
   `HEAD <sha>` / `branch <ref>` triples per worktree. Find the block whose
   `branch` line is `refs/heads/inquest/<N>` and read the `worktree <path>`
   line two lines above it, the first line of that block:
   ```bash
   git worktree list --porcelain
   ```

   **herdr** — `herdr worktree create` opens the worktree as a workspace.
   Pass `--no-focus` so provisioning never steals the pane the user is in:
   ```bash
   herdr worktree create --cwd "$MAIN_ROOT" --branch inquest/<N> \
     --base "$SHA" --label inquest-<N> --no-focus
   ```
   Then read both values back from the list, which has a stable shape:
   ```bash
   herdr worktree list --cwd "$MAIN_ROOT" \
     | jq -r --arg b "inquest/<N>" \
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
   git worktree add "$WT_PATH" "$SHA"
   ```
   Leave `WT_ID` empty.

5. Confirm the checkout is at the PR's head before handing it to the caller:
   ```bash
   git -C "$WT_PATH" rev-parse HEAD    # must equal $SHA
   ```
   A mismatch means the branch was created from the wrong base. Stop and
   report it; do not review a tree that is not the PR.
6. Persist the mapping so `--archive` (and re-runs) can find this worktree
   again — see "State file" below. Record `BACKEND` with it.
7. Print `BACKEND`, `WT_ID` and `WT_PATH`, so the caller can move into it
   (e.g. `cd "$WT_PATH"`).

### When the backend's own create fails

If `supacode repo worktree-new` or `herdr worktree create` rejects the call
— the branch already exists and step 3's delete didn't run, or the manager
is unreachable — fall back to the **git** branch of step 4 and record
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
   ```
   (`$MAP` is resolved as in "State file" below.)
2. If the map has no entry, re-probe the backend as in "Backend" above and
   ask it for the worktree on branch `inquest/<N>`:
   - **supacode**, **git** — scan `git worktree list --porcelain` for the
     block whose `branch` line is `refs/heads/inquest/<N>`, and read its
     `worktree <path>` line, two lines above.
   - **herdr** — `herdr worktree list --cwd "$MAIN_ROOT"`, select on
     `.branch == "inquest/<N>"`, take `.path` and `.open_workspace_id`.
3. If nothing resolves, stop and report: "no worktree for PR <N>" — there is
   nothing to archive.
4. Remove the `<N>` entry from the map **first** — see the delete command in
   "State file" below. This has to happen before the archive call: if the
   caller is running from inside the worktree being archived, archiving
   closes that surface, and nothing scripted after it can be relied on to
   still run.
5. Archive as the final operation, with nothing after it in this flow:

   **supacode**
   ```bash
   supacode worktree archive -w "$WT_ID"
   ```
   With no `WT_ID`, percent-encode the absolute path and use that
   (`jq -rn --arg p "$WT_PATH" '$p|@uri'`, which encodes `/` as `%2F`).
   **Unverified — confirm at live test** that this is the exact ID shape
   `supacode worktree archive -w` accepts, and that this subcommand form is
   what the installed CLI takes. Supacode is not installed on the machine
   this skill was written on.

   **herdr**
   ```bash
   herdr worktree remove --workspace "$WT_ID" --force
   ```

   **git**
   ```bash
   git worktree remove "$WT_PATH" --force
   git branch -D inquest/<N> 2>/dev/null || true
   ```

## State file

Plain JSON, no code — both `bench` and `inquest` read/write it with `jq`.
Lives at the main repo root (not inside any worktree), so it survives
worktree archival and is visible from every worktree:

```json
{ "1234": { "backend": "herdr", "id": "<WT_ID or empty>", "path": "/abs/path/inquest-1234" } }
```

`backend` is required. `id` is empty for the `git` backend.

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
jq --arg n "<N>" --arg b "$BACKEND" --arg id "$WT_ID" --arg p "$WT_PATH" \
   '.[$n] = {backend:$b, id:$id, path:$p}' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```

Delete an entry (used by the archive flow, before the archive call):

```bash
tmp=$(mktemp)
jq --arg n "<N>" 'del(.[$n])' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```

## Principles

- **Probe, never assume.** Print the resolved backend before using it. A
  machine with no workspace manager is a supported machine, not an error.
- **The map remembers the backend.** Archive uses the backend that created
  the worktree, not the one that happens to be installed now.
- **No side effects beyond the worktree itself.** This skill does not touch
  GitHub beyond the read-only `gh pr view` lookup and the fetch. It never
  posts, comments, or reviews.
- **Archive is always last.** Nothing in this skill runs after the archive
  call. Clean up bookkeeping (the map entry) before it, not after.
- **Capture IDs at creation, don't re-derive them.** `WT_ID` is only ever
  trustworthy as the value the backend printed at creation. If that capture
  is lost, ask the backend for its list rather than guessing.
- **No hardcoded absolute paths.** Resolve `MAIN_ROOT`, worktree paths, and
  the repo owner dynamically; never assume a specific machine's home
  directory layout.
