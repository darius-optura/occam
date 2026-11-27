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

// Fake rex and terminal-browser that log their args and stdin, so the pane path runs anywhere.
function paneBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-bin-'));
  const log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(dir, 'rex'), `#!/bin/sh
echo "rex $*" >> "${log}"; cat >> "${log}"; echo
case "$*" in *new_layer*) echo '{"layer_id":"layer:L","block_ids":["block:B"],"revision":1}' ;; esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'terminal-browser'), `#!/bin/sh
echo "tb $*" >> "${log}"
case "$1" in
  ls) echo '{"browsers":[{"key":"9-1","pane":{"pane":"block:A"}},{"key":"9-2","pane":{"pane":"block:B"}}]}' ;;
  action) [ "$5" = batch ] && cat >> "${log}"; echo ok ;;
esac
`, { mode: 0o755 });
  return { dir, log };
}

test('proof_pane_open floats a terminal-browser and ab drives its tab', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const { dir, log } = paneBin();
  const run = (cmd, env = {}) => execFileSync('sh', ['-c', `export PROOF_HOME="${home}"; . "${sh}"; ${cmd}`],
    { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REX_BLOCK: 'block:me', ...env } }).trim();
  run(`proof_set SKILL_DIR "${root}/skills/proof"`);

  run('proof_pane_open http://localhost:3000/login');
  const state = fs.readFileSync(`${home}/out/run-current.env`, 'utf8');
  assert.match(state, /^TB_KEY='9-2'$/m);
  assert.match(state, /^LAYER='layer:L'$/m);
  const calls = fs.readFileSync(log, 'utf8');
  assert.match(calls, /rex api call -s block:me session.new_layer -/);
  assert.match(calls, /"command":\["terminal-browser","open","--no-merge","http:\/\/localhost:3000\/login"\]/);

  fs.writeFileSync(log, '');
  run(`. "${home}/out/run-current.env"; ab click @e3`);
  const ab = fs.readFileSync(log, 'utf8');
  assert.match(ab, /tb action --browser 9-2 -- batch --json\n\[\["set","viewport","1440","900"\],\["eval","\/\/ cursor\.js/);
  assert.match(ab, /tb action --browser 9-2 -- click @e3\n/);

  fs.writeFileSync(log, '');
  run(`. "${home}/out/run-current.env"; proof_browser_close`);
  assert.match(fs.readFileSync(log, 'utf8'), /session.close_layer -\n\{"layer_id":"layer:L"\}/);
});

test('proof_pane_open declines outside Rex, and ab falls back to agent-browser', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-home-'));
  const { dir, log } = paneBin();
  fs.writeFileSync(path.join(dir, 'agent-browser'), `#!/bin/sh\necho "ab $*" >> "${log}"\n`, { mode: 0o755 });
  const run = cmd => execFileSync('sh', ['-c', `export PROOF_HOME="${home}"; unset REX_BLOCK; . "${sh}"; ${cmd}`],
    { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }).trim();
  run(`proof_set SKILL_DIR "${root}/skills/proof"`);
  assert.throws(() => run('proof_pane_open http://x'), e => e.status === 1 && e.stderr === '');
  run('ab wait 100; proof_browser_close');
  assert.strictEqual(fs.readFileSync(log, 'utf8'), 'ab wait 100\nab close\n');
});
