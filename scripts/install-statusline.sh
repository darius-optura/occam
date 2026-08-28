#!/usr/bin/env bash
# Writes the razor statusline into the user's Claude Code settings.json.
# Safe to re-run. Refuses to overwrite an existing statusLine.
set -euo pipefail

CFG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CFG_DIR/settings.json"

SL=$(ls -d "$CFG_DIR"/plugins/cache/occam/occam/*/hooks/razor-statusline.sh 2>/dev/null | sort -V | tail -1 || true)
if [ -z "$SL" ]; then
  SL=$(ls -d "$CFG_DIR"/plugins/marketplaces/occam/hooks/razor-statusline.sh 2>/dev/null | head -1 || true)
fi

if [ -z "$SL" ]; then
  echo "razor-statusline.sh not found. Install the occam plugin first." >&2
  exit 1
fi

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

SL="$SL" node -e '
const fs = require("fs");
const p = process.argv[1];
const s = JSON.parse(fs.readFileSync(p, "utf8"));
if (s.statusLine) {
  console.error("settings.json already has a statusLine. Left untouched.");
  console.error("Add this badge to your own script:  bash " + process.env.SL);
  process.exit(2);
}
fs.copyFileSync(p, p + ".bak");
s.statusLine = { type: "command", command: "bash " + process.env.SL };
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
console.log("statusLine set. Backup at " + p + ".bak");
' "$SETTINGS"
