#!/usr/bin/env bash
# Validates a filled inquest sticky.md against sticky-template.md.
# Prints "OK" and exits 0 only when the file passes every check.
set -u

f="${1:?usage: check-sticky.sh sticky.md}"
fail=0
err() { echo "FAIL: $1"; fail=1; }

[ -f "$f" ] || { echo "FAIL: file not found: $f"; exit 1; }

# 1. Marker must be the first line.
[ "$(head -1 "$f")" = "<!-- inquest:sticky -->" ] \
  || err "marker <!-- inquest:sticky --> is not line 1"

# 2. Required anchors, present and in template order.
anchors=(
  "### Merge confidence: "
  "Head \`"
  "Codex: "
  "Verdict: "
)
last=0
for a in "${anchors[@]}"; do
  line=$(grep -nF "$a" "$f" | head -1 | cut -d: -f1)
  if [ -z "$line" ]; then
    err "missing anchor: $a"
    continue
  fi
  [ "$line" -gt "$last" ] || err "anchor out of order: $a"
  last=$line
done

# 3. Score line format: <0-10>/10.
grep -qE '^### Merge confidence: ([0-9]|10)/10$' "$f" \
  || err "score line must be exactly '### Merge confidence: <0-10>/10'"

# 4. Footer line: Head SHA and Base on one line.
grep -qE '^Head `[0-9a-f]{7,40}` · Base `[^`]+` @ `[0-9a-f]{7,40}`$' "$f" \
  || err "footer must be: Head \`<sha>\` · Base \`<branch>\` @ \`<sha>\`"

# 4b. Codex and CI share one footer line.
grep -qE '^Codex: .+ · CI: .+' "$f" \
  || err "footer must be: Codex: <result> · CI: <one line>"

# 5. Verdict must carry one of the three allowed values, bolded.
grep -qE '^Verdict: \*\*(Approve|Request changes|Comment \(not approved\))\*\*' "$f" \
  || err "Verdict must be **Approve**, **Request changes**, or **Comment (not approved)**"

# 6. No unfilled template placeholders may remain.
placeholders=(
  '<N>' '<HEAD_SHA>' '<BASE_BRANCH>' '<BASE_SHA>' 'CODEX_HEAD_SHA'
  '<Assessment prose' '<Findings, only when' '<One sentence' '<ran at'
  '<one line' '<Approve | Request changes' '<blocking reason'
)
for p in "${placeholders[@]}"; do
  grep -qF "$p" "$f" && err "unfilled template placeholder remains: $p"
done

# 7. Only the score heading is allowed — the sticky is prose, not sections.
#    Fenced code blocks are skipped so code comments do not false-positive.
while IFS= read -r h; do
  case "$h" in
    "### Merge confidence: "*) ;;
    *) err "heading not allowed (sticky is prose + footer): $h" ;;
  esac
done < <(awk '/^```/{fence=!fence;next} !fence && /^#{1,6} /' "$f")

# 8. Verbosity cap: the sticky is a summary, inline threads carry detail.
lines=$(wc -l < "$f")
[ "$lines" -le 40 ] || err "sticky is $lines lines; cap is 40 — cut boilerplate, keep one line per finding"

if [ "$fail" -eq 0 ]; then
  echo "OK"
else
  exit 1
fi
