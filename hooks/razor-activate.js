#!/usr/bin/env node
// razor — activation hook.
//   no arg      SessionStart startup|resume|clear: reset the flag to the default
//   keep        SessionStart compact: keep the flag, re-inject the digest
//   subagent    SubagentStart: keep the flag, inject the digest as JSON

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isEnabledByDefault, safeWriteFlag, isActive } = require('./razor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.razor-active');
const mode = process.argv[2] || '';

if (!mode) {
  if (isEnabledByDefault()) safeWriteFlag(flagPath, 'on');
  else try { fs.unlinkSync(flagPath); } catch (e) {}
}

if (!isActive(flagPath)) {
  if (mode !== 'subagent') process.stdout.write('OK');
  process.exit(0);
}

// hooks/ and skills/ are siblings inside the plugin, so this resolves
// whichever directory the plugin was installed into. Claude Code shows a
// hook only a 2 KB preview of output over 10 KB, so this sends the digest.
const skillDir = path.join(__dirname, '..', 'skills', 'razor');
let digest = '';
try {
  digest = fs.readFileSync(path.join(skillDir, 'digest.md'), 'utf8') +
    `\nFull rules: ${path.join(skillDir, 'SKILL.md')}\n`;
} catch (e) { /* fall back to the banner alone */ }

const text = digest ? 'RAZOR MODE ACTIVE\n\n' + digest : 'RAZOR MODE ACTIVE';

process.stdout.write(mode === 'subagent'
  ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } })
  : text);
