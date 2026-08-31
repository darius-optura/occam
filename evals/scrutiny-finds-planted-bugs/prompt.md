---
name: Scrutiny finds planted bugs in a dirty working tree
tags: [scrutiny, review]
plugins: [".."]
runs: 2
max_turns: 25
allowed_tools: [Bash, Read, Grep, Glob, TodoWrite]
---
/occam:scrutiny
