const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'skills', 'bench', 'sweep.sh');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

// A repo with a remote and one worktree per case. gh is a fake that prints
// $FAKE/<key>.json, where key is `head-<branch>` or `pr-<N>`.
function setup() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-')));
  const remote = path.join(dir, 'remote.git'), main = path.join(dir, 'main'), fake = path.join(dir, 'fake');
  fs.mkdirSync(fake);
  git(dir, 'init', '-q', '--bare', remote);
  git(dir, 'clone', '-q', remote, main);
  git(main, 'config', 'user.email', 't@t'); git(main, 'config', 'user.name', 't');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(main, 'push', '-q', 'origin', 'HEAD:main');
  const wt = (branch, { push = true } = {}) => {
    const p = path.join(dir, branch.replace('/', '-'));
    git(main, 'worktree', 'add', '-q', '-b', branch, p);
    git(p, 'commit', '-q', '--allow-empty', '-m', branch);
    if (push) git(p, 'push', '-q', '-u', 'origin', branch);
    return p;
  };
  const pr = (key, obj) => fs.writeFileSync(path.join(fake, `${key}.json`), JSON.stringify(obj));
  const sha = p => git(p, 'rev-parse', 'HEAD');

  const merged = wt('feat-merged');  pr('head-feat-merged', [{ number: 1, state: 'MERGED', headRefOid: sha(merged) }]);
  const dirty = wt('feat-dirty');    pr('head-feat-dirty', [{ number: 2, state: 'CLOSED', headRefOid: sha(dirty) }]);
  fs.writeFileSync(path.join(dirty, 'wip.txt'), 'work');
  const open = wt('feat-open');      pr('head-feat-open', [{ number: 3, state: 'OPEN', headRefOid: sha(open) }]);
  const ahead = wt('feat-ahead');    pr('head-feat-ahead', [{ number: 4, state: 'MERGED', headRefOid: sha(ahead) }]);
  git(ahead, 'commit', '-q', '--allow-empty', '-m', 'local only');
  // squash-merged and its remote branch deleted: HEAD is still the PR head, so nothing is lost.
  const gone = wt('feat-gone');      pr('head-feat-gone', [{ number: 5, state: 'MERGED', headRefOid: sha(gone) }]);
  git(main, 'push', '-q', 'origin', '--delete', 'feat-gone'); git(main, 'fetch', '-q', '--prune');
  wt('feat-nopr', { push: false });  pr('head-feat-nopr', []);
  const fork = wt('inquest/6', { push: false }); pr('pr-6', { number: 6, state: 'MERGED', headRefOid: sha(fork) });

  fs.writeFileSync(path.join(fake, 'gh'), `#!/bin/sh
case "$*" in
  *"pr view "*) n=$(printf '%s' "$*" | sed 's/.*pr view \\([0-9]*\\).*/\\1/'); cat "$FAKE/pr-$n.json" ;;
  *"--head "*)  b=$(printf '%s' "$*" | sed 's/.*--head \\([^ ]*\\).*/\\1/'); cat "$FAKE/head-$b.json" 2>/dev/null || echo '[]' ;;
esac
`, { mode: 0o755 });
  return { main, fake };
}

test('sweep.sh parses', () => { execFileSync('sh', ['-n', script]); });

test('sweep lists every worktree and marks only lossless merged or closed ones safe', () => {
  const { main, fake } = setup();
  const out = execFileSync('sh', [script, main], {
    cwd: main, encoding: 'utf8', env: { ...process.env, PATH: `${fake}:${process.env.PATH}`, FAKE: fake },
  });
  const rows = Object.fromEntries(out.trim().split('\n').map(l => { const [s, v, n, b] = l.split('\t'); return [b, `${s} ${v} ${n}`]; }));
  assert.deepStrictEqual(rows, {
    'feat-merged': 'MERGED safe 1',
    'feat-dirty': 'CLOSED keep:uncommitted 2',
    'feat-open': 'OPEN keep:open 3',
    'feat-ahead': 'MERGED keep:unpushed 4',
    'feat-gone': 'MERGED safe 5',
    'feat-nopr': 'NONE keep:no-pr -',
    'inquest/6': 'MERGED safe 6',
  });
});
