const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// ── Single Instance Lock ────────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// ── Win32 FFI (Windows only) ────────────────────────────────────────────────
let keybd_event, VkKeyScanA;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    VkKeyScanA = user32.func('int16_t __stdcall VkKeyScanA(int ch)');
  } catch (e) {
    console.warn('koffi not available – macro sending disabled', e.message);
  }
}

// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay;
let overlayReady = false;
let spawnQueued = false;
let activeDisplayId = null;
let cursorTrackTimer = null;
let isQuitting = false;

// ── Keyboard constants ──
const VK_RETURN  = 0x0D;
const KEYUP      = 0x0002;

// ── Tray Icons ──────────────────────────────────────────────────────────────
function getTemplateImage() {
  const iconDir = path.join(__dirname, 'icon');
  const standardPath = path.join(iconDir, 'Template.png');

  if (fs.existsSync(standardPath)) {
    const image = nativeImage.createFromPath(standardPath);
    if (!image.isEmpty()) {
      if (process.platform === 'darwin') image.setTemplateImage(true);
      return image;
    }
  }
  return nativeImage.createEmpty();
}

function getTrayIcon() {
  const iconDir = path.join(__dirname, 'icon');
  if (process.platform === 'win32') {
    const file = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
  }
  if (process.platform === 'linux') {
    const file = path.join(iconDir, 'tray.png');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
  }
  return getTemplateImage();
}

// ── Displays & Multi-Monitor Support (Always Auto) ─────────────────────────
function getTargetDisplay() {
  const cursorPos = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursorPos);
}

function cycleDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length <= 1) return;

  const current = getTargetDisplay();
  const currentIndex = displays.findIndex(d => d.id === current.id);
  const nextDisplay = displays[(currentIndex + 1) % displays.length];
  activeDisplayId = nextDisplay.id;

  if (overlay && overlay.isVisible()) {
    overlay.setBounds(nextDisplay.bounds);
    overlay.webContents.send('display-changed', nextDisplay.bounds);
  }
}

function startCursorTracking() {
  stopCursorTracking();
  cursorTrackTimer = setInterval(() => {
    if (!overlay || !overlay.isVisible()) {
      stopCursorTracking();
      return;
    }
    const cursorPos = screen.getCursorScreenPoint();
    const nearest = screen.getDisplayNearestPoint(cursorPos);
    if (activeDisplayId !== nearest.id) {
      activeDisplayId = nearest.id;
      overlay.setBounds(nearest.bounds);
      overlay.webContents.send('display-changed', nearest.bounds);
    }
  }, 75);
}

function stopCursorTracking() {
  if (cursorTrackTimer) {
    clearInterval(cursorTrackTimer);
    cursorTrackTimer = null;
  }
}

function quitApplication() {
  if (isQuitting) return;
  isQuitting = true;

  stopCursorTracking();
  globalShortcut.unregisterAll();

  if (overlay && !overlay.isDestroyed()) {
    overlay.destroy();
  }
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }

  // A tray-only app has no normal window lifecycle to finish. Exit explicitly
  // after releasing its native resources so Quit always terminates the process.
  app.exit(0);
}

// ── Overlay window ──────────────────────────────────────────────────────────
function createOverlay(display) {
  const targetDisplay = display || getTargetDisplay();
  const { bounds } = targetDisplay;
  activeDisplayId = targetDisplay.id;

  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.setBounds(bounds);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlayReady = false;
  overlay.loadFile('overlay.html');

  overlay.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (spawnQueued && overlay && overlay.isVisible()) {
      spawnQueued = false;
      const cursorPos = screen.getCursorScreenPoint();
      const relX = cursorPos.x - bounds.x;
      const relY = cursorPos.y - bounds.y;
      overlay.webContents.send('spawn-whip', { x: relX, y: relY });
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
  if (overlay && overlay.isVisible()) {
    overlay.webContents.send('drop-whip');
    stopCursorTracking();
    return;
  }

  const target = getTargetDisplay();
  activeDisplayId = target.id;

  if (!overlay) {
    createOverlay(target);
  } else {
    overlay.setBounds(target.bounds);
  }

  overlay.show();
  startCursorTracking();

  const cursorPos = screen.getCursorScreenPoint();
  const relX = cursorPos.x - target.bounds.x;
  const relY = cursorPos.y - target.bounds.y;

  if (overlayReady) {
    overlay.webContents.send('spawn-whip', { x: relX, y: relY });
  } else {
    spawnQueued = true;
  }
}

// ── Menu and Tray ───────────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Crack whip', accelerator: 'Alt+Shift+W', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit OpenWhip', click: quitApplication },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('OpenWhip');
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('whip-crack', () => {
  try {
    sendMacro();
  } catch (err) {
    console.warn('sendMacro failed:', err?.message || err);
  }
});

ipcMain.on('hide-overlay', () => {
  if (overlay) overlay.hide();
  stopCursorTracking();
});

ipcMain.on('cycle-display', () => {
  cycleDisplay();
});

// ── Phrases & Macro ────────────────────────────────────────────────────────
const PHRASES = [
  'FASTER',
  'FASTER',
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
];

function getRandomPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

function sendMacro() {
  const chosen = getRandomPhrase();

  if (process.platform === 'win32') {
    sendMacroWindows(chosen);
  } else if (process.platform === 'darwin') {
    sendMacroMac(chosen);
  } else if (process.platform === 'linux') {
    sendMacroLinux(chosen);
  }
}

function sendMacroWindows(text) {
  if (!keybd_event || !VkKeyScanA) return;
  const tapKey = vk => {
    keybd_event(vk, 0, 0, 0);
    keybd_event(vk, 0, KEYUP, 0);
  };
  const tapChar = ch => {
    const packed = VkKeyScanA(ch.charCodeAt(0));
    if (packed === -1) return;
    const vk = packed & 0xff;
    const shiftState = (packed >> 8) & 0xff;
    if (shiftState & 1) keybd_event(0x10, 0, 0, 0);
    tapKey(vk);
    if (shiftState & 1) keybd_event(0x10, 0, KEYUP, 0);
  };

  for (const ch of text) tapChar(ch);
  keybd_event(VK_RETURN, 0, 0, 0);
  keybd_event(VK_RETURN, 0, KEYUP, 0);
}

function sendMacroMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    '  key code 36',
    'end tell',
  ].join('\n');

  execFile('osascript', ['-e', script], err => {
    if (err) {
      console.warn('mac macro failed:', err.message);
    }
  });
}

function sendMacroLinux(text) {
  execFile(
    'xdotool',
    [
      'type', '--delay', '1', '--clearmodifiers', '--', text,
      'key', 'Return',
    ],
    err => {
      if (err) {
        console.warn('linux macro failed. Install xdotool:', err.message);
      }
    }
  );
}

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory');
  }
  tray = new Tray(getTrayIcon());
  updateTrayMenu();
  tray.on('click', toggleOverlay);

  // Global hotkey to crack/toggle whip from anywhere
  try {
    globalShortcut.register('Alt+Shift+W', () => {
      toggleOverlay();
    });
  } catch (e) {
    console.warn('Could not register global hotkey:', e?.message || e);
  }
});

app.on('second-instance', () => {
  toggleOverlay();
});

app.on('will-quit', () => {
  stopCursorTracking();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', e => e.preventDefault());
