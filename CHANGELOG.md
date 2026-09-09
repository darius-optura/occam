# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version lives in two files and they must agree: `.claude-plugin/plugin.json`
and `.claude-plugin/marketplace.json`.

## [1.7.1] — 2026-09-09

### Fixed
- `proof` frontmatter was not valid YAML. `argument-hint` began with `[`, so
  a strict parser read it as a flow sequence and failed on the `|`. GitHub
  showed the error at the top of the rendered skill. The value is now quoted,
  and an invariant test lints every skill's frontmatter for unquoted values
  that start with a YAML indicator or contain `: ` or ` #`.
- The same lint found `bench`'s description cut short at `#N` by a strict
  YAML parser, since ` #` opens a comment in a plain scalar. It is now a
  block scalar and parses whole.

### Changed
- `proof` prose no longer names the repo, tickets, worktrees, or dates of
  the runs it learned from. `--init` proposes a port command generically
  instead of one project's script.

## [1.7.0] — 2026-09-09

### Added
- `proof` trims still spans. Most of a raw take is agent think time between
  actions, when the page does not move: 436 s of a 594 s recording. After
  the segments are joined, `proof_trim_stills` runs ffmpeg `freezedetect`,
  keeps the first `stillKeep` seconds of every still span (default 4, `0`
  disables) and re-encodes once. Spans are not merged, so every distinct
  still screen is still shown. The report gains a `trimmed:` line. The
  sample take went from 594 s to 302 s.

## [1.6.0] — 2026-09-09

### Added
- `proof` gates on the plan before it starts anything. The chapters print as
  a numbered list, then one AskUserQuestion offers **Record as planned**,
  **Edit the plan** (free text), or **Stop**. Edits are applied, the list is
  reprinted, and the question repeats until the user says record. No server
  or browser starts before that answer.

### Fixed
- `proof` preflight still read every auth profile as missing. The Claude
  Code Bash tool is zsh, and zsh does not word-split an unquoted `$VAR`, so
  the profile loop ran once over the joined string. `proof.sh` now sets
  `shwordsplit` when sourced by zsh. The same fault waited in `proof_concat`
  for any run with more than one segment; its test now runs under zsh too.

## [1.5.1] — 2026-09-09

### Fixed
- `proof` preflight read every auth profile as missing. `agent-browser auth
  list` prints to stderr and the block discarded it. Now captured with `2>&1`
  and matched as a fixed string.
- `proof` named its browser session after the repo root's basename. In a
  worktree that overflowed the 103-byte Unix socket path and every `open`
  failed. The session is now `proof-<cksum of the repo root>`.
- `proof` ran `auth login` inside the recording. That kills the screencast
  silently, the walk continues with no frames, and `record stop` hangs the
  daemon. The recording is now one segment per logged-in user: stop on the
  login page, log in, start the next segment; `proof_concat` joins them with
  a stream copy at the end.
- `proof` no longer calls `agent-browser highlight` before a click. It is a
  debugging aid and painted a red outline into every video. The pointer moves
  onto the target with `hover` instead.

## [1.5.0] — 2026-09-08

### Added
- `proof` skill: records a proof-of-feature video without a human at the
  mouse. `/proof --setup` installs agent-browser and Chrome for Testing once
  per machine; `/proof --init` writes a repo's `.claude/proof.json` and prints
  the `agent-browser auth save` lines for its users; `/proof [pr|branch]
  [story]` starts the dev server, logs in through an auth profile, walks the
  change in a recorded 1440×900 Chrome and writes an mp4 into the repo's
  `videoOutDir`. An optional story outline names a scenario the walk must
  cover, with sequential user switches recorded on purpose. Passwords live
  only in agent-browser auth profiles; the skill never types one. A pointer
  dot and chapter cards come from an init script so the recording shows
  what was clicked. Supersedes the local-only `/pof` prototype.

## [1.4.0] — 2026-09-01

### Added
- `bench` gains an `hw` backend, probed before Supacode and herdr. `hw` is a
  fish function that wraps herdr and also runs the repo's `.herdr/setup.sh`
  (dependencies, database, doc symlinks). Bench passes the PR head SHA as its
  base, and archives through `hw-rm` so `.herdr/teardown.sh` runs.

### Fixed
- The herdr backend now passes `--path` so worktrees land in
  `<repo>/.claude/worktrees/`, not under `~/.herdr`.

## [1.3.0] — 2026-08-31

### Added
- `skills/scrutiny/review-core.md` — the shared review engine, referenced by
  section name from both `scrutiny` and `inquest`.
- `tests/skill-invariants.test.js` — the CLAUDE.md invariants as assertions.
- `evals/` — behavioral regression suite for `claude plugin eval`
  (razor invocation/compression, BUILD ladder, scrutiny planted-bug case).

### Changed
- `razor` description trimmed to triggers only; banned-phrase lists replaced
  with positive rules; pre-send check deduplicated against STE/TALK.
- `scrutiny` slimmed to an orchestrator over the review core.
- `bench` and `scrutiny` trailing principles sections removed (duplication).

### Removed
- The "Unverified" caveat on the supacode archive command — verified live.

## [1.2.0] — 2026-08-28

### Changed

- `inquest` no longer detaches a checkout, ever. The Codex head guard used to
  run `git checkout --detach <sha>` and restore the prior ref afterwards.
  Codex is now aimed at the worktree with `--cwd` instead of the checkout
  being moved to suit it.
- When a PR gains commits after `bench` provisioned its worktree, the branch
  moves forward with `git checkout -B inquest/<N> FETCH_HEAD`. The worktree
  stays on its branch.
- Outside a `bench` worktree the checkout is never touched. That is the
  user's own tree. Codex is skipped and the reason
  `invalid — working tree is not at the PR head` is recorded.

### Fixed

- `reference.md` claimed the Codex companion has no `--help`, and that
  `--base` and `--scope` are focus text rather than flags. Both are false.
  `handleReviewCommand` declares `valueOptions: ["base", "scope", "model",
  "cwd"]`, and the companion prints usage on `--help`.

## [1.1.2] — 2026-08-28

### Fixed

- The `git` backend of `bench` created a detached worktree.
  `git worktree add <path> <sha>` checks out a detached HEAD, and a detached
  worktree has no `branch` line in `git worktree list --porcelain`. The
  archive flow finds worktrees by that line, so it could never find one the
  `git` backend made, and its `git branch -D` deleted a branch that was never
  created. It now passes `-b inquest/<N>`, matching supacode and herdr.

## [1.1.1] — 2026-08-28

### Fixed

- The supacode path of `bench` never set `WT_PATH`. Splitting the provision
  flow into three backends dropped the original step that resolved it from
  `git worktree list --porcelain`. The herdr and git branches set it
  themselves, so only supacode was affected — its head-SHA check would have
  run against an empty path.

## [1.1.0] — 2026-08-28

### Added

- `/razor forever` turns razor on and keeps it on at every session start.
  `/razor never` is its opposite. Both write
  `~/.config/razor/config.json`; a bare `/razor` and `/razor off` stay
  session-only. `always` and `default` are accepted for `forever`.
- `setEnabled` does a read-modify-write, so a config file carrying other keys
  keeps them.

## [1.0.0] — 2026-08-28

First release. The four skills were extracted from a personal dotfiles repo,
where they reached a machine only through a symlink install.

### Added

- `razor` — compressed output and minimal code, all prose in ASD-STE100
  Simplified Technical English.
- `scrutiny` — read-only adversarial review of a working tree or branch diff.
- `inquest` — adversarial review of a GitHub PR: inline threads, one sticky
  summary, merge confidence scored out of 10.
- `bench` — provisions and archives an isolated worktree for a PR. Probes for
  supacode, then herdr, then plain git. `BENCH_BACKEND` overrides the probe.
  The backend that created a worktree is recorded, so archiving uses the same
  one.
- Two hooks: `SessionStart` activation and a `UserPromptSubmit` tracker, both
  wired through `${CLAUDE_PLUGIN_ROOT}`.
- `scripts/install-statusline.sh`, because a plugin cannot set the
  `statusLine` key itself. It refuses to overwrite an existing statusline and
  prints the one line to add by hand instead.

### Changed from the dotfiles originals

- Renamed: `tldr` → `razor`, `local-review` → `scrutiny`,
  `pr-review` → `inquest`, `pr-worktree` → `bench`.
- **Razor is off by default.** The dotfiles version defaulted to on. A plugin
  must not compress a teammate's output without asking.
- The tracker accepts the namespaced `/occam:razor` form. Claude Code
  namespaces a plugin's skills, so the old `startsWith('/tldr')` gate would
  never have fired inside a plugin.
- The plain-English triggers accept both `tldr` and `razor`, so the phrase
  already in use keeps working. Everything razor prints back says razor.
- The worktree branch prefix is `inquest/<N>` and the state file is
  `.inquest-map.json`.
- `inquest` finds its summary comment by `<!-- inquest:sticky -->`. A sticky
  posted by the old `pr-review` is not recognised, so a re-review of that PR
  posts a second one.
- `RAZOR_DEFAULT_MODE` replaces `TLDR_DEFAULT_MODE` and takes `on`.

### Removed

- Intensity levels. `lite` and `ultra`, and the `commit`, `review` and
  `compress` modes, referenced skills that were never written. Razor is on or
  off.
- Token statistics: the `tldr-stats.js` hook, the `/tldr-stats` command, the
  `Stop` hook that refreshed them, the `appendFlag` and `readHistory` helpers
  that only statistics used, and the history and savings files.
- Nothing migrates from the dotfiles version. The old state files are left
  where they are. Delete them by hand if you want them gone:
  `rm -f ~/.claude/.tldr-active ~/.claude/.tldr-history.jsonl ~/.claude/.tldr-statusline-suffix`
