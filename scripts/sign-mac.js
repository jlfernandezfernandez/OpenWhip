'use strict';

// electron-builder skips signing without a Developer ID, which would leave the
// bundle with Electron's stale linker signature ("app is damaged"). We sign it
// ourselves instead:
//
//   MAC_SIGN_IDENTITY set (CI)  → stable self-signed certificate. Its designated
//                                 requirement is tied to the certificate, so the
//                                 Accessibility grant survives updates.
//   otherwise (local builds)    → ad-hoc.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'darwin') return;
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  const identity = process.env.MAC_SIGN_IDENTITY || '-';
  execFileSync('codesign', ['--force', '--deep', '--timestamp=none', '--sign', identity, app], {
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
