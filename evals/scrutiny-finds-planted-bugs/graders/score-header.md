---
type: regex
pattern: "### Merge confidence: ([0-9]|10)/10"
match: contains
target: last_message
---
The review leads with the exact CI-compatible score header.
