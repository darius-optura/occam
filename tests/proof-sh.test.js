// proof.sh must parse, and its config loader must emit sourceable, quoted env.
// PROOF_HOME is honoured per call so the test never touches ~/.claude/proof.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const sh = path.join(root, 'skills', 'proof', 'proof.sh');

test('proof.sh passes sh -n', () => {
  execFileSync('sh', ['-n', sh]);
});

test('proof_config exports quoted env and rejects a missing key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  const good = {
    serverCommand: "echo it's up", port: 1234, readyPath: '/ok', loginPath: '/login',
    videoOutDir: 'docs/proof',
    users: [{ role: 'a', profile: 'proof-x-a', email: 'a@x' }],
  };
  fs.writeFileSync(path.join(dir, '.claude', 'proof.json'), JSON.stringify(good));
  const run = () => execFileSync('sh', ['-c', `. "${sh}"; PROOF_HOME="${dir}/home" proof_config "${dir}"`],
    { encoding: 'utf8', stdio: 'pipe' });
  const out = run();
  assert.match(out, /^SERVER_COMMAND='echo it'\\''s up'$/m);
  assert.match(out, /^PORT_FIXED='1234'$/m);
  assert.match(out, /^USER_PROFILES='proof-x-a'$/m);
  assert.match(out, /^USER_EMAILS='a@x'$/m);
  const env = fs.readFileSync(path.join(dir, 'home', 'out', 'run-current.env'), 'utf8');
  assert.ok(env.includes("VIDEO_OUT_DIR='docs/proof'"));

  delete good.loginPath;
  fs.writeFileSync(path.join(dir, '.claude', 'proof.json'), JSON.stringify(good));
  assert.throws(run, /CONFIG_MISSING_KEY loginPath/);
});

test('proof_slug is filesystem safe', () => {
  const out = execFileSync('sh', ['-c', `. "${sh}"; proof_slug "Feat/OPT-3503 re-request flow!"`],
    { encoding: 'utf8' }).trim();
  assert.strictEqual(out, 'feat-opt-3503-re-request-flow');
});
