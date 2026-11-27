#!/bin/sh
# List every worktree of a repo with the state of its PR, and say whether
# archiving it can lose work. Read-only: it never removes anything.
#
# usage: sweep.sh [MAIN_ROOT]
# prints one tab-separated line per worktree: STATE  VERDICT  PR  BRANCH  PATH
#   STATE   MERGED | CLOSED | OPEN | NONE
#   VERDICT safe | keep:<why>   (why: open, no-pr, uncommitted, unpushed, here)
set -u

ROOT=${1:-$(git rev-parse --path-format=absolute --git-common-dir | sed 's/\/\.git$//')}
HERE=$(git rev-parse --show-toplevel 2>/dev/null || true)
cd "$ROOT" || exit 1
TAB=$(printf '\t')

git worktree list --porcelain \
  | awk '/^worktree /{p=substr($0,10)} /^branch /{b=substr($0,8); sub("^refs/heads/","",b); print p "\t" b}' \
  | while IFS="$TAB" read -r path branch; do
  [ "$path" = "$ROOT" ] && continue
  case $branch in
    inquest/*) pr=$(gh pr view "${branch#inquest/}" --json number,state,headRefOid 2>/dev/null) ;;
    *)         pr=$(gh pr list --head "$branch" --state all --limit 1 --json number,state,headRefOid 2>/dev/null \
                    | jq -c '.[0] // empty' 2>/dev/null) ;;
  esac
  n=$(printf '%s' "$pr" | jq -r '.number // empty' 2>/dev/null)
  state=$(printf '%s' "$pr" | jq -r '.state // empty' 2>/dev/null)
  head=$(printf '%s' "$pr" | jq -r '.headRefOid // empty' 2>/dev/null)

  if   [ -z "$n" ]; then verdict=keep:no-pr; n=-; state=NONE
  elif [ "$state" = OPEN ]; then verdict=keep:open
  elif [ "$path" = "$HERE" ]; then verdict=keep:here
  elif [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then verdict=keep:uncommitted
  # Lossless when HEAD is in the PR's history, or on some remote ref. A squash
  # merge deletes the branch, so the remote check alone reports false losses.
  elif git -C "$path" merge-base --is-ancestor HEAD "$head" 2>/dev/null \
       || [ "$(git -C "$path" rev-list --count HEAD --not --remotes 2>/dev/null)" = 0 ]; then verdict=safe
  else verdict=keep:unpushed
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$state" "$verdict" "$n" "$branch" "$path"
done
