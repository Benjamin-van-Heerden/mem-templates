#!/bin/sh
# Builds a release binary and wraps it in a macOS .app bundle under dist/.
#
# Usage: bundle-macos.sh <binary crate> "<App Name>" <bundle id> [icon.png]
#   e.g. bundle-macos.sh my-app "My App" com.example.myapp assets/app-icon.png
#
# Set SIGN_IDENTITY="Developer ID Application: …" to sign with the hardened
# runtime; without it the bundle gets an ad hoc signature, which runs only on
# this machine. Notarization is a separate step (see the skill).
set -eu

if [ "$#" -lt 3 ]; then
	echo "usage: $0 <binary crate> \"<App Name>\" <bundle id> [icon.png]" >&2
	exit 2
fi
crate=$1
app_name=$2
bundle_id=$3
icon=${4:-}

metadata=$(cargo metadata --format-version 1 --no-deps)
version=$(printf '%s' "$metadata" | python3 -c 'import json,sys; m=json.load(sys.stdin); print(next(p["version"] for p in m["packages"] if p["name"]==sys.argv[1]))' "$crate")
binary=$(printf '%s' "$metadata" | python3 -c 'import json,sys; m=json.load(sys.stdin); p=next(p for p in m["packages"] if p["name"]==sys.argv[1]); print(next(t["name"] for t in p["targets"] if "bin" in t["kind"]))' "$crate")
target_dir=$(printf '%s' "$metadata" | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')

cargo build --release --locked -p "$crate"

app="dist/$app_name.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$target_dir/release/$binary" "$app/Contents/MacOS/$binary"

icon_entry=""
if [ -n "$icon" ]; then
	iconset=$(mktemp -d)/AppIcon.iconset
	mkdir -p "$iconset"
	for size in 16 32 128 256 512; do
		sips -z "$size" "$size" "$icon" --out "$iconset/icon_${size}x${size}.png" >/dev/null
		double=$((size * 2))
		sips -z "$double" "$double" "$icon" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
	done
	iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
	icon_entry="<key>CFBundleIconFile</key><string>AppIcon</string>"
fi

cat >"$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$app_name</string>
  <key>CFBundleDisplayName</key><string>$app_name</string>
  <key>CFBundleIdentifier</key><string>$bundle_id</string>
  <key>CFBundleExecutable</key><string>$binary</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  $icon_entry
</dict></plist>
PLIST
plutil -lint "$app/Contents/Info.plist" >/dev/null

if [ -n "${SIGN_IDENTITY:-}" ]; then
	codesign --force --timestamp --options runtime --sign "$SIGN_IDENTITY" "$app"
else
	codesign --force --sign - "$app"
fi
codesign --verify --strict "$app"
echo "$app ($version)"
