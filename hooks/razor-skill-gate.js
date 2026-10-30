#!/usr/bin/env node
// razor — PreToolUse hook on the Skill tool. A planning or review skill waits
// until the full razor skill is in context; the digest alone cuts BUILD.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isActive } = require('./razor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const GATED = /brainstorm|plan|grill|review|scrutiny|inquest/;
const LOADED = /"skill":"(?:occam:)?razor"|<command-name>\/(?:occam:|razor:)?razor</;

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const skill = (data.tool_input && data.tool_input.skill) || '';
    if (!GATED.test(skill) || !isActive(path.join(claudeDir, '.razor-active'))) return;

    // Only what follows the last compaction is still in context.
    const raw = fs.readFileSync(data.transcript_path, 'utf8');
    const live = raw.slice(raw.lastIndexOf('"subtype":"compact_boundary"') + 1);
    if (LOADED.test(live)) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Razor is on. Invoke the occam:razor skill first, then invoke ${skill} again.`
      }
    }));
  } catch (e) { /* fail open: an unreadable transcript never blocks a skill */ }
});
