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
if (c.stillKeep != null && !(Number(c.stillKeep) >= 0)) { console.error("CONFIG_INVALID stillKeep must be a number of seconds, 0 disables"); process.exit(1); }
if (c.loom != null && !(c.loom && c.loom.profile)) { console.error("CONFIG_INVALID loom needs a profile directory: {\"profile\": \"~/.config/proof/loom\"}"); process.exit(1); }
const loomProfile = c.loom ? String(c.loom.profile).replace(/^~(?=\/|$)/, process.env.HOME) : "";
const q = v => "'"'"'" + String(v ?? "").replace(/'"'"'/g, "'"'"'\\'"'"''"'"'") + "'"'"'";
const out = [
  ["REPO_ROOT", process.argv[2]],
  ["SERVER_COMMAND", c.serverCommand], ["PORT_FIXED", c.port ?? ""],
  ["PORT_COMMAND", c.portCommand ?? ""], ["PORT_REGEX", c.portRegex ?? ""],
  ["READY_PATH", c.readyPath], ["LOGIN_PATH", c.loginPath], ["LOGOUT_PATH", c.logoutPath ?? ""],
  ["VIDEO_OUT_DIR", c.videoOutDir], ["STILL_KEEP", c.stillKeep ?? 4], ["LOOM_PROFILE", loomProfile],
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

proof_trim_stills() { # proof_trim_stills <mp4>  — cut every still span down to its first STILL_KEEP seconds
  # The long parts of a recording are agent think time between actions: the page does not
  # move. freezedetect finds those spans; each keeps its first STILL_KEEP seconds so every
  # distinct still screen is still shown. Spans are not merged: a one-frame page swap that
  # lands on a new still screen must survive. mpdecimate was tried and cuts far less, because
  # any pointer twitch restarts its counter. STILL_KEEP=0 disables. Re-encodes in place.
  proof_paths; . "$PROOF_RUN"
  keep=${STILL_KEEP:-4}
  [ -s "$1" ] || { echo "MP4_MISSING $1"; return 1; }
  if [ "$keep" = 0 ]; then proof_set TRIMMED 0 >/dev/null; echo "TRIMMED 0s (disabled)"; return 0; fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
  plan=$(ffmpeg -hide_banner -i "$1" -vf "freezedetect=n=0.003:d=$keep" -map 0:v -f null - 2>&1 \
    | grep -oE 'freeze_(start|end): [0-9.]+' \
    | awk -v dur="$dur" -v keep="$keep" '
      /freeze_start/ { s=$2 }
      /freeze_end/   { e=$2; n++; S[n]=s; E[n]=e; s="" }
      END {
        if (s != "") { n++; S[n]=s; E[n]=dur }
        for (i = 1; i <= n; i++) {
          a = S[i] + keep; b = E[i]
          if (b - a > 0.5) { x = x sprintf("*not(between(t,%.3f,%.3f))", a, b); cut += b - a }
        }
        sub(/^\*/, "", x); printf "%s %.0f\n", x, cut
      }')
  cut=${plan##* }; expr=${plan% *}
  if [ -z "$expr" ]; then proof_set TRIMMED 0 >/dev/null; echo "TRIMMED 0s (no stills)"; return 0; fi
  tmp="${1%.mp4}-trim.mp4"
  ffmpeg -y -loglevel error -i "$1" -vf "select='$expr',setpts=N/FRAME_RATE/TB" \
    -c:v libx264 -preset fast -pix_fmt yuv420p -movflags +faststart "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$1"
  proof_set TRIMMED "$cut" >/dev/null
  echo "TRIMMED ${cut}s"
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

# --- Loom upload -------------------------------------------------------------------------
# Loom has no upload API. These drive the web UI in a dedicated persistent Chrome profile
# (LOOM_PROFILE from .claude/proof.json) that the developer logged into once. The real Chrome
# profile is no use: its cookies are Keychain-bound to the Chrome binary and Chrome for
# Testing cannot read them. Verified 2026-09-09; see "Loom" in reference.md.

proof_loom_session() { # export the Loom session name; separate from the recording session
  proof_paths; . "$PROOF_RUN"
  export AGENT_BROWSER_SESSION="proof-loom-$(printf '%s' "$REPO_ROOT" | cksum | cut -d' ' -f1)"
}

proof_loom_check() { # proof_loom_check — open the library; LOOM_OK, or LOOM_LOGIN_REQUIRED with the fix
  proof_paths; . "$PROOF_RUN"
  [ -n "${LOOM_PROFILE:-}" ] || { echo "LOOM_NOT_CONFIGURED add loom.profile to .claude/proof.json (see /proof --init)"; return 1; }
  proof_loom_session
  agent-browser --profile "$LOOM_PROFILE" open https://www.loom.com/looms/videos >/dev/null 2>&1 \
    || { echo "LOOM_BROWSER_FAILED"; return 1; }
  agent-browser wait 3000 >/dev/null 2>&1
  url=$(agent-browser get url 2>/dev/null)
  case "$url" in
    https://www.loom.com/looms/videos*) echo "LOOM_OK"; return 0 ;;
    *) echo "LOOM_LOGIN_REQUIRED $url"
       echo "run: agent-browser --profile $LOOM_PROFILE --headed open https://www.loom.com/login"
       return 1 ;;
  esac
}

proof_loom_wait_login() { # proof_loom_wait_login — headed login window; poll ≤300 s; never navigate meanwhile
  # The Google/Atlassian callback is several hops. Any `open` during it kills the login.
  proof_paths; . "$PROOF_RUN"; proof_loom_session
  agent-browser --profile "$LOOM_PROFILE" --headed open https://www.loom.com/login >/dev/null 2>&1
  i=0
  while [ $i -lt 100 ]; do
    url=$(agent-browser get url 2>/dev/null)
    case "$url" in
      https://www.loom.com/login*|https://www.loom.com/signup*|https://www.loom.com/api/auth*|"") ;;
      https://www.loom.com/*) echo "LOOM_LOGGED_IN $url"; return 0 ;;
    esac
    sleep 3; i=$((i+1))
  done
  echo "LOOM_LOGIN_TIMEOUT"; return 1
}

proof_loom_upload() { # proof_loom_upload <mp4>  — upload through the web UI; LOOM_URL=<share link> or LOOM_FAILED <why>
  proof_paths; . "$PROOF_RUN"
  [ -s "$1" ] || { echo "LOOM_FAILED mp4 missing: $1"; return 1; }
  proof_loom_check || return 1
  proof_loom_session
  # Two hidden file inputs sit on the library page before any menu opens; set the file there.
  agent-browser upload 'input[type=file]' "$1" >/dev/null 2>&1 \
    || { echo "LOOM_FAILED no file input on the library page"; return 1; }
  # The "New video" menu opens only on a real pointer click at the text. `click @ref` on the
  # button and DOM .click() on it or its wrapper do nothing.
  agent-browser find text "New video" click >/dev/null 2>&1 || { echo "LOOM_FAILED New video button not found"; return 1; }
  agent-browser wait 1000 >/dev/null 2>&1
  agent-browser find text "Upload a video" click >/dev/null 2>&1 || { echo "LOOM_FAILED no Upload a video item (plan without upload?)"; return 1; }
  agent-browser wait 1500 >/dev/null 2>&1
  agent-browser snapshot 2>&1 | grep -q '1 file selected' || { echo "LOOM_FAILED dialog did not take the file"; return 1; }
  agent-browser find text "Upload 1 file" click >/dev/null 2>&1 || { echo "LOOM_FAILED Upload 1 file button not found"; return 1; }
  # Loom shows "Uploading: N%" then navigates to the share page. Poll ≤10 min.
  i=0; url=""
  while [ $i -lt 200 ]; do
    url=$(agent-browser get url 2>/dev/null)
    case "$url" in https://www.loom.com/share/*) break ;; esac
    sleep 3; i=$((i+1))
  done
  case "$url" in
    https://www.loom.com/share/*) ;;
    *) echo "LOOM_FAILED upload did not reach a share page in 600 s"; agent-browser snapshot 2>&1 | grep -i -E 'upload|error|fail' | head -5; return 1 ;;
  esac
  agent-browser close >/dev/null 2>&1
  proof_set LOOM_URL "$url" >/dev/null
  echo "LOOM_URL=$url"
}
