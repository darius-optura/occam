const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshConfig(env) {
  for (const k of ['RAZOR_DEFAULT_MODE', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR']) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../hooks/razor-config.js')];
  return require('../hooks/razor-config.js');
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'razor-'));

test('off by default when nothing is configured', () => {
  const cfg = freshConfig({ XDG_CONFIG_HOME: tmp() });
  assert.strictEqual(cfg.isEnabledByDefault(), false);
});

test('RAZOR_DEFAULT_MODE=on enables it', () => {
  const cfg = freshConfig({ XDG_CONFIG_HOME: tmp(), RAZOR_DEFAULT_MODE: 'on' });
  assert.strictEqual(cfg.isEnabledByDefault(), true);
});

test('the config file enables it', () => {
  const x = tmp();
  fs.mkdirSync(path.join(x, 'razor'));
  fs.writeFileSync(path.join(x, 'razor', 'config.json'), '{"enabled":true}');
  const cfg = freshConfig({ XDG_CONFIG_HOME: x });
  assert.strictEqual(cfg.isEnabledByDefault(), true);
  assert.strictEqual(cfg.getConfigDir(), path.join(x, 'razor'));
});

test('the flag file round-trips and rejects junk', () => {
  const home = tmp();
  const cfg = freshConfig({ XDG_CONFIG_HOME: tmp(), CLAUDE_CONFIG_DIR: home });
  const flag = path.join(home, '.razor-active');

  assert.strictEqual(cfg.isActive(flag), false);
  cfg.safeWriteFlag(flag, 'on');
  assert.strictEqual(cfg.isActive(flag), true);

  fs.writeFileSync(flag, 'full');
  assert.strictEqual(cfg.isActive(flag), false);
});
