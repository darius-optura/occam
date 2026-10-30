# Decisions

Durable decisions for occam. Append only; newest last. A reversal is a new
entry that names the old one.

## 2026-10-26 — Razor's BUILD takes the code rules from Uncle Bob's ub-mode, reworded
Why: ub-mode's "make it work, then make it right" rules (shape first, check at
the edge, test first, fix the cause, refactor under a pin) tighten the code
razor writes without adding code. The upstream repo has no license, so the
rules are restated in razor's register, not copied.
Rejected: vendoring `ub-mode/SKILL.md` as a fourth skill — no license, and two
skills that both govern code would conflict.

## 2026-10-26 — Razor does not call crapper, dryer, or mutator
Why: they are Uncle Bob's own tools, not installed for most users. A rule that
depends on a missing tool fails silently.
Rejected: requiring them as quality gates — revisit when one ships as a
standard package for the languages we use.

## 2026-10-26 — Keep a log of decisions in `docs/decisions.md`, not of actions in the chat
Why: ub-mode's "Keep a Log" reports every action at the end, which razor's
no-recap rule forbids, and git already holds the actions. Decisions are what a
later session re-argues, so they persist in the repo.
Rejected: an action log in the final reply; one file per decision (ADR
directory) — more files than a single log needs, used only when a repo already
keeps one.

## 2026-10-26 — Razor does not push to the main line
Why: ub-mode ends with a push to main. Occam works through branches and pull
requests, and `ledger` owns commits and PR bodies.

## 2026-10-28 — bench prefers `rw` inside Rex, `hw` inside herdr
Why: `rw` is the Rex port of `hw` (same worktree path, same `.herdr/setup.sh`
and `teardown.sh`), so the multiplexer the user is in picks the backend.
`REX_SESSION` set selects `rw`; `HERDR_ENV=1` keeps `hw` first, because herdr
can run inside a Rex block and is then the inner layer. The handoff targets
the session's block labelled `claude`, always as `-s <session> -b <block>`.
Rejected: probing `rw` outside Rex — it needs a Rex server, and a teammate
with the function but no Rex running would fail at provision.

## 2026-10-29 — Razor hooks inject a digest, not the full SKILL.md
Why: Claude Code shows only a 2 KB preview of hook output over 10 KB. The
13 KB SKILL.md lost BUILD at that cut, so sessions, compactions, and
subagents never saw the build rules. `skills/razor/digest.md` stays under the
limit and names the path to the full rules.
Rejected: trimming SKILL.md under 10 KB — the WRITE and Auto-Clarity rules
need the room; a memory file — it loads in one project only.

## 2026-10-30 — The digest tells the session to load the full razor skill before planning work
Why: the digest cuts the reasons and examples behind BUILD. A skill load
carries the full SKILL.md with no 10 KB cut, so a brainstorm, grill, plan, or
review starts from the whole rule set.
Rejected for now: a `PreToolUse` hook on the Skill tool that forces the load —
more code; add it when a session shows the digest line is not enough.

## 2026-10-30 — A PreToolUse gate forces the razor skill before planning and review skills
Why: a session obeyed the superpowers "process skills first" rule, started
brainstorming, and skipped the digest line that names `occam:razor`. A deny
from the gate does not depend on the model choosing between two rules.
Reverses: "The digest tells the session to load the full razor skill" — the
line stays, the gate enforces it.
Rejected: injecting the full SKILL.md at session start — Claude Code cuts
hook output over 10 KB to a 2 KB preview.

## 2026-10-30 — The razor gate covers every skill, not a list of planning skills
Why: a session loaded `systematic-debugging` for a bug, then designed a
rename map and a server migration. That is a plan, but the name matched no
entry in the list. Any skill can lead to design work.
Reverses: "A PreToolUse gate forces the razor skill before planning and
review skills" — the gate stays, the list goes.
Cost: the first skill call in a session is denied once.
