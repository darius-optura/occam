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
