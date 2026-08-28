# occam

Occam's razor for Claude Code: fewest words, fewest lines, fewest assumptions.

Two halves of one idea. `razor` makes Claude write the fewest words and the
fewest lines that still work. `scrutiny` and `inquest` ask whether your diff
is the simplest correct one, and score merge confidence out of 10.

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

Claude Code namespaces a plugin's skills, so both `/razor` and `/occam:razor`
work. The same holds for the other three.

`inquest` reads named sections of `scrutiny` rather than duplicating them, and
delegates worktree lifecycle to `bench`. The three ship together for that
reason; `inquest` on its own is incomplete.

## Razor is off by default

Installing occam does not compress your output. Turn razor on in one of three
ways:

```bash
# 1. In a session, for that session
/razor                     # on
/razor off                 # off

# 2. Environment variable
export RAZOR_DEFAULT_MODE=on

# 3. Config file, every session on this machine
mkdir -p ~/.config/razor
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

## Optional dependency

`inquest` runs a second opinion through the Codex companion when the `codex`
CLI and the openai-codex plugin are both present. When either is missing it
records `skipped — codex CLI not installed` on the sticky and carries on. A
silent skip is treated as a failure.


## License

MIT
