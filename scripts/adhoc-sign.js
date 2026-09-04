'use strict';

// electron-builder skips signing when no Developer ID is available, leaving the
// bundle with Electron's stale linker signature. Gatekeeper then reports the app
// as "damaged". An ad-hoc signature keeps the bundle consistent so users get the
// regular "unverified developer → Open Anyway" flow instead.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'darwin') return;
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
