# occam

Occam's razor for Claude Code: fewest words, fewest lines, fewest assumptions.

Three parts of one idea. `razor` makes Claude write the fewest words and the
fewest lines that still work. `scrutiny` and `inquest` ask whether your diff
is the simplest correct one, and score merge confidence out of 10. `proof`
records the feature working in a real browser, so the PR carries evidence,
not a description.

## Install

```bash
claude plugin marketplace add darius-optura/occam
claude plugin install occam@occam
```

## Skills

| Skill | What it does |
|---|---|
| `razor` | Compressed output and minimal code. All prose in ASD-STE100 Simplified Technical English. |
| `scrutiny` | Read-only adversarial review of your working tree or branch diff. Prints to the terminal, posts nothing. |
| `inquest` | Adversarial review of a GitHub PR. Inline threads, one sticky summary, approve at ≥9 or request changes. |
| `bench` | Provisions and archives an isolated worktree for a PR. |
| `proof` | Records a proof-of-feature mp4 by driving a real Chrome through a PR or branch with agent-browser. |
| `ledger` | Commits the staged changes with a conventional message, and writes a bullet-only PR description plus one linked comment with the most impactful lines, an optional shape diagram, and the main flows. |

Claude Code namespaces a plugin's skills, so both `/razor` and `/occam:razor`
work. The same holds for the other five.

`inquest` reads named sections of `scrutiny` rather than duplicating them, and
delegates worktree lifecycle to `bench`. The three ship together for that
reason; `inquest` on its own is incomplete.

## The review never runs in your session

A session that wrote the diff grades its own plan, not the code. So `scrutiny`
and `inquest` send the review to fresh subagents: three lanes in parallel
(trust boundaries, behaviour, hygiene) that together cover the five review
categories and all seven distrust passes, then a judge that dedups, verifies
every finding against the tree, and scores. The calling session only
orchestrates. It adds, drops, and regrades nothing. In `inquest` the lanes run
beside Codex, and the judge merges both.

Everything `inquest` posts goes out under your GitHub login, so every comment
opens with a `[!NOTE]` alert that reads "Posted by Claude on behalf of
<your name>". Commits and PR bodies carry no alert; you sign those.

## Razor is off by default

Installing occam does not compress your output. Turn razor on in one of three
ways:

```bash
/razor                     # on, this session
/razor off                 # off, this session
/razor forever             # on, and on at every session start
/razor never               # off, and off at every session start
```

`forever` and `never` write `~/.config/razor/config.json` for you. If you
would rather set it yourself, either of these does the same thing:

```bash
export RAZOR_DEFAULT_MODE=on
echo '{"enabled": true}' > ~/.config/razor/config.json
```

Plain English works too: "razor mode", "tldr mode", "be brief", "stop razor",
"normal mode".

## Statusline (optional)

`razor-statusline.sh` prints `[RAZOR]` when razor is on, and nothing when it
is off.

```bash
bash scripts/install-statusline.sh
```

If you already have a statusline, the script refuses to overwrite it and
prints the one line to add to your own script instead.

## bench needs no particular tool

`bench` probes for a workspace manager and falls back to plain git:

1. `supacode`, if installed
2. `herdr`, if installed
3. plain `git worktree`

`BENCH_BACKEND=git` (or `herdr`, or `supacode`) overrides the probe. The
backend that created a worktree is recorded, so archiving uses the same one.

Only the herdr and plain-git paths have been exercised. The Supacode path is
written from its documentation and is marked unverified in the skill.

## proof records the feature, you stay off the mouse

Claude starts your dev server, logs in as a real user, drives a headed Chrome
through the change, and writes an mp4. There is no script to maintain. The
walk is planned from the diff, the PR body, and the repo's own docs, and you
approve the plan before anything runs.

```bash
/proof --setup                  # once per machine: agent-browser, Chrome for Testing
/proof --init                   # once per repo: writes .claude/proof.json, prints auth save lines
/proof 3704                     # walk PR 3704 and record it
/proof                          # same for the current branch
/proof requester requests approval; approver denies; requester re-requests; approver approves
/proof 3704 --loom              # same, then upload to Loom and print the share link
```

### What a run does

1. **Preflight.** Checks `agent-browser`, `ffmpeg`, the repo config, and that
   every user has a saved auth profile. Stops before anything starts if not.
2. **Plan.** Reads the diff and maps changed routes and components to URLs and
   click paths. Prints 5 to 12 chapters, one line each, and asks you: record
   as planned, edit the plan as free text, or stop. Nothing runs until you
   pick record.
3. **Server.** Starts `serverCommand` unless the port is already listening,
   and waits for `readyPath` to answer 200. A server it started, it stops at
   the end. One it found running, it leaves alone.
4. **Login, off camera.** Opens Chrome, sizes it to 1440×900, logs in through
   the first user's auth profile. Recording starts after that.
5. **Walk.** One chapter at a time: a chapter card, then hover, click, fill.
   A pointer dot shows where the mouse is. A "Switch to <user>" chapter signs
   out on camera, logs the next user in off camera, and carries on. A chapter
   the branch cannot reach is skipped and listed under `gaps`.
6. **Trim.** Agent think time between actions is what makes a raw take long.
   Every still span is cut to its first `stillKeep` seconds, so each distinct
   screen still shows.
7. **Report.** The mp4 lands in `videoOutDir`. You commit it; the skill never
   does. The report is six lines: path, duration, chapters done of planned,
   gaps, whether the server was reused or started and stopped, seconds
   trimmed, and with `--loom` the share link.

A story outline names one scenario the video must cover, in order, with named
actors. Actors map to the `role` of each user in `.claude/proof.json`, and the
skill fits the story inside the diff-derived walk.

### Rules the skill keeps

- Passwords never pass through Claude. Each user is an
  `agent-browser auth save … --password-stdin` profile created in your own
  terminal. The skill only ever runs `auth login <profile>`.
- One tab for the whole walk. A second tab is not on the recording.
- No red debugging outlines. The pointer dot is the only marker.
- Only data the feature itself creates. No fixtures, no cleanup writes.
- The video and `.claude/proof.json` are never staged. You commit them.

### Loom

`--loom` uploads the finished mp4 through Loom's web UI, since Loom has no
upload API. Your everyday Chrome profile cannot be reused: its cookies are
bound to the Chrome binary, and Chrome for Testing cannot read them. So
`--init` writes a dedicated profile directory as `loom.profile` and prints a
one-time command that opens a headed window on the Loom login. Sign in there
once, with Google or Atlassian; the profile keeps the session. On a run,
preflight checks that login before recording starts. Logged out → it asks
whether to log in now or skip. The upload happens after the server is torn
down, in its own browser session, and a failure never fails the recording. It
becomes `loom: skipped — <reason>` in the report.

### Config

A filled `.claude/proof.json`, for a repo whose dev server picks its own port:

```json
{
  "serverCommand": "INTENT_WORKTREE_SKIP_SEED=true npm run dev:isolated",
  "port": null,
  "portCommand": "npm run -s worktree:info",
  "portRegex": "Dev port:[[:space:]]*([0-9]+)",
  "readyPath": "/auth/login",
  "loginPath": "/auth/login",
  "logoutPath": "/auth",
  "videoOutDir": "docs/proof",
  "stillKeep": 4,
  "users": [
    { "role": "requester", "email": "requester@example.com", "profile": "proof-intent-requester" },
    { "role": "reviewer",  "email": "reviewer@example.com",  "profile": "proof-intent-reviewer" }
  ],
  "loom": { "profile": "~/.config/proof/loom" }
}
```

`port` is a fixed number, or `null` with `portCommand` plus a `portRegex` that
captures it. `readyPath` must answer 200 once the server is up. `logoutPath`
is optional; without it the skill signs out through the user menu.
`stillKeep` is the seconds each still screen keeps after trimming; `0`
disables. Each user's `profile` is an `agent-browser auth save` name; `role`
is what a story outline calls that actor. `loom` is optional. `--init` writes
this file for you; it asks each question once and derives the profile names.

## ledger writes what leaves the session

`/ledger` reads the index, picks a conventional type and scope from the
staged paths and the recent log, and commits at once. Nothing staged means
nothing happens. `/ledger pr` reads the branch diff against its base and
writes the PR; `/ledger pr <N>` rewrites an existing PR from its own diff.

The PR is two texts. The description holds the change bullets and one link,
so a squash merge carries only the bullets into the commit:

```
- Add --loom to upload the finished video through Loom's web UI.
- Retry the hidden file input once when Loom swaps it.

Details: https://github.com/darius-optura/occam/pull/8#issuecomment-…
```

The link points at one comment ledger posts right after the PR opens. It
carries the technical detail, collapsed, and the flows to try:

```
> [!NOTE]
> Posted by Claude on behalf of Darius Cupsa.

<!-- ledger:details -->
<details>
<summary>Most impactful</summary>

- [`skills/proof/proof.sh:212`](…/pull/8/files#diff-…R212) — loom_upload retries the hidden file input once.

</details>

## Main flows
- As admin, run /proof 8 --loom; expect a Loom share link in the terminal.
```

Every block is a bullet list, imperative, one line per bullet. When the diff
changes structure, a collapsed "Shape" block carries one visual: a file-tree,
call-tree, or pseudocode `diff`, or a Mermaid sequence diagram. Every "Most
impactful" anchor links into the PR's diff at that line. Main flows are
written in the story shape `proof` takes, so `/proof <N> <bullet>` runs
unchanged. A repo's `PULL_REQUEST_TEMPLATE.md` or `REVIEW.md` sections stay
in the description and are filled as bullets.

Create is one chained command: open the PR, post the comment, link it from
the description. The comment lands within a second, ahead of webhook bots in
practice; the link covers the rare loss. `/ledger pr <N>` updates the same
comment in place. Nothing reaches GitHub until you pick Create or Edit.
Commit messages and PR descriptions never carry a generated-with footer or
a session link.

## Optional dependencies

`proof` needs `agent-browser` and Chrome for Testing, which `/proof --setup`
installs, and `ffmpeg` on `PATH`, which it does not. `--loom` needs a Loom
plan that allows uploads.

`inquest` runs a second opinion through the Codex companion when the `codex`
CLI and the openai-codex plugin are both present. When either is missing it
records `skipped — codex CLI not installed` on the sticky and carries on. A
silent skip is treated as a failure.

`/inquest <N> --manual-codex` skips the CLI: it prints the Codex prompt for
you to run in a Codex chat, keeps reviewing while you do, and takes the
pasted output as the second opinion. Useful when chat usage is cheaper than
CLI usage.


## License

MIT
