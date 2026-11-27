#!/usr/bin/env bash
# Scans text inquest is about to post (review.json, sticky.md, a reply) for
# local paths and secrets. Prints "OK" and exits 0 only when nothing matches.
set -u
[ $# -gt 0 ] || { echo "usage: check-leaks.sh <file>..."; exit 2; }

patterns=(
  'local path|/(Users|home)/[A-Za-z0-9._-]+/'
  'local path|/root/'
  'local path|/(private/)?(var/folders|tmp)/'
  'local path|[A-Za-z]:[\\/]+Users[\\/]+'
  'GitHub token|gh[pousr]_[A-Za-z0-9]{20,}'
  'GitHub token|github_pat_[A-Za-z0-9_]{20,}'
  'AWS key|AKIA[0-9A-Z]{16}'
  'API key|sk-[A-Za-z0-9_-]{20,}'
  'Slack token|xox[abposr]-[A-Za-z0-9-]{8,}'
  'private key|-----BEGIN [A-Z ]*PRIVATE KEY'
  'JWT|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}'
)
fail=0
for f in "$@"; do
  # An unreadable file passes no check: fail closed.
  [ -f "$f" ] && [ -r "$f" ] || { echo "LEAK $f: unreadable"; fail=1; continue; }
  for p in "${patterns[@]}"; do
    hit=$(grep -oE -- "${p#*|}" "$f" | head -1)
    [ -n "$hit" ] && { echo "LEAK $f: ${p%%|*} (${hit:0:12}…)"; fail=1; }
  done
  for v in HOME TMPDIR; do
    val=${!v:-}; val=${val%/}
    [ ${#val} -gt 1 ] && grep -qF -- "$val" "$f" && { echo "LEAK $f: \$$v"; fail=1; }
  done
done
[ $fail -eq 0 ] && echo OK
exit $fail
