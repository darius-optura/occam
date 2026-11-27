---
type: llm
criteria: >
  The review has a Repros section. It holds the repro for the paginate
  off-by-one in users.py: the source in a code fence, the command run from
  the repo root with relative paths only, and the output lines. It ends with
  a `Kept:` line that names a `prove-` directory outside the repo. Source,
  command, output and Kept line all present = 1.0. Each one missing costs
  0.25. An absolute path inside the source or command costs 0.25.
focus: "Prove repro hand-off"
---
The author must be able to run the repro that proved the bug.
