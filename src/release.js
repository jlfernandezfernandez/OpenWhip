'use strict';

// Pure helpers shared by the updater and its tests (no Electron dependency).

const PRODUCT = 'OpenWhip';

/** True when semver `a` is strictly newer than `b` (leading "v" allowed). */
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/** Release asset the macOS self-updater downloads; must match electron-builder's artifactName. */
function macAssetName(version, arch) {
  return `${PRODUCT}-${version}-mac-${arch}.zip`;
}

module.exports = { isNewer, macAssetName };
