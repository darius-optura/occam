// check-leaks.sh gates every text inquest posts: no local paths, no secrets.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, '..', 'skills', 'inquest', 'check-leaks.sh');
const check = text => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'leaks-')), 'review.json');
  fs.writeFileSync(f, text);
  const r = spawnSync('bash', [script, f], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
};

test('a clean repro passes', () => {
  const r = check(JSON.stringify({ body: '```python\nfrom app.cart import total\nassert total([]) == 0\n```\n`pytest .prove/1/test_total.py`' }));
  assert.deepStrictEqual(r, { code: 0, out: 'OK\n' });
});

for (const [name, leak] of [
  ['a macOS home path', '/Users/darius/Work/app/src/x.py'],
  ['a Linux home path', '/home/ci/app/src/x.py'],
  ['a macOS temp path', '/var/folders/78/abc/T/prove/1/t.py'],
  ['a GitHub token', 'ghp_' + 'a'.repeat(36)],
  ['a fine-grained GitHub token', 'github_pat_' + 'A'.repeat(30)],
  ['an AWS key', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
  ['an API key', 'sk-' + 'x'.repeat(40)],
  ['a Slack token', 'xoxb-1234-5678-abcdef'],
  ['a private key', '-----BEGIN RSA PRIVATE KEY-----'],
  ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'],
]) test(`${name} fails`, () => {
  const r = check(JSON.stringify({ body: `output: ${leak} here` }));
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^LEAK /m);
});
