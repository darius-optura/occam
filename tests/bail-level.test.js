// level.sh turns the five bail verdicts into the merge risk level, so no model does the weights.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('path');

const level = path.join(__dirname, '..', 'skills', 'bail', 'level.sh');
const run = (...v) => spawnSync('sh', [level, ...v], { encoding: 'utf8' });

for (const [verdicts, want] of [
  [['✅', '✅', '✅', '✅', '✅'], 'low'],       // 1.0
  [['⚠️', '✅', '✅', '✅', '✅'], 'low'],       // 1.27
  [['✅', '👀', '✅', '✅', '✅'], 'low'],       // 1.27
  [['✅', '👀', '⚠️', '✅', '✅'], 'medium'],    // 1.8
  [['⚠️', '⚠️', '👀', '👀', '👀'], 'high'],      // (3+6+4+3+2)/7.5 = 2.4
  [['✅', '⚠️', '⚠️', '👀', '✅'], 'high'],      // (1+6+6+3+1)/7.5 = 2.27
  [['⚠️', '⚠️', '⚠️', '⚠️', '⚠️'], 'high'],
]) test(`${verdicts.join(' ')} is ${want}`, () => {
  const r = run(...verdicts);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, `${want}\n`);
});

test('the medium-to-high edge is 2.25', () => {
  // Alignment ⚠️, Impact 👀, Verification 👀, Rollback 👀, Errors ⚠️: (3+4+4+3+3)/7.5 = 2.27 → high
  assert.strictEqual(run('⚠️', '👀', '👀', '👀', '⚠️').stdout, 'high\n');
  // Impact 👀, Verification 👀, rest ✅: (1+4+4+1.5+1)/7.5 = 1.53 → medium
  assert.strictEqual(run('✅', '👀', '👀', '✅', '✅').stdout, 'medium\n');
});

test('a wrong verdict or count fails', () => {
  assert.strictEqual(run('✅', '✅', '✅', '✅').status, 2);
  assert.strictEqual(run('✅', '✅', '✅', '✅', 'ok').status, 2);
});
