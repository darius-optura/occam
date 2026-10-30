// The PreToolUse gate on the Skill tool. A planning or review skill must wait
// until the full razor skill is in context.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'razor-'));

function gate(skill, lines, { on = true } = {}) {
  const C = tmp();
  if (on) fs.writeFileSync(path.join(C, '.razor-active'), 'on');
  const transcript = path.join(C, 't.jsonl');
  fs.writeFileSync(transcript, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  const r = spawnSync('node', [path.join(root, 'hooks', 'razor-skill-gate.js')], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Skill', tool_input: { skill }, transcript_path: transcript }),
    env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: C, XDG_CONFIG_HOME: tmp() },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const skillCall = skill => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });
const slash = cmd => ({ type: 'user', message: { content: `<command-name>${cmd}</command-name>` } });
const compact = { type: 'system', subtype: 'compact_boundary' };

test('a brainstorm without razor in context is denied with the fix', () => {
  const out = gate('superpowers:brainstorming', [slash('/occam:ledger')]);
  assert.strictEqual(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /occam:razor/);
});

test('every planning and review skill is gated', () => {
  for (const s of ['superpowers:writing-plans', 'mattpocock-skills:grilling', 'occam:scrutiny',
                   'occam:inquest', 'code-review:code-review']) {
    assert.strictEqual(gate(s, [])?.permissionDecision, 'deny', s);
  }
});

test('a razor skill call or a typed /razor lets the skill through', () => {
  assert.strictEqual(gate('superpowers:brainstorming', [skillCall('occam:razor')]), null);
  assert.strictEqual(gate('superpowers:brainstorming', [slash('/razor')]), null);
});

test('a razor load before the last compaction does not count', () => {
  const out = gate('superpowers:brainstorming', [skillCall('occam:razor'), compact]);
  assert.strictEqual(out.permissionDecision, 'deny');
});

test('other skills, razor off, and a missing transcript pass', () => {
  assert.strictEqual(gate('occam:ledger', []), null);
  assert.strictEqual(gate('occam:razor', []), null);
  assert.strictEqual(gate('superpowers:brainstorming', [], { on: false }), null);
  const r = spawnSync('node', [path.join(root, 'hooks', 'razor-skill-gate.js')], {
    encoding: 'utf8', input: '{"tool_name":"Skill","tool_input":{"skill":"superpowers:brainstorming"},"transcript_path":"/nope"}',
    env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: tmp() },
  });
  assert.strictEqual(r.stdout, '');
});

test('hooks.json runs the gate on the Skill tool', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = hooks.PreToolUse.find(h => h.matcher === 'Skill');
  assert.ok(entry.hooks[0].command.endsWith('razor-skill-gate.js"'));
});
