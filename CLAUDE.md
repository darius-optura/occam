# Working on occam

This repo is a Claude Code plugin **and** its own single-plugin marketplace.
There is no build step and no dependencies. Skills are Markdown, hooks are
plain Node, one script is POSIX shell.

## Layout

```
.claude-plugin/
  plugin.json        identity + version
  marketplace.json   marketplace + the same version, twice
skills/              razor, scrutiny, inquest, bench
hooks/
  hooks.json         two events, paths via ${CLAUDE_PLUGIN_ROOT}
  razor-config.js    on/off resolution, flag file access
  razor-activate.js  SessionStart
  razor-mode-tracker.js  UserPromptSubmit
  razor-statusline.sh    [RAZOR] badge
scripts/install-statusline.sh
tests/razor-config.test.js
```

There is no `commands/` directory. Skills are invoked directly, bare
(`/razor`) or namespaced (`/occam:razor`).

## Release loop

Every change a user must receive needs a version bump. The plugin is
installed from the pushed remote, not from this working copy, so an unbumped
push reaches nobody.

```bash
node --test tests/*.test.js          # must pass

# bump the version in BOTH manifests — three occurrences total
sed -i '' 's/"version": "1.2.0"/"version": "1.3.0"/g' \
  .claude-plugin/plugin.json .claude-plugin/marketplace.json

git add -A && git commit && git push

claude plugin marketplace update occam
claude plugin update occam@occam
# then restart Claude Code
```

`marketplace.json` carries the version twice: once under `metadata`, once in
the `plugins` entry. `plugin.json` carries it once. All three must agree, or
the update will not be offered.

### Version rules

- **patch** — a fix inside a skill body or hook that changes no contract.
- **minor** — a new command, flag, or backend; a behaviour change a user
  would notice.
- **major** — a rename, a removed skill, or a changed state-file shape.

## Testing

```bash
node --test tests/*.test.js
```

Use the glob. `node --test tests/` fails on this Node — it resolves the
directory as a module.

Two test layers. `tests/razor-config.test.js` unit-tests the only file with
branching logic. `tests/skill-invariants.test.js` asserts the invariants
below (trigger phrases, load-bearing headings, the sticky marker's four
files, version agreement) — structural regressions fail here, free and
deterministic. Behavioral regressions — razor getting verbose, a review
missing a planted bug — are covered by `evals/` (see `evals/README.md`),
which invokes the real model; run it before a release that touches a skill
body. The hooks are verified by running them:

```bash
C=$(mktemp -d); X=$(mktemp -d)

# off by default
CLAUDE_CONFIG_DIR=$C XDG_CONFIG_HOME=$X node hooks/razor-activate.js      # -> OK

# on, and the skill body is found
CLAUDE_CONFIG_DIR=$C XDG_CONFIG_HOME=$X RAZOR_DEFAULT_MODE=on \
  node hooks/razor-activate.js | head -1                                  # -> RAZOR MODE ACTIVE

# the tracker, on every accepted form
echo '{"prompt":"/occam:razor"}' | CLAUDE_CONFIG_DIR=$C XDG_CONFIG_HOME=$X \
  node hooks/razor-mode-tracker.js
cat $C/.razor-active                                                      # -> on

# the badge
CLAUDE_CONFIG_DIR=$C bash hooks/razor-statusline.sh                       # -> [RAZOR]
```

Always pass `CLAUDE_CONFIG_DIR` and `XDG_CONFIG_HOME` at a temp dir. Without
them the hooks read and write your real state.

## Invariants

Break one of these and the failure shows up at review time, not install time.

**`hooks/` and `skills/` must stay siblings.** `razor-activate.js` reads the
skill body at `path.join(__dirname, '..', 'skills', 'razor', 'SKILL.md')`.
Moving either directory breaks it silently — the hook falls back to printing
the banner alone.

**Razor stays off by default.** `isEnabledByDefault()` returns `false` unless
`RAZOR_DEFAULT_MODE=on` or the config file says `{"enabled": true}`. A plugin
must not compress a teammate's output without asking. There is a test for
this; do not weaken it.

**Keep the `tldr` trigger phrases in the `razor` description.** People type
"tldr mode". The description carries those phrases and the tracker regexes
match `(?:tldr|razor)`. Everything razor prints back says razor.

**The tracker must accept the namespaced form.** `CMDS` holds `/razor`,
`/occam:razor` and `/razor:razor`. Claude Code namespaces a plugin's skills,
so dropping the namespaced form makes the hook stop firing for the command
most people use.

**Never detach a checkout.** Every worktree this plugin creates lands on
branch `inquest/<N>`. `git worktree add <path> <sha>` detaches, which is why
`bench` passes `-b`. A detached worktree has no `branch` line in
`git worktree list --porcelain`, and `bench --archive` finds worktrees by
that line.

**The sticky marker lives in four files.** `<!-- inquest:sticky -->` appears
in `skills/inquest/sticky-template.md` (line 1), in `check-sticky.sh` which
validates that exact line, in `reference.md` which greps for it to find an
existing sticky, and in `SKILL.md` which names it in the dedup rule. Change
all four together — `grep -rl 'inquest:sticky' skills/inquest/` lists them.
Proof:

```bash
cp skills/inquest/sticky-template.md /tmp/s.md
bash skills/inquest/check-sticky.sh /tmp/s.md
```

It must complain about unfilled `<…>` placeholders and never about the
marker.

**The review core is shared by heading.**
`skills/scrutiny/review-core.md` is the single source of truth for the
review engine; both `scrutiny` and `inquest` run its sections by name.
Renaming a heading there breaks a caller with no error. The load-bearing
headings:

```
Scope resolution · Load criteria · Review · Score
PR hygiene · Standard criteria fallback
```

The three skills ship together for this reason. `inquest` alone is
incomplete.

## Before you release

1. `node --test tests/*.test.js` passes.
2. `grep -rn 'tldr' skills/ | grep -v 'skills/razor/SKILL.md'` returns
   nothing. The only `tldr` outside the razor description is the tracker's
   `(?:tldr|razor)` alternation.
3. The sticky validator accepts its own template (above).
4. `/inquest <N>` against a throwaway PR. This is the one that matters:
   `inquest` is the only skill that writes to GitHub, so a bad reference
   fails during a review, not during install. Confirm `bench` prints its
   backend, the branch is `inquest/<N>`, and the validator prints `OK`.
5. `BENCH_BACKEND=git /bench <N>` — the fallback path a teammate with no
   workspace manager gets. Do not test this by stripping `PATH`; that removes
   `gh`, which lives in `/opt/homebrew/bin`, and the flow fails before it
   reaches the backend.
6. `/inquest` with `codex` unavailable. The sticky's Codex line must read
   `skipped — codex CLI not installed`. A silent skip is a failure.

## Conventions

Conventional commits. Skill prose is written in the register of the skill it
lives in. Commit messages are full sentences with articles, active voice, and
say **why**, not only what.
