---
type: regex
pattern: "^(Sure|Great question|Certainly|Happy to|I'd be happy|Let me|I'll|Looking at|To answer)|(Let me know|Hope this helps|Feel free to)[^\\n]*$"
flags: "i"
match: not_contains
target: last_message
---
No filler opener on line one, no closer on the last line. Razor's rule:
start with the answer, stop when the answer is done.
