# proof — reference

Facts the skill relies on. Verified 2026-09-08 on agent-browser 0.37.1, macOS,
headed Chrome for Testing. Re-verify before trusting them on another version.

## Verified agent-browser facts

- `open <url> --headed --init-script <path>` launches, navigates, and replays the
  script into every new document. `--args "--force-device-scale-factor=1"` gives a
  device pixel ratio of 1, so the video is pixel-for-pixel the viewport.
- `--window-size` inside `--args` is ignored on this machine. Size the capture with
  `set viewport 1440 900` after `open`. Bare `viewport` is "Unknown command".
- `record start <file.mp4> [--fps N]` / `record stop`. Attaches to the active tab,
  writes native mp4, needs `ffmpeg` on PATH. Duration matches wall clock.
- One tab per recording. A second tab is not captured; the walk stays in one.
- `snapshot -i` returns interactive elements only, about 1 KB, as `@eN` refs.
- Actions: `click @eN`, `fill @eN <text>`, `hover <sel|@eN>`, `press <key>`,
  `wait <selector|ms|"text">`, `get url|title|text`, `eval <js>`. `highlight <sel>` exists
  but is a debugging aid with a red outline; the skill never calls it.
- `batch "cmd" "cmd" ...` runs several commands in one CLI call. Use it for
  independent steps; never batch across a navigation you need to snapshot after.
- CDP `hover` and `click` dispatch real `mousemove` / `mousedown`, which is what the
  overlay listens for.
- Sessions: `AGENT_BROWSER_SESSION=<name>` or `--session <name>`. The daemon idles out
  after one hour. `close` ends the session cleanly.
- Per-action cost is 10 to 130 ms; the cost of a run is the page, not the driver.

Learned in real runs:

- `auth list` prints to **stderr**. Capture it with `2>&1` or every profile reads as missing.
- The Claude Code Bash tool is **zsh**. zsh does not word-split an unquoted `$VAR`, so
  `for p in $USER_PROFILES` ran once over `"proof-x-a proof-x-b"` and matched nothing.
  `proof.sh` sets `shwordsplit` when sourced by zsh. Source it before any loop over a list.
- The session name goes into a Unix socket path capped at 103 bytes. `proof-<checkout
  basename>` hit 105 and every `open` failed. The skill hashes the repo root instead.
- `auth login` during a recording kills the screencast silently. Frames stop, the CLI
  keeps answering, and `record stop` never returns. Plain cross-document navigation does
  not break it. Record in segments: stop on the login page, log in, start the next one.
- A hung `record stop` leaves an mp4 with no moov atom. Kill the daemon pid; the child
  ffmpeg gets EOF and writes the trailer, so the frames up to the break are recoverable.
- One recovered file had frames in a 3180×1140 canvas. Cause unknown, did not recur.
  Check `ffprobe … stream=width,height` on the joined file; expect `1440,900`.

## Snapshot and refs

Refs are scoped to the snapshot that produced them. The loop for every action:

1. `snapshot -i` and read the refs.
2. `hover @eN` so the dot moves onto the target, `wait 400`, then `click @eN` or
   `fill @eN <text>`. Not `highlight`: it paints a red debugging outline into the video.
3. `wait 700` for pacing. After any navigation, snapshot again before acting.

Match labels loosely. A textbox named `Comment (optional)` does not match `^Comment$`;
a missed ref silently skips the action, and the run reports success without it.

Streams and slow renders: `wait "<end text>"` when the page has stable end text. When
it does not, loop `wait 30000` then `snapshot -i` and inspect, at most four times.

## Overlay: pointer and chapter cards

`cursor.js` must be passed to `open` as `--init-script <absolute path>`. It replays
into every document, so it survives navigations and user switches. The runtime
command `addinitscript` takes inline JS, not a path, and does not replay into
documents already open; do not use it for the overlay.

- Pointer: an orange dot that follows `mousemove` and scales up on `mousedown`.
- Chapter card: `eval "window.__proofChapter('Title')"` shows a full-viewport blurred
  card for 1.2 s. Follow it with `wait 1300` so the card clears before the action.
- `eval "typeof window.__proofOverlay"` prints `"boolean"` when the script is live.

## Trimming still spans

Measured on a 594 s take: 436 s of it was still frames, in 42 spans of 3 s or more.
The waits are agent think time between actions.

- `freezedetect=n=0.003:d=<keep>` reports `freeze_start`/`freeze_end` on stderr. The last
  span may lack an end; use the file duration. `n` is a noise floor: a caret blink or a
  pointer twitch stays "frozen"; streaming text and spinners do not.
- Each span keeps its first `keep` seconds via `select='not(between(t,a,b))*…'` plus
  `setpts=N/FRAME_RATE/TB`, then one libx264 re-encode. 594 s → 302 s at `keep=4`.
- Spans are **not** merged. Two spans touching at one timestamp mean the screen changed
  once and went still again; merging would cut the new screen.
- `mpdecimate=keep=N` is the one-filter alternative. Any changed frame restarts its
  counter, so the same take only shrank to 494 s (438 s with loose thresholds).

## Login via auth profiles

The developer creates one profile per user, once per machine, in their own terminal:

```sh
agent-browser auth save <profile> --url <base><loginPath> --username <email> --password-stdin
```

`--password-stdin` reads the password from the terminal, so it never enters Claude.
`auth list` names the profiles; `auth show` never prints passwords.

In the run: `auth login <profile>`. If the form is not auto-detected, take
`snapshot -i` and pass selectors:

```sh
agent-browser auth login <profile> \
  --username-selector 'input[name=username]' \
  --password-selector 'input[name=password]' \
  --submit-selector 'button[type=submit]'
```

Verify with `get url`: the URL must no longer contain `LOGIN_PATH`. A user switch is
sign out through `LOGOUT_PATH` or the user menu, confirm the login page, `record stop`,
`auth login <next profile>`, `record start <next segment>`, all in the same tab.
`proof_seg_next` names the segments; `proof_concat` joins them with the ffmpeg concat
demuxer, stream copy, no re-encode.

## Loom

Verified 2026-09-09. Loom has no public API (Atlassian support: "Loom does not offer a
open API at this time"; REST API is open request LOOM-185). Upload is web UI only, and
only on Business, Business+ AI or Enterprise plans.

- `--profile Work` (the real Chrome profile) launches but carries no cookies: Chrome
  encrypts them with a Keychain key bound to the Chrome binary, and Chrome for Testing
  cannot read it. `--auto-connect` needs Chrome started with `--remote-debugging-port`.
  Neither is usable. A dedicated persistent profile directory is; the login survives
  daemon restarts and a killed window.
- Login is Google or Atlassian ID, several redirect hops. An `open` during the flow
  kills it. `proof_loom_wait_login` only polls `get url` until it reads
  `https://www.loom.com/` off `/login`, `/signup`, `/api/auth`.
- On `/looms/videos` two hidden `input[type=file]` (mp4, mov, webm, wmv, avi, m4v) exist
  before any menu opens. `upload 'input[type=file]' <mp4>` sets the file; the
  `>> nth=0` selector form errors with `DOM.describeNode`.
- The "New video" menu ignores `click @ref` on the button and DOM `.click()` on the
  button or its wrapper. `find text "New video" click`, a real pointer click at the
  text, opens it. Same for the menu item and the dialog button.
- Then `find text "Upload a video" click` opens a dialog "1 file selected" naming the
  file; `find text "Upload 1 file" click` starts it. The dialog shows `Uploading: N%`;
  on completion Loom navigates to `https://www.loom.com/share/<id>`. That URL is the
  share link. The title is the file basename. 11 MB took about 60 s.
- Snapshot refs go stale between commands; the helper uses text and CSS selectors only.

## Failure catalogue

Sentinels come from `proof.sh`. Each row names the mode or command that fixes it.

| Sentinel or symptom | Meaning | Do |
|---|---|---|
| `agent-browser: command not found` | tooling missing | `/proof --setup`, STOP |
| `ffmpeg: command not found` | recorder cannot write mp4 | `brew install ffmpeg`, STOP before any server start |
| `NO_CONFIG <path>` | no `.claude/proof.json` in the repo | `/proof --init`, STOP |
| `CONFIG_MISSING_KEY <key>` / `CONFIG_INVALID …` | config incomplete | fix `.claude/proof.json`, STOP |
| profile absent from `auth list` | no saved login for a user | print that user's `auth save` line, STOP |
| `WRONG_TREE` | HEAD does not contain the PR head or merge | check out the PR, STOP |
| `PORT_NOT_PARSED` | `portRegex` matched nothing | print `portCommand` output, STOP |
| `SERVER_NOT_READY code=<n>` | no 200 from `readyPath` in 180 s | last 40 log lines; server killed if proof started it; STOP |
| `DEAD` | server died mid-run | log tail; teardown; STOP |
| login URL still contains `LOGIN_PATH` | form not found or credentials rejected | close browser, teardown, STOP with reason |
| chapter unreachable | UI path does not exist on this branch | skip, continue, list under `gaps` |
| `MP4_MISSING …` | `record stop` produced nothing, or no segment has data | report, teardown |
| `record stop` hangs | screencast died, usually `auth login` mid-recording | kill the daemon pid; ffmpeg writes the trailer; join what exists |
| `SEGMENTS_JOINED n -> <path>` | not a failure; n segments became one file | continue to `proof_trim_stills` |
| `TRIMMED <n>s` | not a failure; still spans cut to `stillKeep` each | continue to `proof_move_video`; report the number |
| `proof_trim_stills` returns 1 | ffmpeg re-encode failed | the untrimmed mp4 is intact; move it, report `trimmed: failed` |
| `LOOM_NOT_CONFIGURED` | `--loom` given, no `loom.profile` in proof.json | report `loom: skipped — not configured`; `/proof --init` adds it |
| `LOOM_LOGIN_REQUIRED <url>` | the Loom profile has no session | ask: log in now (`proof_loom_wait_login`, headed, hands off) or skip; never STOP the run for it |
| `LOOM_LOGIN_TIMEOUT` | no login within 300 s | `loom: skipped — not logged in to Loom`, continue |
| `LOOM_FAILED <why>` | UI step missing, plan without upload, or no share page in 600 s | mp4 is intact; report the reason under `loom:` |
| `LOOM_URL=<url>` | not a failure; upload done | put the URL on the `loom:` report line |
