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
  `wait <selector|ms|"text">`, `get url|title|text`, `eval <js>`, `highlight <sel>`.
- `batch "cmd" "cmd" ...` runs several commands in one CLI call. Use it for
  independent steps; never batch across a navigation you need to snapshot after.
- CDP `hover` and `click` dispatch real `mousemove` / `mousedown`, which is what the
  overlay listens for.
- Sessions: `AGENT_BROWSER_SESSION=<name>` or `--session <name>`. The daemon idles out
  after one hour. `close` ends the session cleanly.
- Per-action cost is 10 to 130 ms; the cost of a run is the page, not the driver.

## Snapshot and refs

Refs are scoped to the snapshot that produced them. The loop for every action:

1. `snapshot -i` and read the refs.
2. `highlight @eN` on the target, `wait 400`, then `click @eN` or `fill @eN <text>`.
3. `wait 700` for pacing. After any navigation, snapshot again before acting.

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
sign out through `LOGOUT_PATH` or the user menu, confirm the login page, then
`auth login <next profile>`, all in the same tab.

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
| `MP4_MISSING <path>` | `record stop` produced nothing | report, teardown |
