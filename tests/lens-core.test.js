const { test, before } = require('node:test');
const assert = require('node:assert');

let L;
before(async () => { L = await import('../hooks/lens-core.mts'); });

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Trimmed from real `agent-browser batch --json` runs (0.41.0).
const BATCH_OK = JSON.stringify([
  { command: ['set', 'viewport', '960', '900', '2'], error: null, result: { width: 960 }, success: true },
  { command: ['set', 'media', 'dark'], error: null, result: { set: true }, success: true },
  { command: ['open', 'file:///t/p.html'], error: null, result: { url: 'file:///t/p.html' }, success: true },
  { command: ['wait', '--fn', 'document.documentElement.dataset.lens'], error: null, result: { result: 'ready' }, success: true },
  { command: ['eval', 'JSON.stringify(window.__lens)'], error: null, result: { result: '{"errors":[],"clipped":false}' }, success: true },
  { command: ['screenshot', '#lens', '/t/p.png'], error: null, result: { path: '/t/p.png' }, success: true },
]);
const BATCH_BAD = JSON.stringify([
  { command: ['open', 'file:///t/p.html'], error: null, result: {}, success: true },
  { command: ['wait', '--fn', 'document.documentElement.dataset.lens'], error: 'Wait timed out after 25000ms', result: null, success: false },
  { command: ['eval', 'JSON.stringify(window.__lens)'], error: null, result: { result: '{"errors":["Mermaid: Parse error on line 2"],"clipped":true}' }, success: true },
  { command: ['screenshot', '#lens', '/t/p.png'], error: 'Element not found: #lens.', result: null, success: false },
]);

test('parseInput takes the three kinds and refuses the rest', () => {
  const ok = L.parseInput({ kind: 'spec', source: { root: 'a', elements: {} }, alt: 'x' });
  assert.deepStrictEqual(ok, { kind: 'spec', source: '{"root":"a","elements":{}}', alt: 'x', tokens: '' });
  assert.strictEqual(L.parseInput({ kind: 'mermaid', source: 'graph TD;a-->b', alt: 'f', tokens: ':root{}' }).tokens, ':root{}');
  assert.match(L.parseInput({ kind: 'svg', source: 'x', alt: 'x' }).error, /spec.*html.*mermaid/);
  assert.ok(L.parseInput({ kind: 'html', source: '<p>', alt: '' }).error);
  assert.ok(L.parseInput({ kind: 'html', source: '', alt: 'x' }).error);
  assert.ok(L.parseInput({ kind: 'html', source: '<p>', alt: 'x'.repeat(201) }).error);
  assert.ok(L.parseInput(null).error);
  assert.match(L.parseInput({ kind: 'spec', source: '{}', alt: 'x', tokens: ':root{}</style><script>' }).error, /tokens/);
});

test('buildPage fills the slots and cannot be closed by the source', () => {
  const t = '<style>/*LENS_TOKENS*/</style><script>const C = /*LENS_CONFIG*/null</script><div id="lens"><!--LENS_HTML--></div>';
  const page = L.buildPage(t, { kind: 'mermaid', source: 'a</script><!--b', theme: 'dark', tokens: ':root{--x:1}', width: 800, maxHeight: 600 });
  assert.ok(!page.includes('a</script><!--b'));
  assert.ok(page.includes(':root{--x:1}'));
  const cfg = JSON.parse(page.match(/const C = (.*)<\/script><div/)[1]);
  assert.deepStrictEqual(cfg, { kind: 'mermaid', source: 'a</script><!--b', theme: 'dark', width: 800, maxHeight: 600 });
  assert.ok(page.endsWith('<div id="lens"></div>'));
  const html = L.buildPage(t, { kind: 'html', source: '<b>hi</b>', theme: 'light', tokens: '', width: 800, maxHeight: 600 });
  assert.ok(html.endsWith('<div id="lens"><b>hi</b></div>'));
});

test('layout sizes the page to the chat width', () => {
  assert.deepStrictEqual(L.layout(120), { cols: 116, width: 928, maxHeight: 672 });
  assert.strictEqual(L.layout(undefined).cols, 100);
  assert.strictEqual(L.layout(400).cols, 160);
  assert.strictEqual(L.layout(20).cols, 40);
});

test('rowsFor follows the aspect ratio and caps the height', () => {
  assert.strictEqual(L.rowsFor(100, 1600, 600), 18);
  assert.strictEqual(L.rowsFor(100, 1600, 9000), 40);
  assert.strictEqual(L.rowsFor(100, 1600, 2), 1);
});

test('pngSize reads the IHDR', () => {
  assert.deepStrictEqual(L.pngSize(PNG_1x1), { width: 1, height: 1 });
});

test('inlineReason knows which terminals draw pictures', () => {
  assert.strictEqual(L.inlineReason({ force: '1', termProgram: 'rex' }), null);
  assert.strictEqual(L.inlineReason({ termProgram: 'ghostty' }), null);
  assert.strictEqual(L.inlineReason({ term: 'xterm-kitty' }), null);
  assert.match(L.inlineReason({ termProgram: 'rex' }), /not shown inline.*\/lens --setup/);
  assert.match(L.inlineReason({ termProgram: 'vscode' }), /not shown inline/);
});

test('resolveTheme follows the setting, then macOS', () => {
  assert.strictEqual(L.resolveTheme('dark-daltonized', ''), 'dark');
  assert.strictEqual(L.resolveTheme('light', 'Dark'), 'light');
  assert.strictEqual(L.resolveTheme('auto', 'Dark\n'), 'dark');
  assert.strictEqual(L.resolveTheme(undefined, ''), 'light');
});

test('sessionName keeps two Claude sessions apart', () => {
  assert.strictEqual(L.sessionName('0123456789'), 'lens-01234567');
  assert.notStrictEqual(L.sessionName('aaaaaaaa-1'), L.sessionName('bbbbbbbb-1'));
});

test('batchCommands is the render sequence', () => {
  assert.deepStrictEqual(L.batchCommands({ width: 928, scale: 2, theme: 'dark', url: 'file:///t/p.html', png: '/t/p.png' }), [
    ['set', 'viewport', '960', '900', '2'],
    ['set', 'media', 'dark'],
    ['open', 'file:///t/p.html'],
    ['wait', '--fn', 'document.documentElement.dataset.lens'],
    ['eval', 'JSON.stringify(window.__lens)'],
    ['screenshot', '#lens', '/t/p.png'],
  ]);
});

test('parseBatch reports page errors, failed steps and clipping', () => {
  assert.deepStrictEqual(L.parseBatch(BATCH_OK), { errors: [], clipped: false, shot: true });
  assert.deepStrictEqual(L.parseBatch(BATCH_BAD), {
    errors: ['Mermaid: Parse error on line 2', 'wait: Wait timed out after 25000ms', 'screenshot: Element not found: #lens.'],
    clipped: true,
    shot: false,
  });
  assert.deepStrictEqual(L.parseBatch('agent-browser: boom'), { errors: ['agent-browser: boom'], clipped: false, shot: false });
});
