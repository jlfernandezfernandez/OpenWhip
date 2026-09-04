'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, systemPreferences } = require('electron');
const path = require('node:path');
const { typeLine } = require('./typer');

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
const ICON_DIR = path.join(__dirname, '..', 'icon');

let tray = null;
let overlay = null;
let overlayReady = false;
let spawnQueued = false;
let activeDisplayId = null;
let cursorTimer = null;
let accessibilityPrompted = false;

// ── Tray ────────────────────────────────────────────────────────────────────
function trayIcon() {
  if (process.platform === 'win32') return nativeImage.createFromPath(path.join(ICON_DIR, 'icon.ico'));
  if (process.platform === 'linux') return nativeImage.createFromPath(path.join(ICON_DIR, 'tray.png'));
  const image = nativeImage.createFromPath(path.join(ICON_DIR, 'Template.png'));
  image.setTemplateImage(true);
  return image;
}

function buildMenu() {
  const items = [{ label: 'Crack the whip', click: toggleOverlay }, { type: 'separator' }];

  if (IS_MAC && !systemPreferences.isTrustedAccessibilityClient(false)) {
    items.push({
      label: 'Allow keyboard access…',
      click: () => systemPreferences.isTrustedAccessibilityClient(true),
    });
  }

  if (IS_MAC || process.platform === 'win32') {
    items.push({
      label: 'Launch at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }),
    });
  }

  items.push({ type: 'separator' }, { label: 'Quit OpenWhip', click: quit });
  return Menu.buildFromTemplate(items);
}

function refreshMenu() {
  if (tray) tray.setContextMenu(buildMenu());
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
  refreshMenu();
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
}

function hideOverlay() {
  stopCursorTracking();
  if (overlay && !overlay.isDestroyed()) overlay.hide();
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
  overlay?.destroy();
  tray?.destroy();
  app.exit(0);
}

app.whenReady().then(() => {
  if (IS_MAC) app.setActivationPolicy('accessory');

  tray = new Tray(trayIcon());
  tray.setToolTip('OpenWhip');
  tray.on('click', toggleOverlay);
  refreshMenu();
});

app.on('second-instance', toggleOverlay);
app.on('window-all-closed', () => {}); // Tray app: stay alive without windows.
