---
type: regex
pattern: "gh (pr (comment|review|edit)|api [^\\n]*-X (POST|PATCH|DELETE))"
match: not_contains
target: trace
---
Scrutiny never writes: no PR comments, reviews, labels, or mutating gh api
calls anywhere in the run.
