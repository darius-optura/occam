#!/usr/bin/env node
// razor — Claude Code SessionStart activation hook

const fs = require('fs');
const path = require('path');
const os = require('os');
const { isEnabledByDefault, safeWriteFlag } = require('./razor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.razor-active');

if (!isEnabledByDefault()) {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

safeWriteFlag(flagPath, 'on');

// hooks/ and skills/ are siblings inside the plugin, so this resolves
// whichever directory the plugin was installed into.
let body = '';
try {
  const raw = fs.readFileSync(
    path.join(__dirname, '..', 'skills', 'razor', 'SKILL.md'), 'utf8'
  );
  body = raw.replace(/^---[\s\S]*?---\s*/, '');
} catch (e) { /* fall back to the banner alone */ }

process.stdout.write(body ? 'RAZOR MODE ACTIVE\n\n' + body : 'RAZOR MODE ACTIVE');
