#!/usr/bin/env node
// razor — UserPromptSubmit hook. Tracks whether razor is on, and reminds.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { safeWriteFlag, isActive } = require('./razor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.razor-active');

// Claude Code namespaces a plugin's skills, so the command can arrive either
// bare or namespaced. All three forms mean the same thing.
const CMDS = new Set(['/razor', '/occam:razor', '/razor:razor']);
const OFF_ARGS = new Set(['off', 'stop', 'disable']);

// The plain-English triggers accept both words. "tldr mode" is what the user
// already types; everything razor prints back says razor.
const NAME = '(?:tldr|razor)';
const ON_A = new RegExp(`\\b(activate|enable|turn on|start|talk like)\\b.*\\b${NAME}\\b`, 'i');
const ON_B = new RegExp(`\\b${NAME}\\b.*\\b(mode|activate|enable|turn on|start)\\b`, 'i');
const OFF_A = new RegExp(`\\b(stop|disable|deactivate|turn off)\\b.*\\b${NAME}\\b`, 'i');
const OFF_B = new RegExp(`\\b${NAME}\\b.*\\b(stop|disable|deactivate|turn off)\\b`, 'i');
const NEGATED = /\b(stop|disable|turn off|deactivate)\b/i;

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();

    if ((ON_A.test(prompt) || ON_B.test(prompt)) && !NEGATED.test(prompt)) {
      safeWriteFlag(flagPath, 'on');
    }

    const parts = prompt.split(/\s+/);
    if (CMDS.has(parts[0])) {
      if (OFF_ARGS.has(parts[1] || '')) {
        try { fs.unlinkSync(flagPath); } catch (e) {}
      } else {
        safeWriteFlag(flagPath, 'on');
      }
    }

    if (OFF_A.test(prompt) || OFF_B.test(prompt) || /\bnormal mode\b/i.test(prompt)) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }

    if (isActive(flagPath)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "RAZOR MODE ACTIVE. " +
            "Drop articles/filler/pleasantries/hedging. Fragments OK. " +
            "Write in ASD-STE100 Simplified Technical English: one word one meaning, " +
            "short common verbs, active voice, one instruction per sentence, max 20 words. " +
            "Code/commits/security: write normal."
        }
      }));
    }
  } catch (e) { /* silent */ }
});
