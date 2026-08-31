---
type: regex
pattern: "^.{0,500}$"
flags: "s"
match: contains
target: last_message
---
The whole final message fits in 500 characters. The question needs two
sentences and one identifier (`useMemo`); anything past 500 is padding.
