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

test('razor WRITE section keeps its rules for PR bodies and code comments', () => {
  const razor = read('skills', 'razor', 'SKILL.md');
  const start = razor.indexOf('\n## WRITE');
  assert.ok(start > -1, 'razor lost the WRITE section');
  const write = razor.slice(start, razor.indexOf('\n## ', start + 1));
  for (const rule of ['bullet list of what changed', 'no summary paragraph', 'no verification section',
                      'Two lines at most', 'was replaced or removed', 'justifies the decision']) {
    assert.ok(write.includes(rule), `WRITE lost the rule "${rule}"`);
  }
  // the code-comment rules mirror review-core's comment-rot check; both must exist.
  assert.ok(read('skills', 'scrutiny', 'review-core.md').includes('**Comment rot**'));
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
  for (const h of ['## Scope resolution', '## Load criteria', '## Review', '## Dispatch',
                   '## Judge', '## Score', '## PR hygiene', '## Standard criteria fallback']) {
    assert.ok(core.includes(`\n${h}\n`), `review-core lost heading "${h}"`);
  }
});

test('the review runs in fresh subagents, and the lanes cover every pass', () => {
  const core = read('skills', 'scrutiny', 'review-core.md');
  const dispatch = core.slice(core.indexOf('\n## Dispatch\n'), core.indexOf('\n## Score\n'));
  // a fork inherits the author's context, which is the bias this exists to remove.
  assert.ok(dispatch.includes('`subagent_type: general-purpose`'), 'Dispatch lost the subagent type');
  assert.ok(/never `fork`/.test(dispatch), 'Dispatch no longer forbids fork');
  // the three lanes must still add up to the seven distrust passes and five categories.
  const lanes = dispatch.slice(dispatch.indexOf('### Lanes'), dispatch.indexOf('### Lane brief'));
  for (const pass of ['1 Tests weakened', '2 Auth missing/bypassed', '3 Hardcoded secrets',
                      '4 Dead "compat" code', '5 Scope smuggling', '6 Missing input validation',
                      '7 Comment rot']) {
    assert.ok(lanes.includes(pass), `no lane owns distrust pass "${pass}"`);
  }
  for (const cat of ['Security', 'Logic', 'Performance', 'Maintainability', 'Testing']) {
    assert.ok(lanes.includes(cat), `no lane owns category "${cat}"`);
  }
  // the silent fallback is the failure mode; the loud one is allowed.
  assert.ok(dispatch.includes('Reviewers: in-session (no Agent tool)'), 'Dispatch lost the fallback line');
  // both callers route the review through Dispatch and Judge, and neither runs "Review" itself.
  for (const caller of ['skills/scrutiny/SKILL.md', 'skills/inquest/SKILL.md']) {
    const body = read(...caller.split('/'));
    for (const section of ['Dispatch', 'Judge']) {
      assert.ok(new RegExp(`"${section}" in \`(?:review-core\\.md|\\$CORE)\``).test(body),
        `${caller} does not run "${section}"`);
    }
    assert.ok(/regrades nothing/.test(body), `${caller} lost the orchestrator rule`);
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
  // the Bash tool is zsh; without shwordsplit every `for x in $LIST` loops once.
  const helper = read('skills', 'proof', 'proof.sh');
  assert.ok(helper.includes('setopt shwordsplit'), 'proof.sh lost the zsh word-split guard');
  const preflight = skill.slice(skill.indexOf('### 0. Preflight'), skill.indexOf('### 1.'));
  assert.ok(preflight.indexOf('proof.sh') < preflight.indexOf('for p in $USER_PROFILES'),
    'preflight must source proof.sh before looping over profiles');
  // the plan is gated on the user before anything starts.
  const plan = skill.slice(skill.indexOf('### 2. Plan'), skill.indexOf('### 3.'));
  assert.ok(plan.includes('AskUserQuestion') && plan.includes('Record as planned'), 'plan gate removed');
  assert.ok(!/Do not ask for approval/.test(plan), 'plan gate contradicted');
  // still spans are trimmed after the join and before the move; the report says how much.
  const tail = skill.slice(skill.indexOf('### 7'));
  assert.match(tail, /proof_concat && proof_trim_stills "\$MP4_OUT" && proof_move_video/, 'trim step lost or misordered');
  assert.ok(tail.includes('trimmed: <s removed'), 'report lost the trimmed line');
});

test('proof reference carries the headings the skill points at', () => {
  const ref = read('skills', 'proof', 'reference.md');
  for (const h of ['## Verified agent-browser facts', '## Snapshot and refs',
                   '## Overlay: pointer and chapter cards', '## Login via auth profiles',
                   '## Failure catalogue']) {
    assert.ok(ref.includes(`\n${h}\n`), `reference lost heading "${h}"`);
  }
});

test('every skill frontmatter is plain YAML a strict parser accepts', () => {
  // No YAML library here, so lint the shapes that break strict parsers: a plain
  // scalar may not start with a flow/indicator character, and may not contain ": "
  // or " #". Block scalars (>, |) and quoted values are fine. GitHub rendered
  // `argument-hint: [--setup | …]` as a broken flow sequence.
  const indicator = /^[\[\]{}*&!|>%@`,'"?-]/;
  for (const dir of fs.readdirSync(path.join(root, 'skills'))) {
    const skill = read('skills', dir, 'SKILL.md');
    const fm = skill.split('\n---\n')[0].replace(/^---\n/, '');
    for (const line of fm.split('\n')) {
      const m = line.match(/^([\w-]+): (.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (/^[>|]/.test(value)) continue;                       // block scalar
      if (/^"(?:[^"\\]|\\.)*"$/.test(value) || /^'[^']*'$/.test(value)) continue; // quoted
      assert.ok(!indicator.test(value), `${dir}/SKILL.md ${key}: value starts with a YAML indicator; quote it`);
      assert.ok(!/: | #/.test(value), `${dir}/SKILL.md ${key}: plain scalar contains ": " or " #"; quote it`);
    }
  }
});

test('the three version fields agree', () => {
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  assert.strictEqual(market.metadata.version, plugin.version);
  assert.strictEqual(market.plugins[0].version, plugin.version);
});
