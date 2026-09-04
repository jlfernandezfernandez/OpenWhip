'use strict';

// Background updates with a "Restart to update" step, without paid code signing.
//
//   macOS            GitHub Releases API → download the .zip for this arch,
//                    verify its sha256, swap the .app bundle in place, relaunch.
//                    Files written by the app carry no quarantine flag, and the
//                    bundle is ad-hoc signed, so Gatekeeper stays out of the way.
//   Windows/AppImage electron-updater (works unsigned).
//   Otherwise        Notify only; the menu item opens the release page.

const { app, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

const REPO = 'jlfernandezfernandez/OpenWhip';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
// Overridable so the self-update flow can be exercised against a local server.
const LATEST_API = process.env.OPENWHIP_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// status: idle | checking | downloading | ready | manual
const state = { status: 'idle', version: null, url: RELEASES_URL };
let listener = () => {};
let strategy;

function set(status, version = state.version, url = state.url) {
  Object.assign(state, { status, version, url });
  listener(state);
}

const isNewer = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

function run(cmd, args) {
  return new Promise((resolve, reject) => execFile(cmd, args, err => (err ? reject(err) : resolve())));
}

// ── GitHub Releases API (macOS + manual) ────────────────────────────────────
async function fetchLatest() {
  const res = await net.fetch(LATEST_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const rel = await res.json();
  return { version: rel.tag_name.replace(/^v/, ''), url: rel.html_url, assets: rel.assets };
}

async function download(asset, dest) {
  const res = await net.fetch(asset.browser_download_url);
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const hash = crypto.createHash('sha256');
  await pipeline(
    Readable.fromWeb(res.body),
    async function* (source) { for await (const chunk of source) { hash.update(chunk); yield chunk; } },
    fs.createWriteStream(dest),
  );
  const expected = (asset.digest || '').replace(/^sha256:/, '');
  if (!expected || hash.digest('hex') !== expected) throw new Error('checksum mismatch');
}

function macBundle() {
  const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
  const movable = bundle.endsWith('.app') && !bundle.includes('/AppTranslocation/') && !bundle.startsWith('/Volumes/');
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
  } catch {
    return null;
  }
  return movable ? bundle : null;
}

async function installMac(asset, bundle) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'openwhip-update-'));
  // Staged next to the bundle so the final swap is two same-volume renames.
  const staged = path.join(path.dirname(bundle), `.${path.basename(bundle)}.new`);
  const backup = `${bundle}.old`;
  try {
    const zip = path.join(work, asset.name);
    await download(asset, zip);
    await run('ditto', ['-x', '-k', zip, work]); // preserves symlinks + signature
    const fresh = path.join(work, path.basename(bundle));
    await run('codesign', ['--verify', '--deep', '--strict', fresh]);

    fs.rmSync(staged, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
    await run('ditto', [fresh, staged]);

    fs.renameSync(bundle, backup);
    try {
      fs.renameSync(staged, bundle);
    } catch (err) {
      fs.renameSync(backup, bundle);
      throw err;
    }
    fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function githubStrategy() {
  return {
    async check() {
      const latest = await fetchLatest();
      if (!isNewer(latest.version, app.getVersion())) return;

      const bundle = process.platform === 'darwin' ? macBundle() : null;
      const asset = latest.assets.find(a => a.name === `OpenWhip-${latest.version}-mac-${process.arch}.zip`);
      if (!bundle || !asset) return set('manual', latest.version, latest.url);

      set('downloading', latest.version, latest.url);
      try {
        await installMac(asset, bundle);
        set('ready');
      } catch (err) {
        console.warn('Self-update failed, falling back to manual:', err.message);
        set('manual');
      }
    },
    install() {
      if (state.status === 'ready') {
        app.relaunch();
        app.exit(0);
      } else {
        shell.openExternal(state.url);
      }
    },
  };
}

// ── electron-updater (Windows, AppImage) ────────────────────────────────────
function electronUpdaterStrategy() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => set('downloading', info.version));
  autoUpdater.on('update-not-available', () => set('idle'));
  autoUpdater.on('update-downloaded', info => set('ready', info.version));
  autoUpdater.on('error', err => {
    console.warn('electron-updater:', err.message);
    set(state.version ? 'manual' : 'idle');
  });
  return {
    check: () => autoUpdater.checkForUpdates(),
    install: () => (state.status === 'ready' ? autoUpdater.quitAndInstall(true, true) : shell.openExternal(state.url)),
    installOnQuit: () => {
      if (state.status !== 'ready') return false;
      autoUpdater.quitAndInstall(true, false);
      return true;
    },
  };
}

function pickStrategy() {
  if (process.platform === 'win32' || (process.platform === 'linux' && process.env.APPIMAGE)) {
    try { return electronUpdaterStrategy(); } catch (err) { console.warn('electron-updater unavailable:', err.message); }
  }
  return githubStrategy();
}

// ── Public API ──────────────────────────────────────────────────────────────
async function check() {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'ready') return;
  strategy ??= pickStrategy();
  set('checking');
  try {
    await strategy.check();
  } catch (err) {
    console.warn('Update check failed:', err.message);
  } finally {
    if (state.status === 'checking') set('idle');
  }
}

function install() {
  strategy?.install();
}

/** Returns true when the strategy takes over the exit to apply a pending update. */
function installOnQuit() {
  return Boolean(strategy?.installOnQuit?.());
}

function start(onChange) {
  listener = onChange;
  if (!app.isPackaged) return;
  setTimeout(() => check(), 15_000);
  setInterval(() => check(), CHECK_EVERY_MS);
}

module.exports = { state, start, check, install, installOnQuit };
