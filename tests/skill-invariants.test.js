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

test('the three version fields agree', () => {
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  assert.strictEqual(market.metadata.version, plugin.version);
  assert.strictEqual(market.plugins[0].version, plugin.version);
});
