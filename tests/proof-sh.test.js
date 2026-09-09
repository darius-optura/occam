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

const has = (bin, args) => { try { execFileSync(bin, args, { stdio: 'ignore' }); return true; } catch { return false; } };
const hasFfmpeg = has('ffmpeg', ['-version']);
// The Claude Code Bash tool is zsh, which does not word-split $VAR unless told to.
// Every list-walking helper must work there too, so the join test runs under both shells.
const shells = ['sh', ...(has('zsh', ['-c', 'true']) ? ['zsh'] : [])];

for (const shell of shells) test(`proof_seg_next numbers segments and proof_concat joins them (${shell})`,
  { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const run = cmd => execFileSync(shell, ['-c', `export PROOF_HOME="${home}"; . "${sh}"; ${cmd}`],
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

test('proof_trim_stills keeps the first seconds of a still span and honours 0', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const run = cmd => execFileSync('sh', ['-c', `export PROOF_HOME="${home}"; . "${sh}"; ${cmd}`],
    { encoding: 'utf8', stdio: 'pipe' }).trim();
  const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
  // 2 s moving, 8 s still, 2 s moving. Trimmed with keep=2 the still part shrinks to 2 s.
  const clip = path.join(home, 'clip.mp4');
  fs.mkdirSync(path.join(home, 'out'), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=s=64x64:r=10:d=2',
    '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=10:d=8',
    '-f', 'lavfi', '-i', 'testsrc=s=64x64:r=10:d=2',
    '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0', '-pix_fmt', 'yuv420p', clip], { stdio: 'ignore' });
  assert.ok(Math.abs(dur(clip) - 12) < 0.5, `synthetic clip is ${dur(clip)} s`);

  run('proof_set STILL_KEEP 2');
  assert.match(run(`proof_trim_stills "${clip}"`), /^TRIMMED [5-7]s$/m);
  const after = dur(clip);
  assert.ok(after > 5 && after < 7, `trimmed clip is ${after} s, expected about 6`);

  run('proof_set STILL_KEEP 0');
  assert.match(run(`proof_trim_stills "${clip}"`), /TRIMMED 0s \(disabled\)/);
  assert.ok(Math.abs(dur(clip) - after) < 0.1, 'disabled trim must not touch the file');
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
  const out = execFileSync('sh', ['-c', `. "${sh}"; proof_slug "Feat/ABC-123 re-request flow!"`],
    { encoding: 'utf8' }).trim();
  assert.strictEqual(out, 'feat-abc-123-re-request-flow');
});
