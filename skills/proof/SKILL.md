---
name: proof
description: Record a proof-of-feature video with agent-browser. `/proof --setup` installs the tooling once per machine; `/proof --init` writes the repo's .claude/proof.json and prints the auth-profile commands; `/proof [pr|branch] [story]` starts the dev server, logs in via auth profiles, walks the change in a recorded Chrome and writes an mp4. Use when asked to "record a proof", "make the PoF video", or "/proof".
argument-hint: [--setup | --init | [pr-number | branch] [story outline]]
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---

# Proof

You drive a real Chrome through a feature and record it. No scripts. You decide
where to go from the diff, the repo's docs, and an optional story outline. Output
is an mp4 in the repo's `videoOutDir`.

`proof.sh`, `cursor.js` and `reference.md` sit beside this file. Read the named
section of `reference.md` when a step points at it.

```bash
SKILL_DIR="${CLAUDE_PLUGIN_ROOT}/skills/proof"
```

If `CLAUDE_PLUGIN_ROOT` is unset, use the base directory Claude Code printed
when this skill loaded (`Base directory for this skill: …`). Set `SKILL_DIR`
once in step 0 of the run; `proof_set` persists it for every later block.

## Inputs

Parse the argument by format, in this order:

| Argument | Mode |
|---|---|
| `--setup` | machine-level tooling install, idempotent |
| `--init` | write this repo's `.claude/proof.json` |
| leading numeric token | PR run; the rest is the story |
| leading token that names a git branch | branch run; the rest is the story |
| anything else, or empty | run against the current branch; the whole text is the story |

## Hard rules

- Never type a password. Login only through `agent-browser auth login <profile>`.
  Never ask for, read, or echo a password.
- One tab for the whole walk. Close any extra tab and note the gap.
- Never `agent-browser highlight`. It draws a red debugging outline that ends up in the
  video. The pointer dot from `cursor.js` is the only marker.
- Create only the data the feature itself creates. No fixtures, no cleanup writes.
- Never `git add` the video or `.claude/proof.json`. `--init` writes; the developer commits.
- Login happens before recording starts. Never run `auth login` while a recording runs:
  stop, log in, start the next segment. `proof_concat` joins the segments at the end.
- If a chapter is unreachable, skip it and report the gap. Do not improvise unrelated clicks.
- On any abort after the server step: `record stop` if recording, `agent-browser close`,
  `proof_teardown`, then report the reason.
- Shell state does not persist between Bash calls. Every block after run step 0 starts with
  `. "$HOME/.claude/proof/out/run-current.env"`. Run each fenced block as one Bash call.
- The Bash tool is zsh, which does not word-split `$VAR`. Source `proof.sh` before any
  `for x in $LIST`; it turns `shwordsplit` on. Do not diagnose a split failure as IFS.

## `/proof --setup`

Machine level. Never touches a repo. Print exactly what changed.

```bash
set -e
changed=""
if ! command -v agent-browser >/dev/null 2>&1; then npm i -g agent-browser; changed="$changed agent-browser"; fi
if ! agent-browser doctor 2>/dev/null | grep -qi 'chrome'; then agent-browser install; changed="$changed chrome-for-testing"; fi
if ! command -v ffmpeg >/dev/null 2>&1; then echo "ffmpeg missing: brew install ffmpeg"; exit 1; fi
agent-browser doctor
echo "changed:${changed:- nothing}"
```

## `/proof --init`

Repo level. If `.claude/proof.json` exists: validate with `proof_config`, print it, stop.

1. Detect defaults. Read `package.json` scripts for a dev command. If a `worktree:info`
   script exists, propose `portCommand: "npm run -s worktree:info"` and
   `portRegex: "Dev port:[[:space:]]*([0-9]+)"`. Grep `src/routes` for a login route and
   propose it as `loginPath` and `readyPath`. Propose `videoOutDir: "docs/proof"`.
2. Ask for the rest in one AskUserQuestion: `serverCommand`, `port` or the
   `portCommand`+`portRegex` pair, `readyPath`, `loginPath`, `logoutPath` (optional),
   `videoOutDir`, and users as `role,email` pairs. Derive each `profile` as
   `proof-<repo>-<role>` where `<repo>` is the basename of the repo root.
3. Write `.claude/proof.json` with the Write tool, pretty JSON, `port: null` when unused.
   Do not commit.
4. Print one line per user for the developer to run in their own terminal, then list what
   exists:

```bash
set -e
ROOT=$(git rev-parse --show-toplevel)
node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const base = c.port ? "http://localhost:" + c.port : "http://localhost:<port>";
for (const u of c.users) console.log(`agent-browser auth save ${u.profile} --url ${base}${c.loginPath} --username ${u.email} --password-stdin`);
' "$ROOT/.claude/proof.json"
echo "--- existing profiles"
agent-browser auth list
```

`--password-stdin` reads the password from the terminal, so it never enters this
conversation. Stop after printing.

## Run

### 0. Preflight

```bash
set -e
SKILL_DIR="${CLAUDE_PLUGIN_ROOT}/skills/proof"   # or the base directory printed when the skill loaded
. "$SKILL_DIR/proof.sh"
command -v agent-browser >/dev/null 2>&1 || { echo "agent-browser missing: run /proof --setup"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg missing: brew install ffmpeg"; exit 1; }
proof_config "$(git rev-parse --show-toplevel)"
proof_set SKILL_DIR "$SKILL_DIR"
. "$HOME/.claude/proof/out/run-current.env"
have=$(agent-browser auth list 2>&1)   # auth list prints to stderr; never drop it
for p in $USER_PROFILES; do              # splits because proof.sh set shwordsplit under zsh
  printf '%s\n' "$have" | grep -qF -- "$p" || { echo "PROFILE_MISSING $p"; missing=1; }
done
[ -z "$missing" ] || { echo "run the auth save line for each missing profile (see /proof --init)"; exit 1; }
echo PREFLIGHT_OK
```

Any sentinel: name the mode or command that fixes it ("Failure catalogue" in
`reference.md`) and STOP. Nothing has started yet.

### 1. Resolve the change

Bind `ARG` to the text after `/proof`, or empty.

```bash
set -e
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"
ARG='<the argument text, or empty>'
cd "$REPO_ROOT"
OUT="$HOME/.claude/proof/out"
first=${ARG%% *}; rest=${ARG#"$first"}; rest=${rest# }
if printf '%s' "$first" | grep -qE '^[0-9]+$'; then
  KIND=pr; NAME=$first; STORY=$rest
  state=$(gh pr view "$NAME" --json state -q .state)
  if [ "$state" = MERGED ]; then tip=$(gh pr view "$NAME" --json mergeCommit -q .mergeCommit.oid)
  else tip=$(gh pr view "$NAME" --json headRefOid -q .headRefOid); fi
  git merge-base --is-ancestor "$tip" HEAD || { echo "WRONG_TREE HEAD does not contain $tip ($state)"; exit 1; }
  gh pr view "$NAME" --json title,body,url -q '"# "+.title+"\n"+.url+"\n\n"+.body' > "$OUT/change-context.md"
  gh pr diff "$NAME" --name-only > "$OUT/changed-files.txt"
  gh pr diff "$NAME" > "$OUT/change.diff"
elif [ -n "$first" ] && git show-ref --verify --quiet "refs/heads/$first"; then
  KIND=branch; NAME=$first; STORY=$rest
else
  KIND=branch; NAME=$(git branch --show-current); STORY=$ARG
fi
if [ "$KIND" = branch ]; then
  BASE=$(gh pr view "$NAME" --json baseRefName -q .baseRefName 2>/dev/null || echo main)
  git fetch -q origin "$BASE" 2>/dev/null || true
  git log -1 --format='# %s%n%n%b' "$NAME" > "$OUT/change-context.md"
  git diff --name-only "origin/$BASE...$NAME" > "$OUT/changed-files.txt"
  git diff "origin/$BASE...$NAME" > "$OUT/change.diff"
fi
SLUG=$(proof_slug "$NAME"); DATE=$(date +%Y-%m-%d)
proof_set KIND "$KIND"; proof_set NAME "$NAME"; proof_set SLUG "$SLUG"; proof_set DATE "$DATE"
proof_set STORY "$STORY"; proof_set MP4_OUT "$OUT/$SLUG-$DATE.mp4"
wc -l < "$OUT/changed-files.txt"; head -3 "$OUT/change-context.md"
```

`WRONG_TREE`: tell the user to check out the PR head or its merge, STOP.

### 2. Plan

Read `change-context.md`, `changed-files.txt`, and as much of `change.diff` as the
walk needs. Read the repo's `CLAUDE.md` and any navigation skill it names. Map changed
routes, components and remote files to URLs and click paths.

If `STORY` is set, it is one scenario that must be covered, in order, with the named
actors, placed inside the diff-derived walk. Trim other chapters before story beats.
Actors map to `USER_ROLES`; each actor change is a "Switch to <email>" chapter.

Produce 5 to 12 chapters. Each has: title, user, path, action, visible proof. Target
a video under 3 minutes. Print the plan as a numbered list, one line per chapter:

```
1. <title> — <user> — <path> — <action> → <visible proof>
```

Then gate on the user with one AskUserQuestion:

- **Record as planned** (recommended)
- **Edit the plan** — the user types changes as free text: drop a chapter, add one,
  reorder, rename an actor, change a path.
- **Stop** — nothing has started; exit with no report.

Apply the edits, print the revised list, and ask again. Repeat until the user picks
**Record as planned**. Nothing runs before that answer: no server, no browser.

### 3. Server

```bash
set -e
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"
proof_port && proof_server_start
```

`PORT_NOT_PARSED` or `SERVER_NOT_READY`: the helper already printed the evidence
and tore down anything it started. STOP.

### 4. Browser and login, not recorded

```bash
set -e
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"
proof_alive
# Short and stable per repo root. The session name lands in a Unix socket path, which is
# capped at 103 bytes; a worktree basename overflows it and every `open` fails.
export AGENT_BROWSER_SESSION="proof-$(printf '%s' "$REPO_ROOT" | cksum | cut -d' ' -f1)"
proof_set SESSION "$AGENT_BROWSER_SESSION" >/dev/null
agent-browser --args "--force-device-scale-factor=1" open "$BASE_URL$LOGIN_PATH" --headed --init-script "$SKILL_DIR/cursor.js"
agent-browser set viewport 1440 900
first_profile=${USER_PROFILES%% *}
agent-browser auth login "$first_profile"
agent-browser wait 1500
agent-browser get url
```

If the printed URL still contains `LOGIN_PATH`: `snapshot -i`, retry once with the
selector flags from "Login via auth profiles" in `reference.md`. Still on the login
page → `agent-browser close`, `proof_teardown`, STOP with the reason.

Every later block exports `AGENT_BROWSER_SESSION="$SESSION"` after sourcing run state.

### 5. Record

The video is recorded in segments, one per logged-in user, and joined at the end.
`proof_seg_next` names the next segment and remembers it.

```bash
set -e
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"; export AGENT_BROWSER_SESSION="$SESSION"
agent-browser record start "$(proof_seg_next)"
```

### 6. Walk

Per chapter, following "Snapshot and refs" in `reference.md`:

1. `agent-browser eval "window.__proofChapter('<title>')"` then `agent-browser wait 1300`.
2. `agent-browser snapshot -i`; pick the ref.
3. `agent-browser hover @ref`, `wait 400`, then `click @ref` or `fill @ref <text>` or
   `press <key>`.
4. `agent-browser wait 700` between actions. Streams: `wait "<end text>"`; without stable
   end text, loop `wait 30000` plus `snapshot -i`, at most four times.
5. Batch independent steps in one `agent-browser batch "…" "…"` call.

Switch user chapter. Show the chapter card, sign out through the `LOGOUT_PATH` control
or the user menu, confirm the login page appears. Then run this as one Bash call:

```bash
set -e
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"; export AGENT_BROWSER_SESSION="$SESSION"
agent-browser record stop
agent-browser auth login '<next profile>'
agent-browser wait 1500
agent-browser get url
agent-browser record start "$(proof_seg_next)"
```

`auth login` while a recording runs kills the screencast silently; frames stop, the walk
goes on, and `record stop` then hangs the daemon. Always stop before and start after.
The sign-out and the landing page are on camera; only the credential entry is not.
Same tab throughout.

Unreachable chapter: skip, keep going, record it for `gaps`.

### 7–9. Stop, move, teardown

Run this block even if the walk aborted partway.

```bash
. "$HOME/.claude/proof/out/run-current.env"; . "$SKILL_DIR/proof.sh"; export AGENT_BROWSER_SESSION="$SESSION"
agent-browser record stop || true
agent-browser close || true
proof_concat && proof_move_video "$MP4_OUT" || echo "no video to move"
proof_teardown
```

### Report

Exact shape, nothing else after it:

```
mp4: <path>
duration: <s>
chapters: <done>/<planned>
gaps: <none | list>
server: <reused | started+stopped>
```
