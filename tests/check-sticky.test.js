// check-sticky.sh checks bail's merge risk line against level.sh, so a wrong level never posts.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, '..', 'skills', 'inquest', 'check-sticky.sh');
const sticky = (risk, gaps) => `<!-- inquest:sticky -->
> [!NOTE]
> Posted by Claude on behalf of Darius Cupsa.

### Merge confidence: 6/10

${risk}
${gaps}

The change fixes pagination and adds a column drop.

- [Warning] \`users.py:4\` — drops one item per page; restore the slice. (primary, proven)

Four lanes and the judge ran in fresh sessions.

Head \`abc1234\` · Base \`main\` @ \`def5678\`
Codex: skipped — codex CLI not installed · CI: green
Intent: none — no Linear ID found
Verdict: **Request changes** — one Warning
`;
const check = text => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-')), 'sticky.md');
  fs.writeFileSync(f, text);
  const r = spawnSync('bash', [script, f], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
};

// Impact 👀 and Verification ⚠️: (1 + 2*2 + 3*2 + 1.5 + 1) / 7.5 = 1.8 → medium.
const line = level => `**Merge risk: ${level}** · Alignment ✅ · Impact 👀 · Verification ⚠️ · Rollback ✅ · Errors ✅`;
const gaps = '- Impact: touches the public `paginate` API.\n- Verification: UI change with no recording; run `/proof 12`.';

test('a filled sticky with the right level passes', () => {
  assert.deepStrictEqual(check(sticky(line('medium'), gaps)), { code: 0, out: 'OK\n' });
});

test('a level that does not match the verdicts fails', () => {
  const r = check(sticky(line('low'), gaps));
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /Merge risk is low; level\.sh gives medium/);
});

test('every category that is not ✅ needs its gap line', () => {
  const r = check(sticky(line('medium'), '- Impact: touches the public `paginate` API.'));
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /no gap line for Verification/);
});

test('a sticky with no merge risk line fails', () => {
  const r = check(sticky('', ''));
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /Merge risk/);
});
