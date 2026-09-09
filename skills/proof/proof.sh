#!/bin/sh
# proof.sh — helpers for the occam `proof` skill. POSIX sh. Source it, then call functions.
# Shell state does not survive between Claude Code Bash calls, so every function that learns
# something appends it to "$PROOF_HOME/out/run-current.env"; every block sources that file first.
# PROOF_HOME defaults to ~/.claude/proof and is re-read on every call, so a caller may override
# it per invocation (the tests do).
#
# The Claude Code Bash tool runs zsh, and zsh does not word-split an unquoted $VAR. Every
# `for x in $LIST` here and in SKILL.md would then loop once over the joined string. Turn
# sh splitting on when sourced by zsh; a no-op everywhere else.
if [ -n "${ZSH_VERSION:-}" ]; then setopt shwordsplit; fi

proof_paths() {
  PROOF_HOME=${PROOF_HOME:-"$HOME/.claude/proof"}
  PROOF_RUN="$PROOF_HOME/out/run-current.env"
}

proof_q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

proof_set() { # proof_set KEY VALUE  — replace or append KEY in run state
  proof_paths
  mkdir -p "$PROOF_HOME/out"; touch "$PROOF_RUN"
  sed -i '' -e "/^$1=/d" "$PROOF_RUN"
  printf '%s=%s\n' "$1" "$(proof_q "$2")" >> "$PROOF_RUN"
  printf '%s=%s\n' "$1" "$(proof_q "$2")"
}

proof_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//'
}

proof_config() { # proof_config <repo-root>  — validate .claude/proof.json, export as env, reset run state
  proof_paths
  root=$1; cfg="$root/.claude/proof.json"
  [ -f "$cfg" ] || { echo "NO_CONFIG $cfg"; return 1; }
  mkdir -p "$PROOF_HOME/out"; : > "$PROOF_RUN"
  node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const k of ["serverCommand","readyPath","loginPath","videoOutDir","users"]) if (!c[k]) { console.error("CONFIG_MISSING_KEY " + k); process.exit(1); }
if (c.port == null && !(c.portCommand && c.portRegex)) { console.error("CONFIG_MISSING_KEY port or portCommand+portRegex"); process.exit(1); }
if (!Array.isArray(c.users) || !c.users.length || c.users.some(u => !u.profile || !u.email)) { console.error("CONFIG_MISSING_KEY users[].profile/email"); process.exit(1); }
if (String(c.videoOutDir).startsWith("/")) { console.error("CONFIG_INVALID videoOutDir must be repo-relative"); process.exit(1); }
const q = v => "'"'"'" + String(v ?? "").replace(/'"'"'/g, "'"'"'\\'"'"''"'"'") + "'"'"'";
const out = [
  ["REPO_ROOT", process.argv[2]],
  ["SERVER_COMMAND", c.serverCommand], ["PORT_FIXED", c.port ?? ""],
  ["PORT_COMMAND", c.portCommand ?? ""], ["PORT_REGEX", c.portRegex ?? ""],
  ["READY_PATH", c.readyPath], ["LOGIN_PATH", c.loginPath], ["LOGOUT_PATH", c.logoutPath ?? ""],
  ["VIDEO_OUT_DIR", c.videoOutDir],
  ["USER_PROFILES", c.users.map(u => u.profile).join(" ")],
  ["USER_EMAILS", c.users.map(u => u.email).join(" ")],
  ["USER_ROLES", c.users.map(u => u.role ?? "").join(" ")],
];
console.log(out.map(([k, v]) => k + "=" + q(v)).join("\n"));
' "$cfg" "$root" > "$PROOF_RUN" || return 1
  cat "$PROOF_RUN"
}

proof_port() { # uses PORT_FIXED or PORT_COMMAND+PORT_REGEX from run state; sets PORT and BASE_URL
  proof_paths; . "$PROOF_RUN"
  if [ -n "$PORT_FIXED" ]; then PORT=$PORT_FIXED; else
    PORT=$(cd "$REPO_ROOT" && sh -c "$PORT_COMMAND" 2>/dev/null | grep -oE "$PORT_REGEX" | grep -oE '[0-9]+' | head -1)
  fi
  [ -n "$PORT" ] || { echo "PORT_NOT_PARSED"; (cd "$REPO_ROOT" && sh -c "$PORT_COMMAND"); return 1; }
  proof_set PORT "$PORT" >/dev/null; proof_set BASE_URL "http://localhost:$PORT" >/dev/null
  echo "PORT=$PORT"
}

proof_server_start() { # start SERVER_COMMAND unless something listens; wait for READY_PATH 200 (≤180 s)
  proof_paths; . "$PROOF_RUN"
  log="$PROOF_HOME/out/server.log"
  if lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then started=0; else
    started=1
    (cd "$REPO_ROOT" && nohup sh -c "$SERVER_COMMAND" >"$log" 2>&1 </dev/null &)
  fi
  proof_set STARTED_BY_PROOF "$started" >/dev/null
  i=0; code=000
  while [ $i -lt 60 ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$READY_PATH")
    [ "$code" = "200" ] && break
    sleep 3; i=$((i+1))
  done
  if [ "$code" != "200" ]; then
    echo "SERVER_NOT_READY code=$code"; tail -40 "$log" 2>/dev/null
    [ "$started" = 1 ] && proof_teardown
    return 1
  fi
  echo "READY $BASE_URL started_by_proof=$started"
}

proof_alive() { # is the server still listening? prints ALIVE or DEAD plus the log tail
  proof_paths; . "$PROOF_RUN"
  if lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo ALIVE; else
    echo DEAD; tail -20 "$PROOF_HOME/out/server.log" 2>/dev/null; return 1
  fi
}

proof_teardown() { # kill the port listener only if proof started it
  proof_paths; . "$PROOF_RUN"
  if [ "${STARTED_BY_PROOF:-0}" = 1 ]; then
    lsof -ti tcp:"$PORT" -sTCP:LISTEN | xargs kill 2>/dev/null; sleep 2
    lsof -ti tcp:"$PORT" -sTCP:LISTEN | xargs kill -9 2>/dev/null
    echo "server stopped"
  else
    echo "server reused, left running"
  fi
}

proof_seg_next() { # print the next segment path and remember it in SEGMENTS
  proof_paths; . "$PROOF_RUN"
  n=$(( $(printf '%s' "${SEGMENTS:-}" | wc -w) + 1 ))
  seg="${MP4_OUT%.mp4}-seg$n.mp4"
  proof_set SEGMENTS "${SEGMENTS:+$SEGMENTS }$seg" >/dev/null
  echo "$seg"
}

proof_concat() { # join the non-empty SEGMENTS into MP4_OUT; a single segment is renamed
  proof_paths; . "$PROOF_RUN"
  keep=""
  for s in ${SEGMENTS:-}; do [ -s "$s" ] && keep="$keep $s"; done
  # shellcheck disable=SC2086
  set -- $keep
  [ $# -gt 0 ] || { echo "MP4_MISSING no segment has data"; return 1; }
  if [ $# -eq 1 ]; then
    mv "$1" "$MP4_OUT"
  else
    list="$PROOF_HOME/out/concat.txt"; : > "$list"
    for s in "$@"; do printf "file '%s'\n" "$s" >> "$list"; done
    ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -c copy "$MP4_OUT" || return 1
    rm -f "$@"
  fi
  echo "SEGMENTS_JOINED $# -> $MP4_OUT"
}

proof_move_video() { # proof_move_video <mp4>  — verify and move into REPO_ROOT/VIDEO_OUT_DIR
  proof_paths; . "$PROOF_RUN"
  [ -s "$1" ] || { echo "MP4_MISSING $1"; return 1; }
  mkdir -p "$REPO_ROOT/$VIDEO_OUT_DIR"
  dest="$REPO_ROOT/$VIDEO_OUT_DIR/$(basename "$1")"
  mv "$1" "$dest"
  if command -v ffprobe >/dev/null 2>&1; then
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest")
  else
    dur=unknown
  fi
  proof_set MP4 "$dest" >/dev/null; proof_set DURATION "$dur" >/dev/null
  echo "MP4=$dest"; echo "DURATION=$dur"
}
