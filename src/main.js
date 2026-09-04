'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, systemPreferences } = require('electron');
const path = require('node:path');
const { typeLine } = require('./typer');
const updater = require('./updater');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const PHRASES = [
  'FASTER',
  'FASTER',
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
];

const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const ICON_DIR = path.join(__dirname, '..', 'icon');
const SHORTCUT = 'CommandOrControl+Alt+W';

let tray = null;
let overlay = null;
let overlayReady = false;
let spawnQueued = false;
let activeDisplayId = null;
let cursorTimer = null;
let accessibilityPrompted = false;
let shortcutRegistered = false;

// ── Tray ────────────────────────────────────────────────────────────────────
function trayIcon() {
  if (process.platform === 'win32') return nativeImage.createFromPath(path.join(ICON_DIR, 'icon.ico'));
  if (process.platform === 'linux') return nativeImage.createFromPath(path.join(ICON_DIR, 'tray.png'));
  const image = nativeImage.createFromPath(path.join(ICON_DIR, 'Template.png'));
  image.setTemplateImage(true);
  return image;
}

function buildMenu() {
  const { status, version } = updater.state;
  const items = [];

  if (status === 'ready') items.push({ label: `Restart to update to v${version}`, click: updater.install }, { type: 'separator' });
  else if (status === 'manual') items.push({ label: `Download v${version}…`, click: updater.install }, { type: 'separator' });
  else if (status === 'downloading') items.push({ label: `Downloading v${version}…`, enabled: false }, { type: 'separator' });

  items.push({
    label: overlay?.isVisible() ? 'Drop the whip' : 'Start whipping',
    accelerator: shortcutRegistered ? SHORTCUT : undefined,
    registerAccelerator: false,
    click: toggleOverlay,
  });

  if (IS_MAC && !systemPreferences.isTrustedAccessibilityClient(false)) {
    items.push({ type: 'separator' }, {
      label: 'Allow keyboard access…',
      click: () => systemPreferences.isTrustedAccessibilityClient(true),
    });
  }

  items.push({ type: 'separator' }, { label: 'Quit OpenWhip', click: quit });
  return Menu.buildFromTemplate(items);
}

// macOS/Windows pop the menu on click so it is always rebuilt fresh; Linux
// status icons only support a static context menu, refreshed on state changes.
function showMenu() {
  if (!IS_LINUX) tray?.popUpContextMenu(buildMenu());
}

function refreshMenu() {
  if (!tray) return;
  if (IS_LINUX) tray.setContextMenu(buildMenu());
  tray.setToolTip(updater.state.status === 'ready' ? 'OpenWhip — restart to update' : 'OpenWhip');
}

// ── Overlay ─────────────────────────────────────────────────────────────────
function displayUnderCursor() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function cursorRelativeTo(bounds) {
  const cursor = screen.getCursorScreenPoint();
  return { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
}

function createOverlay(display) {
  const { bounds } = display;
  overlay = new BrowserWindow({
    ...bounds,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.loadFile(path.join(__dirname, 'overlay.html'));

  overlay.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (spawnQueued) {
      spawnQueued = false;
      overlay.webContents.send('spawn', cursorRelativeTo(overlay.getBounds()));
    }
  });

  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    spawnQueued = false;
    stopCursorTracking();
  });
}

function toggleOverlay() {
  if (overlay?.isVisible()) {
    overlay.webContents.send('drop');
    return;
  }

  const display = displayUnderCursor();
  activeDisplayId = display.id;

  if (!overlay) createOverlay(display);
  else overlay.setBounds(display.bounds);

  overlay.showInactive();
  startCursorTracking();

  if (overlayReady) overlay.webContents.send('spawn', cursorRelativeTo(display.bounds));
  else spawnQueued = true;
  refreshMenu();
}

function hideOverlay() {
  stopCursorTracking();
  if (overlay && !overlay.isDestroyed()) overlay.hide();
  refreshMenu();
}

// Follow the pointer across monitors while the whip is out.
function startCursorTracking() {
  stopCursorTracking();
  cursorTimer = setInterval(() => {
    if (!overlay?.isVisible()) return stopCursorTracking();
    const display = displayUnderCursor();
    if (display.id === activeDisplayId) return;
    activeDisplayId = display.id;
    overlay.setBounds(display.bounds);
    overlay.webContents.send('display-changed');
  }, 75);
}

function stopCursorTracking() {
  clearInterval(cursorTimer);
  cursorTimer = null;
}

// ── Whip crack → type a phrase ──────────────────────────────────────────────
function canType() {
  if (!IS_MAC) return true;
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true;
  if (!accessibilityPrompted) {
    accessibilityPrompted = true;
    systemPreferences.isTrustedAccessibilityClient(true);
    refreshMenu();
  }
  return false;
}

ipcMain.on('crack', () => {
  if (!canType()) return;
  typeLine(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
});

ipcMain.on('hidden', hideOverlay);

// ── Lifecycle ───────────────────────────────────────────────────────────────
function quit() {
  stopCursorTracking();
  globalShortcut.unregisterAll();
  overlay?.destroy();
  tray?.destroy();
  if (updater.installOnQuit()) return;
  app.exit(0);
}

app.whenReady().then(() => {
  if (IS_MAC) app.setActivationPolicy('accessory');

  shortcutRegistered = globalShortcut.register(SHORTCUT, toggleOverlay);
  if (!shortcutRegistered) console.warn(`Shortcut ${SHORTCUT} unavailable`);

  tray = new Tray(trayIcon());
  tray.on('click', showMenu);
  tray.on('right-click', showMenu);
  refreshMenu();
  updater.start(refreshMenu);
});

app.on('second-instance', toggleOverlay);
app.on('window-all-closed', () => {}); // Tray app: stay alive without windows.
