'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const pkg = require('../package.json');
const { isNewer, macAssetName } = require('../src/release');

test('isNewer compares semver numerically, ignoring a leading "v"', () => {
  assert.equal(isNewer('2.1.10', '2.1.9'), true);
  assert.equal(isNewer('2.2.0', '2.1.99'), true);
  assert.equal(isNewer('v3.0.0', '2.9.9'), true);
  assert.equal(isNewer('2.1.4', '2.1.4'), false);
  assert.equal(isNewer('2.1.3', '2.1.4'), false);
  assert.equal(isNewer('2.1', '2.1.0'), false);
});

test('macOS updater asset name matches the electron-builder artifact pattern', () => {
  const vars = { productName: pkg.build.productName, version: '9.9.9', os: 'mac', arch: 'arm64', ext: 'zip' };
  const expected = pkg.build.artifactName.replace(/\$\{(\w+)\}/g, (_, key) => vars[key]);
  assert.equal(macAssetName('9.9.9', 'arm64'), expected);
  assert.ok(pkg.build.mac.target.includes('zip'), 'mac build must produce the zip the updater downloads');
});

test('IPC channels agree between main, preload and overlay', () => {
  const main = read('src/main.js');
  const preload = read('src/preload.js');
  const overlay = read('src/overlay.js');

  // renderer → main
  for (const ch of ['crack', 'hidden']) {
    assert.match(preload, new RegExp(`ipcRenderer\\.send\\('${ch}'\\)`), `preload sends "${ch}"`);
    assert.match(main, new RegExp(`ipcMain\\.on\\('${ch}'`), `main listens to "${ch}"`);
  }
  // main → renderer
  for (const ch of ['spawn', 'drop', 'display-changed']) {
    assert.match(main, new RegExp(`send\\('${ch}'`), `main sends "${ch}"`);
    assert.match(preload, new RegExp(`ipcRenderer\\.on\\('${ch}'`), `preload listens to "${ch}"`);
  }
  // overlay uses exactly the bridge surface preload exposes
  const exposed = [...preload.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  const used = [...new Set([...overlay.matchAll(/window\.bridge\.(\w+)/g)].map(m => m[1]))];
  for (const fn of used)
    assert.ok(exposed.includes(fn), `overlay calls bridge.${fn} which preload does not expose`);
});

test('overlay.html loads overlay.js under its CSP and does not inline scripts', () => {
  const html = read('src/overlay.html');
  assert.match(html, /<script src="overlay\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>[^<]/);
  assert.match(html, /script-src 'self' file:/);
});

test('packaging config ships every source file and the native module unpacked', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'src'))) {
    assert.ok(
      pkg.build.files.some(glob => glob.startsWith('src/')),
      `src/${file} must be packaged`,
    );
  }
  assert.equal(pkg.main, 'src/main.js');
  assert.ok(
    pkg.build.asarUnpack.some(g => g.startsWith('node_modules/koffi')),
    'koffi must be unpacked',
  );
  assert.ok(
    pkg.build.asarUnpack.some(g => g.startsWith('node_modules/@koromix')),
    'koffi native binary must be unpacked',
  );
  assert.equal(pkg.build.publish.provider, 'github', 'electron-updater needs the github publish provider');
});

test('release workflow uploads the electron-updater manifests', () => {
  const workflow = read('.github/workflows/release.yml');
  for (const artifact of ['latest.yml', 'latest-linux.yml', '*.zip', '*.exe.blockmap']) {
    assert.ok(workflow.includes(artifact), `release.yml must upload ${artifact}`);
  }
});
