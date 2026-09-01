# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version lives in two files and they must agree: `.claude-plugin/plugin.json`
and `.claude-plugin/marketplace.json`.

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
