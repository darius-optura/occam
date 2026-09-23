const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'skills', 'inquest', 'watch.sh');
const ALERT = '> [!NOTE]\n> Posted by Claude on behalf of Darius.\n\nFinding.';

// A bin dir whose gh prints $FAKE_GH_JSON and whose herdr logs its args.
function fakeBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
  fs.writeFileSync(path.join(dir, 'gh'), '#!/bin/sh\nprintf "%s" "$FAKE_GH_JSON"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'herdr'), '#!/bin/sh\necho "$*" >> "$HERDR_LOG"\n', { mode: 0o755 });
  // Keep the no-pane path from raising a real macOS notification.
  fs.writeFileSync(path.join(dir, 'osascript'), '#!/bin/sh\n', { mode: 0o755 });
  return dir;
}

function pr({ state = 'OPEN', head = 'new', requested = [], threads = [] } = {}) {
  return JSON.stringify({ data: {
    viewer: { login: 'me' },
    repository: { pullRequest: {
      state, headRefOid: head,
      reviewRequests: { nodes: requested.map(login => ({ requestedReviewer: { login } })) },
      reviewThreads: { nodes: threads.map(([author, body, isResolved]) => ({
        isResolved, comments: { nodes: [{ author: { login: author }, body }] },
      })) },
    } },
  } });
}

function run(json, extra = [], env = {}) {
  const bin = fakeBin();
  const log = path.join(bin, 'herdr.log');
  const out = execFileSync('sh', [script, '--repo', 'o/r', '--pr', '7', '--sha', 'old', ...extra], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GH_JSON: json, HERDR_LOG: log, ...env },
  }).toString().trim();
  return { out, herdr: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

const once = (json, extra = []) => run(json, ['--once', ...extra]).out;

test('watch.sh parses', () => {
  execFileSync('sh', ['-n', script]);
});

test('waits while an inquest thread is open', () => {
  assert.strictEqual(once(pr({ threads: [['me', ALERT, false]] })), 'wait open=1');
});

test('waits when all threads are resolved but no commit was pushed', () => {
  assert.strictEqual(once(pr({ head: 'old', threads: [['me', ALERT, true]] })), 'wait head-unchanged');
});

test('triggers when all inquest threads are resolved and the head moved', () => {
  assert.strictEqual(once(pr({ threads: [['me', ALERT, true]] })), 'trigger resolved');
});

test('ignores open threads that inquest did not open', () => {
  const threads = [['me', ALERT, true], ['someone', 'Human note.', false], ['me', 'My own manual note.', false]];
  assert.strictEqual(once(pr({ threads })), 'trigger resolved');
});

test('triggers on a re-requested review, even with open threads and no push', () => {
  const json = pr({ head: 'old', requested: ['me'], threads: [['me', ALERT, false]] });
  assert.strictEqual(once(json), 'trigger rerequested');
});

test('a review requested from someone else does not trigger', () => {
  assert.strictEqual(once(pr({ head: 'old', requested: ['other'] })), 'wait head-unchanged');
});

test('stops when the PR is merged or closed', () => {
  assert.strictEqual(once(pr({ state: 'MERGED' })), 'stop merged');
  assert.strictEqual(once(pr({ state: 'CLOSED' })), 'stop closed');
});

test('stops when the worktree is gone', () => {
  assert.strictEqual(once(pr(), ['--path', '/nonexistent/wt']), 'stop archived');
});

test('keeps waiting on a bad gh response', () => {
  assert.strictEqual(once('not json'), 'wait bad-response');
});

test('a trigger sends the next round to the herdr pane', () => {
  const { out, herdr } = run(pr({ requested: ['me'] }), ['--pane', 'wX:p1']);
  assert.match(out, /next round sent to pane wX:p1/);
  assert.match(herdr, /agent wait wX:p1 --until idle/);
  assert.match(herdr, /agent prompt wX:p1 \/occam:inquest 7/);
});

test('with no pane, a trigger prints the command to continue', () => {
  const { out, herdr } = run(pr({ threads: [['me', ALERT, true]] }), ['--path', os.tmpdir()]);
  assert.match(out, /claude '\/occam:inquest 7'/);
  assert.strictEqual(herdr, '');
});

test('inquest starts the watcher after the post, and never on approve', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'inquest', 'SKILL.md'), 'utf8');
  const watch = skill.indexOf('### Watch');
  assert.ok(watch > skill.indexOf('### Post'), 'Watch must follow Post');
  assert.ok(skill.includes('nohup sh "$SKILL_DIR/watch.sh"'), 'Watch lost the background start');
  assert.ok(skill.includes('--no-watch'), 'inquest lost --no-watch');
  assert.match(skill.slice(watch, watch + 1200), /final event is\s+`APPROVE`/, 'Watch must skip on approve');
});
