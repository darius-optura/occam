# Skill regression evals

Behavioral tests for the skills — they invoke the real model and assert on
its output, which `tests/*.test.js` (structure only, free, deterministic)
cannot do. Run them before a release that touches a skill body.

`claude plugin eval` is in early access; a gated org gets
`` `plugin eval` is currently in early access `` and exit 1. Once enabled:

```bash
# everything, with the no-plugin baseline arm (shows razor's compression delta)
claude plugin eval . --report /tmp/occam-eval.html

# just razor, cheap
claude plugin eval . --tag razor

# the scrutiny case runs a setup script — opt in to it explicitly
claude plugin eval . --tag scrutiny --scaffold --allow-tools Bash

# CI shape
claude plugin eval . --threshold 0.85 --max-cost-usd 10 --json eval-results.json --no-publish
```

Cases:

- `razor-terse-response` — "tldr mode" phrase alone must fire the skill
  (invocation regression) and the answer must stay short, no filler frame
  (compression regression).
- `razor-minimal-code` — BUILD ladder: a caching task must resolve to
  `functools.lru_cache`, not a hand-rolled cache class.
- `scrutiny-finds-planted-bugs` — scaffolded repo with a hardcoded token and
  a weakened test in the working tree; the review must flag both, score ≤6,
  print the exact score header, and write nothing to GitHub.
