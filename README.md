# OpenWhip

![Whip divider](assets/divider.png)

A tiny menu-bar whip for when your coding agent needs a little encouragement.

Click the tray icon, swing the mouse, and every crack types a short message
(**FASTER**, **GO FASTER**, …) into whatever has keyboard focus — a terminal,
Teams, Slack, an IDE chat — and presses Enter.

## Install

Download the installer for your platform from
[GitHub Releases](https://github.com/jlfernandezfernandez/OpenWhip/releases).

| Platform | File                                    | Notes                                                                                                                                                     |
| -------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `OpenWhip-*-mac-arm64.dmg` / `-x64.dmg` | Drag to Applications. Builds are unsigned, so on first launch right-click → **Open**, or run `xattr -dr com.apple.quarantine /Applications/OpenWhip.app`. |
| Windows  | `OpenWhip-*-win-x64.exe`                | One-click installer, per-user, no admin rights.                                                                                                           |
| Linux    | `.AppImage` or `.deb`                   | Needs a typing helper: `xdotool` (X11) or `wtype` (Wayland). `ydotool` is used as a Wayland fallback if `ydotoold` is running.                            |

### Permissions

OpenWhip asks for the bare minimum needed to type into another app:

- **macOS** — *Accessibility* only. The first crack shows the system prompt;
  toggle OpenWhip on in **System Settings → Privacy & Security → Accessibility**.
  There is no AppleScript, so no extra *Automation* prompt.
- **Windows / Linux** — nothing.

OpenWhip never reads the screen, listens to the keyboard, or touches the
network.

## Use

1. Click the tray icon — the whip appears under your pointer on that display.
2. Move the mouse to swing it. Snap it fast enough and it cracks.
3. Click to drop the whip; it falls off screen and the overlay goes idle (0% CPU).

Right-click the icon to crack, toggle **Launch at login**, or quit.

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
  preload.js   sandboxed bridge
```

Build a local installer with `npm run dist:mac`, `dist:win` or `dist:linux`
(output in `dist.noindex/`; macOS builds target the host architecture).
Pushing a tag like `v2.0.0` builds all installers — macOS arm64 and Intel,
Windows, Linux — and publishes a GitHub release.

## License

[MIT](LICENSE)
