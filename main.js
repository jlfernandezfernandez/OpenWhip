const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, globalShortcut } = require('electron');
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
let restoreFocusQueued = false;
let activeDisplayId = null;
let cursorTrackTimer = null;

// ── Keyboard constants ──
const VK_CONTROL = 0x11;
const VK_RETURN  = 0x0D;
const VK_C       = 0x43;
const VK_MENU    = 0x12; // Alt
const VK_TAB     = 0x09;
const KEYUP      = 0x0002;

/** Return focus after a tray click on platforms where the system tray takes it. */
function refocusPreviousApp() {
  const delayMs = 80;
  const run = () => {
    if (process.platform === 'win32') {
      if (!keybd_event) return;
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_TAB, 0, 0, 0);
      keybd_event(VK_TAB, 0, KEYUP, 0);
      keybd_event(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'linux') {
      execFile('xdotool', ['key', '--clearmodifiers', 'alt+Tab'], err => {
        if (err) {
          console.warn('refocus previous app (Alt+Tab) failed. Install xdotool:', err.message);
        }
      });
    }
  };
  setTimeout(run, delayMs);
}

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
      if (restoreFocusQueued) refocusPreviousApp();
      restoreFocusQueued = false;
    }
  });

  overlay.on('closed', () => {
    overlay = null;
    overlayReady = false;
    spawnQueued = false;
    restoreFocusQueued = false;
    stopCursorTracking();
  });
}

function toggleOverlay({ restoreFocus = false } = {}) {
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
    if (restoreFocus) refocusPreviousApp();
  } else {
    spawnQueued = true;
    restoreFocusQueued = restoreFocus;
  }
}

// ── Menu and Tray ───────────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Crack whip', accelerator: 'Alt+Shift+W', click: () => toggleOverlay({ restoreFocus: true }) },
    { type: 'separator' },
    { label: 'Quit OpenWhip', role: 'quit' },
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

  keybd_event(VK_CONTROL, 0, 0, 0);
  keybd_event(VK_C, 0, 0, 0);
  keybd_event(VK_C, 0, KEYUP, 0);
  keybd_event(VK_CONTROL, 0, KEYUP, 0);
  for (const ch of text) tapChar(ch);
  keybd_event(VK_RETURN, 0, 0, 0);
  keybd_event(VK_RETURN, 0, KEYUP, 0);
}

function sendMacroMac(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const interruptScript = [
    'tell application "System Events"',
    '  key code 8 using {control down}',
    'end tell',
  ].join('\n');
  const typeAndEnterScript = [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    '  key code 36',
    'end tell',
  ].join('\n');

  execFile('osascript', ['-e', interruptScript], err => {
    if (err) {
      console.warn('mac macro failed (enable Accessibility for terminal/app):', err.message);
      return;
    }

    setTimeout(() => {
      execFile('osascript', ['-e', typeAndEnterScript], err2 => {
        if (err2) {
          console.warn('mac macro failed (enable Accessibility for terminal/app):', err2.message);
        }
      });
    }, 300);
  });
}

function sendMacroLinux(text) {
  execFile(
    'xdotool',
    [
      'key', '--clearmodifiers', 'ctrl+c',
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
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
  tray = new Tray(getTrayIcon());
  updateTrayMenu();
  tray.on('click', () => toggleOverlay({ restoreFocus: true }));

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
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', e => e.preventDefault());
