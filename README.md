# OpenWhip

![Whip divider](assets/divider.png)

A tiny menu-bar whip for when your coding agent needs a little encouragement.

Press **Ctrl/⌘+Alt+W** (or pick **Start whipping** from the tray menu), swing
the mouse, and every crack types a short message (**FASTER**, **GO FASTER**, …)
into whatever has keyboard focus — a terminal, Teams, Slack, an IDE chat — and
presses Enter.

## Install

Download the installer for your platform from
[GitHub Releases](https://github.com/jlfernandezfernandez/OpenWhip/releases).

| Platform | File                                    | Notes                                                                                                                          |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| macOS    | `OpenWhip-*-mac-arm64.dmg` / `-x64.dmg` | Drag to Applications, then see [First launch on macOS](#first-launch-on-macos).                                                |
| Windows  | `OpenWhip-*-win-x64.exe`                | One-click installer, per-user, no admin rights.                                                                                |
| Linux    | `.AppImage` or `.deb`                   | Needs a typing helper: `xdotool` (X11) or `wtype` (Wayland). `ydotool` is used as a Wayland fallback if `ydotoold` is running. |

### First launch on macOS

OpenWhip is not notarized (that needs a paid Apple Developer account), so
Gatekeeper blocks the first launch. Nothing is wrong with your Mac. Either:

- Open **System Settings → Privacy & Security**, scroll down and click
  **Open Anyway** next to OpenWhip, or
- run once in Terminal:

  ```bash
  xattr -dr com.apple.quarantine /Applications/OpenWhip.app
  ```

If you see *"OpenWhip is damaged and can't be opened"*, use the Terminal
command — that wording is what macOS shows for unsigned downloads.

### Updates

OpenWhip checks GitHub Releases on launch and every few hours, downloads the
new version in the background and then shows **Restart to update** at the top
of the tray menu. There is nothing to configure.

- **macOS** — the `.zip` for your architecture is downloaded, its SHA-256 is
  verified against the release, and the app bundle in `/Applications` is
  swapped atomically. No new `.dmg` to open.
- **Windows / AppImage** — handled by `electron-updater`; the update is
  applied on restart (or on quit).
- **`.deb`** — notify only; the menu item opens the release page.

### Permissions

OpenWhip asks for the bare minimum needed to type into another app:

- **macOS** — *Accessibility* only. The first crack shows the system prompt;
  toggle OpenWhip on in **System Settings → Privacy & Security → Accessibility**.
  Until then the tray menu offers **Allow keyboard access…**. There is no
  AppleScript, so no extra *Automation* prompt. Release builds are signed with
  a stable (self-signed) certificate, so the grant survives updates.
- **Windows / Linux** — nothing.

OpenWhip never reads the screen, listens to the keyboard, or touches the
network.

## Use

1. Press **Ctrl/⌘+Alt+W** or click the tray icon → **Start whipping**. The whip
   appears under your pointer on that display.
2. Move the mouse to swing it. Snap it fast enough and it cracks.
3. Click (or press the shortcut again) to drop the whip; it falls off screen and
   the overlay goes idle (0% CPU).

The tray menu only ever shows what is relevant: start/drop, a pending update,
the macOS permission prompt while it is missing, and Quit.

The overlay never takes focus, so the app you were typing in keeps receiving
the messages.

## Development

```bash
npm install
npm start
```

```
src/
  main.js      tray, overlay window, IPC
  overlay.js   whip physics + rendering (fixed-step Verlet, HiDPI canvas)
  typer.js     per-platform keystroke injection
  updater.js   background updates (GitHub Releases / electron-updater)
  preload.js   sandboxed bridge
```

Build a local installer with `npm run dist:mac`, `dist:win` or `dist:linux`
(output in `dist.noindex/`; macOS builds target the host architecture).
Pushing a tag like `v2.0.0` builds all installers — macOS arm64 and Intel,
Windows, Linux — and publishes a GitHub release.

## License

[MIT](LICENSE)
