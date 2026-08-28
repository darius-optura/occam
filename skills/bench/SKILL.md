---
name: bench
description: Provision or archive a Supacode worktree for a GitHub PR. Use when asked to "work on PR #N in isolation", spin up a worktree for a PR, or clean one up. `/bench <N>` provisions; `/bench --archive <N>` archives.
---

# Bench

Provisions (or archives) an isolated Supacode worktree for a GitHub PR, on
branch `inquest/<N>`, checked out at the PR's head SHA. Any "work on PR #N
in isolation" task uses this, not only review — `inquest` delegates to it
for worktree lifecycle rather than duplicating this logic.

This skill only manages the worktree. It does not review code, post to
GitHub, or run tests.

## Inputs

Parse by format, not position:

- `<pr-number>` — provision a worktree for this PR.
- `--archive <pr-number>` — archive the worktree for this PR instead of
  creating one.

Exactly one of these is expected per invocation.

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
4. Create the worktree through Supacode and capture the printed ID. This
   must be a single Bash call — per the Supacode ID-tracking rule, the
   printed ID is never re-derived after the fact, only captured at creation.
   Take the last line of stdout, not the whole output — this assumes the ID
   is the final line Supacode prints; if `worktree-new` starts emitting
   progress noise after the ID instead of before it, this breaks and needs
   revisiting:
   ```bash
   WT_ID=$(supacode repo worktree-new --branch inquest/<N> --name inquest-<N> --base "$SHA" | tail -n1)
   ```
   `worktree-new` creates the branch, so pass the fetched SHA as `--base`
   rather than an existing ref.
5. Resolve the worktree's filesystem path (`WT_PATH`) from `git worktree
   list --porcelain` — the output is a sequence of `worktree <path>` /
   `HEAD <sha>` / `branch <ref>` triples per worktree. Find the block whose
   `branch` line is `refs/heads/inquest/<N>` and read the `worktree
   <path>` line two lines above it (the first line of that block):
   ```bash
   git worktree list --porcelain
   ```
6. Persist the mapping so `--archive` (and re-runs) can find this worktree
   again — see "State file" below.
7. Print `WT_ID` and the resolved path so the caller can move into it
   (e.g. `cd "$WT_PATH"`).

### Fallback if `worktree-new` errors

If `supacode repo worktree-new` rejects the call (for example the branch
already exists and step 3's delete didn't run, or Supacode is unreachable),
fall back to a plain git worktree and let Supacode discover it later.
Anchor the path to `MAIN_ROOT` (resolved as in "State file" below) rather
than a relative path — a relative `.claude/worktrees/...` nests wrongly when
this skill is invoked from inside an existing worktree instead of the main
checkout. `<owner>` is `headRepositoryOwner` from the `gh pr view` call in
step 1:

```bash
git worktree add "$MAIN_ROOT/.claude/worktrees/<owner>/inquest-<N>" "$SHA"
```

Tell the user Supacode will pick up the new worktree the next time it
refreshes its worktree list — there is no `WT_ID` to capture from this path
until Supacode has indexed it. Still persist a map entry using the path;
leave `id` empty or absent until a real Supacode ID is known.

## Archive flow

`/bench --archive <N>`:

1. Resolve the worktree ID — primary path, the state map:
   ```bash
   WT_ID=$(jq -r --arg n "<N>" '.[$n].id // empty' "$MAP" 2>/dev/null)
   ```
   (`$MAP` is resolved as in "State file" below.)
2. Fallback if the map has no entry (or no `id`): scan
   `git worktree list --porcelain` for the block whose `branch` line is
   `refs/heads/inquest/<N>`, read its `worktree <path>` line two lines
   above, and percent-encode that absolute path — this is assumed to be the
   same shape Supacode uses for a worktree ID when it hasn't been given one
   explicitly. Concrete encoding rule (percent-encodes `/` as `%2F`):
   ```bash
   WT_ID=$(jq -rn --arg p "$WT_PATH" '$p|@uri')
   ```
   **Unverified — confirm at live test** that this is the exact ID shape
   `supacode worktree archive -w` accepts (spec open question).
3. If neither the map nor git resolves an ID, stop and report: "no
   worktree for PR <N>" — there is nothing to archive.
4. Remove the `<N>` entry from the map **first** — see the delete command
   in "State file" below. This has to happen before the archive call: if
   the caller is running from inside the worktree being archived, archiving
   closes that surface, and nothing scripted after it can be relied on to
   still run.
5. Archive as the final operation, with nothing after it in this flow:
   ```bash
   supacode worktree archive -w "$WT_ID"
   ```
   **Unverified — confirm at live test** that this exact subcommand form
   (`supacode worktree archive -w <id>`) is what the installed Supacode CLI
   accepts; it is documented from grounding, not yet exercised live.

## State file

Plain JSON, no code — both `bench` and `inquest` read/write it with
`jq`. Lives at the main repo root (not inside any worktree), so it survives
worktree archival and is visible from every worktree:

```json
{ "1234": { "id": "<WT_ID>", "path": "/abs/path/inquest-1234" } }
```

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
jq --arg n "<N>" --arg id "$WT_ID" --arg p "$WT_PATH" \
   '.[$n] = {id:$id, path:$p}' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```

Delete an entry (used by the archive flow, before the archive call):

```bash
tmp=$(mktemp)
jq --arg n "<N>" 'del(.[$n])' "$MAP" > "$tmp" && mv "$tmp" "$MAP"
```

## Principles

- **No side effects beyond the worktree itself.** This skill does not
  touch GitHub beyond the read-only `gh pr view` lookup and the fetch. It
  never posts, comments, or reviews.
- **Archive is always last.** Nothing in this skill runs after `supacode
  worktree archive`. Clean up bookkeeping (the map entry) before calling
  it, not after.
- **Capture IDs at creation, don't re-derive them.** `WT_ID` is only ever
  trustworthy as the value `worktree-new` printed. If that capture is
  lost, use the git-porcelain fallback rather than guessing.
- **No hardcoded absolute paths.** Resolve `MAIN_ROOT`, worktree paths, and
  the repo owner dynamically; never assume a specific machine's home
  directory layout.
