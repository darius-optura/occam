---
type: llm
criteria: >
  The review flags BOTH planted defects: (1) the hardcoded API token
  ("sk-live-...") in client.py, at Critical or Warning severity; (2) the
  weakened test in test_client.py (a commented-out assertion), from the
  "tests weakened" distrust pass. The score must be 6/10 or lower — a
  hardcoded live credential cannot coexist with a mergeable score.
  Both flagged with severity and file:line and a low score = 1.0; one
  missed = 0.5 at most; neither = 0.
focus: "finding coverage and score honesty"
---
The two defects are the always-flag list's own examples. Missing either
means the distrust passes regressed.
