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

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('proof_seg_next numbers segments and proof_concat joins them', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const run = cmd => execFileSync('sh', ['-c', `export PROOF_HOME="${home}"; . "${sh}"; ${cmd}`],
    { encoding: 'utf8', stdio: 'pipe' }).trim();
  run(`proof_set MP4_OUT "${home}/out/x-2026-09-09.mp4"`);
  const seg1 = run('proof_seg_next');
  const seg2 = run('proof_seg_next');
  assert.strictEqual(seg1, `${home}/out/x-2026-09-09-seg1.mp4`);
  assert.strictEqual(seg2, `${home}/out/x-2026-09-09-seg2.mp4`);
  for (const s of [seg1, seg2]) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10',
      '-t', '0.3', '-pix_fmt', 'yuv420p', s], { stdio: 'ignore' });
  }
  const out = run('proof_concat');
  assert.match(out, /SEGMENTS_JOINED 2 -> /);
  assert.ok(fs.statSync(`${home}/out/x-2026-09-09.mp4`).size > 0);
  assert.ok(!fs.existsSync(seg1) && !fs.existsSync(seg2), 'segments removed after join');
});

test('proof_concat renames a lone segment and fails on none', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const run = cmd => execFileSync('sh', ['-c', `export PROOF_HOME="${home}"; . "${sh}"; ${cmd}`],
    { encoding: 'utf8', stdio: 'pipe' }).trim();
  run(`proof_set MP4_OUT "${home}/out/y.mp4"`);
  assert.throws(() => run('proof_concat'), e => e.status === 1 && /MP4_MISSING/.test(e.stdout));
  const seg = run('proof_seg_next');
  fs.writeFileSync(seg, 'not empty');
  assert.match(run('proof_concat'), /SEGMENTS_JOINED 1 -> /);
  assert.ok(fs.existsSync(`${home}/out/y.mp4`));
});

test('proof_slug is filesystem safe', () => {
  const out = execFileSync('sh', ['-c', `. "${sh}"; proof_slug "Feat/OPT-3503 re-request flow!"`],
    { encoding: 'utf8' }).trim();
  assert.strictEqual(out, 'feat-opt-3503-re-request-flow');
});
