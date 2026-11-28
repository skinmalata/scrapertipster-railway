const test = require('node:test');
const assert = require('node:assert/strict');

function loadMode(env) {
  const modulePath = require.resolve('../src/services/runtimeMode');
  const previous = {};
  Object.keys(env).forEach(function (key) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  });
  delete require.cache[modulePath];
  const mode = require(modulePath);
  Object.keys(env).forEach(function (key) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
  delete require.cache[modulePath];
  return mode;
}

test('local runtime enables heavy scrapes by default', () => {
  const mode = loadMode({
    RENDER: undefined,
    THIN_WEB: undefined,
    HEAVY_SCRAPES_ENABLED: undefined,
    HEALTH_ONLY_MODE: undefined,
    DISABLE_BACKGROUND_WORKERS: undefined
  });
  assert.equal(mode.RENDER, false);
  assert.equal(mode.THIN_WEB, false);
  assert.equal(mode.HEAVY_SCRAPES_ENABLED, true);
  assert.equal(mode.BACKGROUND_WORKERS_ENABLED, true);
});

test('render runtime disables heavy scrapes by default', () => {
  const mode = loadMode({
    RENDER: 'true',
    THIN_WEB: undefined,
    HEAVY_SCRAPES_ENABLED: undefined,
    HEALTH_ONLY_MODE: undefined,
    DISABLE_BACKGROUND_WORKERS: undefined
  });
  assert.equal(mode.RENDER, true);
  assert.equal(mode.THIN_WEB, true);
  assert.equal(mode.HEAVY_SCRAPES_ENABLED, false);
  assert.equal(mode.BACKGROUND_WORKERS_ENABLED, true);
});

test('explicit heavy scrapes override wins on render', () => {
  const mode = loadMode({
    RENDER: '1',
    THIN_WEB: '1',
    HEAVY_SCRAPES_ENABLED: '1',
    HEALTH_ONLY_MODE: undefined,
    DISABLE_BACKGROUND_WORKERS: undefined
  });
  assert.equal(mode.HEAVY_SCRAPES_ENABLED, true);
});

test('health-only mode disables background workers', () => {
  const mode = loadMode({
    RENDER: undefined,
    THIN_WEB: undefined,
    HEAVY_SCRAPES_ENABLED: undefined,
    HEALTH_ONLY_MODE: '1',
    DISABLE_BACKGROUND_WORKERS: undefined
  });
  assert.equal(mode.HEAVY_SCRAPES_ENABLED, false);
  assert.equal(mode.BACKGROUND_WORKERS_ENABLED, false);
});
