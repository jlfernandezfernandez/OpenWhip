# OpenWhip

![Whip divider](assets/divider.png)

A tiny desktop utility for when your coding agent needs a little encouragement.

OpenWhip lives in the menu bar or system tray. Summon the whip, crack it, and the app types one of the short English messages from the original release into the app you are using, then presses Enter.

## Install

The easiest option is to download the installer for your platform from [GitHub Releases](https://github.com/jlfernandezfernandez/OpenWhip/releases):

- macOS: open the `.dmg` and drag OpenWhip to Applications.
- Windows: run the `.exe` installer.
- Linux: use the `.AppImage` or install the `.deb` package.

On macOS, OpenWhip does not request permissions at launch. macOS may require keyboard-control permission when the app first tries to type into another app.

On Linux, install the small keyboard helper for your display server:

```bash
sudo apt install xdotool  # X11
sudo apt install wtype    # Wayland
```

Wayland compositors without the virtual-keyboard protocol can use `ydotool` instead, with its `ydotoold` service configured.

## Uninstall

- macOS: quit OpenWhip and move it from Applications to the Trash.
- Windows: open **Settings → Apps → Installed apps**, select OpenWhip, and choose **Uninstall**.
- Linux: delete the `.AppImage`, or run `sudo apt remove openwhip` if you installed the `.deb` package.

## Controls

- Click the menu bar or tray icon to summon the whip on the display under your pointer.
- Move the pointer to control it.
- Click to drop it.
- Right-click the icon to crack the whip or quit OpenWhip.

The renderer sleeps while the whip is hidden, so idle CPU use stays at zero.

OpenWhip never sends `Ctrl+C` or switches applications. Keep the Teams chat, terminal, or other destination focused while cracking the whip.

## Development

```bash
npm install
npm start
```

Create a local installer with one of these commands:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Pushing a version tag such as `v1.2.5` builds all platform installers and publishes a GitHub release automatically. Local builds go into `dist.noindex` so macOS Spotlight does not list development copies of the app.

## License

MIT
