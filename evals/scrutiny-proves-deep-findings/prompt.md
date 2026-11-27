---
name: Scrutiny proves a logic bug and looks past the diff
tags: [scrutiny, review, prove]
plugins: [".."]
runs: 2
max_turns: 40
allowed_tools: [Bash, Read, Grep, Glob, TodoWrite, Agent, Write]
---
/occam:scrutiny
