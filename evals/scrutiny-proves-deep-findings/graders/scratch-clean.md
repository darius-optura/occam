---
type: regex
pattern: "\\.prove/[^\\s]*\\s+(?:is|was) (?:left|not removed)|status (?:changed|differs)"
match: not_contains
target: last_message
---
The provers clean up: the review never reports a leftover `.prove/` or a
changed tree status.
