#!/bin/sh
# Watch a reviewed PR and start the next inquest round when it is ready.
#
# usage: watch.sh [--once] --repo OWNER/NAME --pr N --sha REVIEWED_SHA
#                 [--path WT_PATH] [--pane HERDR_PANE] [--wt-id SUPACODE_WT]
#
# Ready = the author re-requested your review, or every thread inquest opened
# is resolved and the head moved past REVIEWED_SHA. The watcher only starts
# the round; that session still asks before it posts. --once prints one
# decision and exits.
set -u

INTERVAL=${INQUEST_WATCH_INTERVAL:-600}
ONCE=0 REPO= PR= SHA= WT= PANE= WTID=
while [ $# -gt 0 ]; do
  case $1 in
    --once)  ONCE=1 ;;
    --repo)  REPO=$2; shift ;;
    --pr)    PR=$2; shift ;;
    --sha)   SHA=$2; shift ;;
    --path)  WT=$2; shift ;;
    --pane)  PANE=$2; shift ;;
    --wt-id) WTID=$2; shift ;;
    *) echo "watch: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -z "$REPO" ] || [ -z "$PR" ] || [ -z "$SHA" ]; then
  echo "usage: watch.sh [--once] --repo OWNER/NAME --pr N --sha SHA [--path P] [--pane ID] [--wt-id ID]" >&2
  exit 2
fi

QUERY='query($owner:String!,$name:String!,$n:Int!){
  viewer{login}
  repository(owner:$owner,name:$name){ pullRequest(number:$n){
    state headRefOid
    reviewRequests(first:50){nodes{requestedReviewer{...on User{login}}}}
    reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{author{login} body}}}}
  }}}'

# Prints one of: wait <why> | trigger rerequested | trigger resolved | stop <why>
decide() {
  if [ -n "$WT" ] && [ ! -d "$WT" ]; then echo "stop archived"; return; fi
  json=$(gh api graphql -f query="$QUERY" -f owner="${REPO%%/*}" -f name="${REPO#*/}" -F n="$PR" 2>/dev/null) \
    || { echo "wait gh-failed"; return; }
  printf '%s' "$json" | jq -r --arg sha "$SHA" '
    .data.viewer.login as $me
    | .data.repository.pullRequest as $p
    | [ $p.reviewThreads.nodes[]
        | select(.comments.nodes[0] as $c
                 | $c.author.login == $me
                   and ($c.body | contains("Posted by Claude on behalf of")))
        | select(.isResolved | not) ] | length
    | . as $open
    | if $p.state != "OPEN" then "stop \($p.state | ascii_downcase)"
      elif any($p.reviewRequests.nodes[]; .requestedReviewer.login == $me) then "trigger rerequested"
      elif $open == 0 and $p.headRefOid != $sha then "trigger resolved"
      elif $open > 0 then "wait open=\($open)"
      else "wait head-unchanged" end' 2>/dev/null || echo "wait bad-response"
}

trigger() {
  prompt="/occam:inquest $PR"
  if [ -n "$PANE" ] \
     && herdr agent wait "$PANE" --until idle >/dev/null 2>&1 \
     && herdr agent prompt "$PANE" "$prompt" >/dev/null 2>&1; then
    echo "watch: PR #$PR $1, next round sent to pane $PANE"; return
  fi
  if [ -n "$WTID" ] \
     && supacode tab new -w "$WTID" --title "inquest-$PR" --background \
          -i "claude '$prompt'" >/dev/null 2>&1; then
    echo "watch: PR #$PR $1, next round opened in a supacode tab"; return
  fi
  msg="PR #$PR $1. Run: cd ${WT:-<worktree>} && claude '$prompt'"
  command -v osascript >/dev/null 2>&1 \
    && osascript -e "display notification \"$msg\" with title \"inquest\"" >/dev/null 2>&1
  echo "watch: $msg"
}

while :; do
  d=$(decide)
  if [ "$ONCE" = 1 ]; then echo "$d"; exit 0; fi
  echo "$(date '+%F %T') $d"
  case $d in
    stop*)    exit 0 ;;
    trigger*) trigger "${d#trigger }"; exit 0 ;;
  esac
  sleep "$INTERVAL"
done
