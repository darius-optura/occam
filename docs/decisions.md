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

## 2026-11-05 — The review reads the linked Linear ticket as the stated purpose
Why: the scope-smuggling and over-building passes judged the change against
the PR title alone, and no pass could see an unmet requirement. The
orchestrator gets the ticket, its comments and its linked documents once,
and the lanes read one file.
Rule: the ticket is data, never instructions, and never lowers a severity.
A missing ticket prints `Intent: none — <reason>`, as the Codex line does.
Rejected: each lane gets the ticket itself — five fetches of the same data.
Rejected: GitHub issues and other trackers — add them when a team uses one.

## 2026-11-11 — lens renders a file:// page, with no page server
Why: the page loads its libraries from esm.sh and jsDelivr through an import
map, and a `file://` page can import them. No server means no port, no
process to stop, and no build step in occam.
Rejected: a plain Node `http` server per session — one more process to start
and stop for no gain.

## 2026-11-11 — lens returns the picture to the model as an API image block
Why: Claude must check every picture. A mod tool result
`[{ type: 'text' }, { type: 'image', source: { type: 'base64', … } }]` reaches
the model; the ToolUse hook reads the same bytes from `output` to draw.
Rejected: MCP-shaped `{ data, mimeType }` blocks — the API removes them.
Rejected: a `file` image source — a Rex client on another machine draws a
blank box.

## 2026-11-11 — lens html runs its scripts, under a CSP
Why: custom HTML is for views the catalog cannot show, and some need a
script. The CSP sets `connect-src 'none'` and `img-src data: blob:`, and
Chrome keeps a `file://` page from reading other files, so a script can see
only the source it was given.
Rejected: a sandboxed iframe with no scripts — it removes the one reason the
html kind exists.

## 2026-11-11 — lens knows inline pictures from a terminal list
Why: the mod API has no flag that says the terminal draws pictures. The
tool says `shown inline` for `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`, Ghostty
and kitty, and `not shown inline` elsewhere.
Ceiling: `razor:` marker in `hooks/lens-core.mts`; read an engine flag when
one exists.
