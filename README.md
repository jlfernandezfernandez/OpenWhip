# OpenWhip

![Whip divider](assets/divider.png)

A tiny desktop utility for when your coding agent needs a little encouragement.

OpenWhip lives in the menu bar or system tray. Summon the whip, crack it, and the app interrupts the active terminal with one of the short English messages from the original release.

## Install

The easiest option is to download the installer for your platform from [GitHub Releases](https://github.com/jlfernandezfernandez/OpenWhip/releases):

- macOS: open the `.dmg` and drag OpenWhip to Applications.
- Windows: run the `.exe` installer.
- Linux: use the `.AppImage` or install the `.deb` package.

On macOS, allow OpenWhip under **System Settings → Privacy & Security → Accessibility** so it can send `Ctrl-C` and type into the active terminal. Linux users need `xdotool`:

```bash
sudo apt install xdotool
```

## Uninstall

- macOS: quit OpenWhip and move it from Applications to the Trash. You can also remove it from the Accessibility list in System Settings.
- Windows: open **Settings → Apps → Installed apps**, select OpenWhip, and choose **Uninstall**.
- Linux: delete the `.AppImage`, or run `sudo apt remove openwhip` if you installed the `.deb` package.

## Controls

- Click the menu bar or tray icon, or press `Option+Shift+W` / `Alt+Shift+W`, to summon the whip on the display under your pointer.
- Move the pointer to control it.
- Click, press `Escape`, or press `Space` to drop it.
- Press `Tab` or `M` to move it to the next display.
- Right-click the icon to crack the whip or quit OpenWhip.

The renderer sleeps while the whip is hidden, so idle CPU use stays at zero.

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

Pushing a version tag such as `v1.2.0` builds all platform installers and publishes a GitHub release automatically.

## License

MIT
