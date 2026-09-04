#!/bin/sh
# OpenWhip installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/jlfernandezfernandez/open-whip/main/install.sh | sh
#
# Downloads the latest release for this Mac, verifies its SHA-256 against the
# digest GitHub publishes for the asset, installs it into /Applications and
# launches it. Files fetched with curl carry no quarantine flag, so Gatekeeper
# does not block the first launch.
set -eu

REPO="jlfernandezfernandez/open-whip"
APP="OpenWhip.app"
DEST="${OPENWHIP_DEST:-/Applications}"

[ "$(uname -s)" = "Darwin" ] || { echo "This installer is for macOS. Grab a build at https://github.com/$REPO/releases"; exit 1; }
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

release=$(curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases/latest")
# JXA ships with every macOS, so JSON parsing needs no extra tools.
resolved=$(printf '%s' "$release" | osascript -l JavaScript -e '
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const rel = JSON.parse($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js);
  const version = rel.tag_name.replace(/^v/, "");
  const asset = rel.assets.find(a => a.name === `OpenWhip-${version}-mac-'"$ARCH"'.zip`);
  asset && asset.digest ? `${version} ${asset.digest.replace("sha256:", "")}` : "";
')
version=${resolved% *}
digest=${resolved#* }
asset="OpenWhip-$version-mac-$ARCH.zip"
[ -n "$resolved" ] || { echo "Could not resolve the latest release. Try https://github.com/$REPO/releases"; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
echo "Downloading OpenWhip $version ($ARCH)…"
curl -fL --progress-bar -o "$work/$asset" "https://github.com/$REPO/releases/download/v$version/$asset"

actual=$(shasum -a 256 "$work/$asset" | cut -d' ' -f1)
[ "$actual" = "$digest" ] || { echo "Checksum mismatch — aborting."; exit 1; }

ditto -x -k "$work/$asset" "$work"
codesign --verify --deep --strict "$work/$APP"

if pgrep -xq OpenWhip; then
  echo "Closing the running OpenWhip…"
  osascript -e 'quit app "OpenWhip"' 2>/dev/null || pkill -x OpenWhip || true
  sleep 1
fi
rm -rf "$DEST/$APP"
ditto "$work/$APP" "$DEST/$APP"

echo "Installed to $DEST/$APP"
open "$DEST/$APP"
echo "OpenWhip is in your menu bar. Press ⌘⌥W to grab the whip."
