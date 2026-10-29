// The activation hook, run as Claude Code runs it. Each test names how the
// BUILD rules would fail to reach a session.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'razor-'));

function run(script, { args = [], env = {}, input = '' } = {}) {
  const r = spawnSync('node', [path.join(root, 'hooks', script), ...args], {
    input, encoding: 'utf8',
    env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: tmp(), XDG_CONFIG_HOME: tmp(), ...env },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout;
}

const BUILD = ['YAGNI', 'Stdlib', 'Native platform', 'Fewest files', 'ONE runnable check', 'brainstorm'];

test('SessionStart output stays under the 10 KB Claude Code shows in full', () => {
  const out = run('razor-activate.js', { env: { RAZOR_DEFAULT_MODE: 'on' } });
  assert.ok(Buffer.byteLength(out) < 10000, `output is ${Buffer.byteLength(out)} bytes`);
  assert.ok(out.startsWith('RAZOR MODE ACTIVE\n'));
  for (const rule of BUILD) assert.ok(out.includes(rule), `SessionStart lost BUILD rule "${rule}"`);
  const skill = out.match(/Full rules: (.+)/)[1];
  assert.ok(fs.existsSync(skill), `full-rules path ${skill} does not exist`);
});

test('razor stays off by default and prints only OK', () => {
  assert.strictEqual(run('razor-activate.js'), 'OK');
});

test('compact keeps a session-only razor on and re-injects BUILD', () => {
  const C = tmp();
  fs.writeFileSync(path.join(C, '.razor-active'), 'on');
  const out = run('razor-activate.js', { args: ['keep'], env: { CLAUDE_CONFIG_DIR: C } });
  assert.ok(out.includes('Fewest files'));
  assert.strictEqual(fs.readFileSync(path.join(C, '.razor-active'), 'utf8'), 'on');
});

test('subagents get the digest as SubagentStart context, and nothing when off', () => {
  const C = tmp();
  assert.strictEqual(run('razor-activate.js', { args: ['subagent'], env: { CLAUDE_CONFIG_DIR: C } }), '');
  fs.writeFileSync(path.join(C, '.razor-active'), 'on');
  const out = JSON.parse(run('razor-activate.js', { args: ['subagent'], env: { CLAUDE_CONFIG_DIR: C } }));
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  for (const rule of BUILD) assert.ok(out.hookSpecificOutput.additionalContext.includes(rule));
});

test('the per-prompt reminder carries a BUILD line', () => {
  const C = tmp();
  fs.writeFileSync(path.join(C, '.razor-active'), 'on');
  const out = JSON.parse(run('razor-mode-tracker.js', { env: { CLAUDE_CONFIG_DIR: C }, input: '{"prompt":"hi"}' }));
  const ctx = out.hookSpecificOutput.additionalContext;
  for (const rule of ['BUILD', 'YAGNI', 'stdlib', 'Fewest files', 'One check']) assert.ok(ctx.includes(rule));
});

test('hooks.json re-injects after compact and clear, and reaches subagents', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const matchers = hooks.SessionStart.map(h => h.matcher).join('|').split('|');
  for (const source of ['startup', 'resume', 'clear', 'compact']) assert.ok(matchers.includes(source));
  assert.ok(hooks.SubagentStart[0].hooks[0].command.endsWith('razor-activate.js" subagent'));
});
