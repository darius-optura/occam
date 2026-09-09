// The CLAUDE.md invariants, as assertions. Each test names the failure a
// human would otherwise only meet at review time. Deterministic — no model,
// no network; the behavioral layer lives in evals/ and costs tokens.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

test('razor description keeps the tldr trigger phrases', () => {
  const skill = read('skills', 'razor', 'SKILL.md');
  const description = skill.split('---')[1];
  for (const phrase of ['tldr mode', 'tldr style', '/razor']) {
    assert.ok(description.includes(phrase), `description lost "${phrase}"`);
  }
});

test('tldr appears in no skill except the razor description', () => {
  const hits = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/tldr/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'skills'));
  assert.deepStrictEqual(hits, ['skills/razor/SKILL.md']);
});

test('the tracker accepts the namespaced command forms', () => {
  const tracker = read('hooks', 'razor-mode-tracker.js');
  for (const cmd of ['/razor', '/occam:razor', '/razor:razor']) {
    assert.ok(tracker.includes(`'${cmd}'`), `tracker lost ${cmd}`);
  }
});

test('razor-activate finds the skill body where it looks for it', () => {
  // hooks/ and skills/ must stay siblings; the hook reads ../skills/razor/SKILL.md
  assert.ok(fs.existsSync(path.join(root, 'hooks', '..', 'skills', 'razor', 'SKILL.md')));
});

test('review-core carries every load-bearing heading', () => {
  const core = read('skills', 'scrutiny', 'review-core.md');
  for (const h of ['## Scope resolution', '## Load criteria', '## Review',
                   '## Score', '## PR hygiene', '## Standard criteria fallback']) {
    assert.ok(core.includes(`\n${h}\n`), `review-core lost heading "${h}"`);
  }
});

test('every core section a caller names exists as a heading', () => {
  const core = read('skills', 'scrutiny', 'review-core.md');
  const headings = new Set(
    [...core.matchAll(/^##+ (.+)$/gm)].map(m => m[1].trim())
  );
  for (const caller of ['skills/scrutiny/SKILL.md', 'skills/inquest/SKILL.md']) {
    const body = read(...caller.split('/'));
    // references look like: "Section name" in `review-core.md` / in `$CORE`,
    // or `$CORE` "Section name"
    const refs = [
      ...body.matchAll(/"([^"]+)" in `(?:review-core\.md|\$CORE)`/g),
      ...body.matchAll(/`\$CORE` "([^"]+)"/g),
    ].map(m => m[1].replace(/\s+/g, ' '));
    assert.ok(refs.length > 0, `${caller} no longer references the core at all`);
    for (const ref of refs) {
      assert.ok(headings.has(ref), `${caller} names "${ref}" — not a review-core heading`);
    }
  }
});

test('the sticky marker lives in its four files', () => {
  const marker = '<!-- inquest:sticky -->';
  const template = read('skills', 'inquest', 'sticky-template.md');
  assert.strictEqual(template.split('\n')[0], marker, 'marker must be line 1 of the template');
  for (const f of ['check-sticky.sh', 'reference.md', 'SKILL.md']) {
    assert.ok(read('skills', 'inquest', f).includes(marker), `${f} lost the marker`);
  }
});

test('bench keeps its backend contract', () => {
  const bench = read('skills', 'bench', 'SKILL.md');
  // hw is probed before the bare managers — it bootstraps deps/db on top.
  const probe = bench.indexOf("fish -c 'type -q hw'");
  assert.ok(probe > -1, 'bench lost the hw probe');
  assert.ok(probe < bench.indexOf('command -v supacode'), 'hw must be probed first');
  // herdr must pin the worktree path, or it lands under ~/.herdr.
  assert.match(bench, /herdr worktree create[\s\S]{0,200}--path "\$MAIN_ROOT\/\.claude\/worktrees/,
    'herdr create lost --path');
  // git must create the branch; a detached worktree is unfindable at archive.
  assert.ok(bench.includes('git worktree add -b inquest/<N>'), 'git backend lost -b');
});

test('proof skill frontmatter names its modes', () => {
  const skill = read('skills', 'proof', 'SKILL.md');
  const fm = skill.split('---')[1];
  assert.ok(/name: proof/.test(fm));
  assert.ok(/argument-hint:/.test(fm));
  for (const flag of ['--setup', '--init']) assert.ok(fm.includes(flag), `description lost ${flag}`);
});

test('proof shell blocks and helper parse', () => {
  const { execFileSync } = require('node:child_process');
  execFileSync('sh', ['-n', path.join(root, 'skills', 'proof', 'proof.sh')]);
  execFileSync('node', ['--check', path.join(root, 'skills', 'proof', 'cursor.js')]);
  const skill = read('skills', 'proof', 'SKILL.md');
  const blocks = [...skill.matchAll(/^```bash\n([\s\S]*?)^```/gm)].map(m => m[1]);
  assert.ok(blocks.length >= 6, `expected ≥6 bash blocks, got ${blocks.length}`);
  for (const b of blocks) execFileSync('sh', ['-n'], { input: b });
});

test('proof skill never types a password', () => {
  const skill = read('skills', 'proof', 'SKILL.md');
  assert.ok(!/fill @e\d+ .*password/i.test(skill));
  assert.ok(skill.includes('auth login'));
});

test('proof keeps the fixes from the first acceptance run', () => {
  const skill = read('skills', 'proof', 'SKILL.md');
  // auth list prints to stderr; dropping it read every profile as missing.
  assert.ok(skill.includes('agent-browser auth list 2>&1'), 'preflight dropped stderr again');
  // a worktree basename overflows the 103-byte socket path; hash the root instead.
  assert.ok(!/AGENT_BROWSER_SESSION="proof-\$\(basename/.test(skill), 'session name is a basename again');
  assert.ok(/AGENT_BROWSER_SESSION="proof-\$\(printf '%s' "\$REPO_ROOT" \| cksum/.test(skill), 'session name lost the hash');
  // auth login during a recording kills the screencast; the switch must stop first.
  const sw = skill.slice(skill.indexOf('Switch user chapter'));
  const stop = sw.indexOf('agent-browser record stop'), login = sw.indexOf('agent-browser auth login');
  const start = sw.indexOf('agent-browser record start');
  assert.ok(stop > -1 && login > stop && start > login, 'user switch must stop, log in, then start');
  assert.ok(skill.includes('proof_concat'), 'segments are never joined');
  // highlight is a debugging aid that paints a red outline into the video.
  assert.ok(!/agent-browser highlight @/.test(skill), 'highlight is back in the walk');
});

test('proof reference carries the headings the skill points at', () => {
  const ref = read('skills', 'proof', 'reference.md');
  for (const h of ['## Verified agent-browser facts', '## Snapshot and refs',
                   '## Overlay: pointer and chapter cards', '## Login via auth profiles',
                   '## Failure catalogue']) {
    assert.ok(ref.includes(`\n${h}\n`), `reference lost heading "${h}"`);
  }
});

test('the three version fields agree', () => {
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  assert.strictEqual(market.metadata.version, plugin.version);
  assert.strictEqual(market.plugins[0].version, plugin.version);
});
