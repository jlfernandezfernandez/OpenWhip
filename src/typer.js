'use strict';

// Types a line of text into whatever app currently has keyboard focus, then
// presses Enter. Each platform uses the lowest-privilege mechanism available:
//
//   macOS    CoreGraphics keyboard events. Needs Accessibility only – no
//            AppleScript, so no extra "Automation" prompt.
//   Windows  user32 SendInput with KEYEVENTF_UNICODE. No permissions needed.
//   Linux    xdotool (X11) or wtype / ydotool (Wayland). No permissions needed.

const { execFile } = require('node:child_process');

function loadKoffi() {
  try {
    return require('koffi');
  } catch (err) {
    console.warn('koffi unavailable, typing disabled:', err.message);
    return null;
  }
}

function utf16(text) {
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
  return units;
}

// ── macOS ───────────────────────────────────────────────────────────────────
function createMacTyper() {
  const koffi = loadKoffi();
  if (!koffi) return null;

  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const createKeyEvent = cg.func(
    'void *CGEventCreateKeyboardEvent(void *source, uint16_t key, bool keyDown)',
  );
  const setUnicode = cg.func(
    'void CGEventKeyboardSetUnicodeString(void *event, ulong length, const uint16_t *str)',
  );
  const post = cg.func('void CGEventPost(uint32_t tap, void *event)');
  const release = cf.func('void CFRelease(void *cf)');

  const HID_TAP = 0;
  const KEY_RETURN = 36;

  const tap = (key, units) => {
    for (const down of [true, false]) {
      const event = createKeyEvent(null, key, down);
      if (units) setUnicode(event, units.length, units);
      post(HID_TAP, event);
      release(event);
    }
  };

  return text => {
    // One event per code point so every app (terminals included) accepts it.
    for (const ch of text) tap(0, utf16(ch));
    tap(KEY_RETURN);
  };
}

// ── Windows ─────────────────────────────────────────────────────────────────
function createWindowsTyper() {
  const koffi = loadKoffi();
  if (!koffi) return null;

  const user32 = koffi.load('user32.dll');
  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16',
    wScan: 'uint16',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  });
  const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
    dx: 'int32',
    dy: 'int32',
    mouseData: 'uint32',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
  });
  const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
    uMsg: 'uint32',
    wParamL: 'uint16',
    wParamH: 'uint16',
  });
  const INPUT = koffi.struct('INPUT', {
    type: 'uint32',
    u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
  });
  const sendInput = user32.func('uint32 __stdcall SendInput(uint32 count, const INPUT *inputs, int size)');

  const INPUT_KEYBOARD = 1;
  const KEYEVENTF_KEYUP = 0x0002;
  const KEYEVENTF_UNICODE = 0x0004;
  const VK_RETURN = 0x0d;

  const key = (wVk, wScan, dwFlags) => ({
    type: INPUT_KEYBOARD,
    u: { ki: { wVk, wScan, dwFlags, time: 0, dwExtraInfo: 0 } },
  });

  return text => {
    const inputs = [];
    for (const unit of utf16(text)) {
      inputs.push(key(0, unit, KEYEVENTF_UNICODE), key(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
    }
    inputs.push(key(VK_RETURN, 0, 0), key(VK_RETURN, 0, KEYEVENTF_KEYUP));
    sendInput(inputs.length, inputs, koffi.sizeof(INPUT));
  };
}

// ── Linux ───────────────────────────────────────────────────────────────────
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, err => (err ? reject(err) : resolve()));
  });
}

function createLinuxTyper() {
  const wayland = Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === 'wayland';

  if (!wayland) {
    return text =>
      run('xdotool', ['type', '--delay', '1', '--clearmodifiers', '--', text, 'key', 'Return']).catch(err =>
        console.warn('Typing failed. Install xdotool:', err.message),
      );
  }

  // wtype uses the virtual-keyboard protocol; ydotool (with ydotoold) is the
  // fallback for compositors that do not expose it.
  return text =>
    run('wtype', ['--', text])
      .then(() => run('wtype', ['-k', 'Return']))
      .catch(() => run('ydotool', ['type', text]).then(() => run('ydotool', ['key', '28:1', '28:0'])))
      .catch(err => console.warn('Typing failed. Install wtype or configure ydotoold:', err.message));
}

// ── Public API ──────────────────────────────────────────────────────────────
let typer;

function createTyper() {
  switch (process.platform) {
    case 'darwin':
      return createMacTyper();
    case 'win32':
      return createWindowsTyper();
    case 'linux':
      return createLinuxTyper();
    default:
      return null;
  }
}

/** Types `text` into the focused app and presses Enter. Never throws. */
function typeLine(text) {
  if (typer === undefined) typer = createTyper();
  if (!typer) return;
  try {
    const result = typer(text);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (err) {
    console.warn('Typing failed:', err.message);
  }
}

module.exports = { typeLine };
