---
type: regex
pattern: "^.{0,700}$"
flags: "s"
match: contains
target: last_message
---
Final message stays under 700 characters — the fix is one decorator plus a
one-line skipped/upgrade note, not an essay about caching strategies.
