#!/usr/bin/env bash
#
# Give the payment driver (Sber UPOS) a USB permission for the pinpad that survives reboots.
#
# Why: after a tablet reboot the driver has no USB permission for a pinpad that was already
# plugged in. It asks for it, Android tries to show "Allow access to the USB device?", and kiosk
# lock task blocks that dialog, so payments fail until someone replugs the cable. A replug works
# only because Android then grants the permission itself. This script records the permission as
# persistent, so neither the dialog nor the replug is needed any more.
#
# Run it ONCE per tablet, over ADB, with the pinpad plugged in. Repeat it when the pinpad is
# replaced (the permission is tied to the pinpad's serial number) or when the driver app is
# uninstalled and installed again (an update keeps the permission).
#
# Only ADB can do this: it needs the MANAGE_USB right, which the ADB shell has and no installed
# app can get, the MDM agent (Device Owner) included.
#
# Usage:
#   ./grant-pinpad-usb.sh                      grant for the default pinpad and driver
#   ./grant-pinpad-usb.sh --list               show the USB devices the tablet sees, change nothing
#   ./grant-pinpad-usb.sh --revoke             take the persistent permission back
#
# Options:
#   -s, --serial <adb-serial>   which ADB device (as in `adb devices`), when several are connected
#   -p, --package <name>        driver package             (default: ru.sberbank.upos_driver_test)
#   -v, --vendor-id <ids>       pinpad USB vendor id(s), comma-separated, decimal or 0x hex
#                               (default: 3725 = Kozen, the P10 pinpad)
#
# Needs: adb. To build the helper the first time: a JDK 11+ and the Android SDK (platform +
# build-tools). The built helper is cached in ./build/usbtool.dex; a machine without the SDK can
# use a build/ directory copied from one that has it.

set -euo pipefail

PACKAGE="ru.sberbank.upos_driver_test"
VENDOR_IDS="3725"
ADB_SERIAL=""
ACTION="grant"

while [ $# -gt 0 ]; do
  case "$1" in
    -s|--serial) ADB_SERIAL="${2:?--serial needs a value}"; shift 2 ;;
    -p|--package) PACKAGE="${2:?--package needs a value}"; shift 2 ;;
    -v|--vendor-id) VENDOR_IDS="${2:?--vendor-id needs a value}"; shift 2 ;;
    --list) ACTION="list"; shift ;;
    --revoke) ACTION="revoke"; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 64 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
DEX="$HERE/build/usbtool.dex"
REMOTE_DEX="/data/local/tmp/mdmesh-usbtool.dex"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v adb >/dev/null 2>&1 || die "adb not found in PATH"

adb_cmd() {
  if [ -n "$ADB_SERIAL" ]; then adb -s "$ADB_SERIAL" "$@"; else adb "$@"; fi
}

build_dex() {
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [ -z "$sdk" ]; then
    for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
      if [ -d "$candidate" ]; then sdk="$candidate"; break; fi
    done
  fi
  [ -n "$sdk" ] && [ -d "$sdk" ] || die "Android SDK not found: set ANDROID_HOME, or copy a built build/ directory here"

  local android_jar d8 javac
  android_jar="$(ls -d "$sdk"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1)"
  d8="$(ls -d "$sdk"/build-tools/*/d8 2>/dev/null | sort -V | tail -1)"
  [ -n "$android_jar" ] || die "no Android platform in $sdk/platforms (install one with sdkmanager)"
  [ -n "$d8" ] || die "no build-tools in $sdk/build-tools (install them with sdkmanager)"

  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
    javac="$JAVA_HOME/bin/javac"
  else
    javac="$(command -v javac || true)"
  fi
  [ -n "$javac" ] || die "javac not found: install a JDK 11+ or set JAVA_HOME"

  echo "Building the helper (first run)..."
  rm -rf "$HERE/build/classes"
  mkdir -p "$HERE/build/classes"
  "$javac" -source 11 -target 11 -Xlint:-options -nowarn \
    -cp "$android_jar" -d "$HERE/build/classes" "$HERE/UsbPermissionTool.java"
  "$d8" --lib "$android_jar" --output "$HERE/build" "$HERE/build/classes/UsbPermissionTool.class"
  mv "$HERE/build/classes.dex" "$DEX"
}

if [ ! -f "$DEX" ] || [ "$HERE/UsbPermissionTool.java" -nt "$DEX" ]; then
  build_dex
fi

state="$(adb_cmd get-state 2>&1 || true)"
[ "$state" = "device" ] || die "no tablet on ADB ($state). Check \`adb devices\`; with several connected, pass --serial"

run_tool() {
  adb_cmd shell "CLASSPATH=$REMOTE_DEX app_process /system/bin UsbPermissionTool $*" | tr -d '\r'
}

cleanup() { adb_cmd shell rm -f "$REMOTE_DEX" >/dev/null 2>&1 || true; }
trap cleanup EXIT

adb_cmd push "$DEX" "$REMOTE_DEX" >/dev/null

if [ "$ACTION" = "list" ]; then
  out="$(run_tool list)"
  if [ -z "$out" ]; then echo "The tablet sees no USB devices."; else echo "$out"; fi
  exit 0
fi

uid="$(adb_cmd shell cmd package list packages -U "$PACKAGE" | tr -d '\r' \
  | awk -v pkg="package:$PACKAGE" '$1 == pkg { sub(/^uid:/, "", $2); print $2; exit }')"
[ -n "$uid" ] || die "package $PACKAGE is not installed on the tablet"

set +e
out="$(run_tool "$ACTION" "$uid" "$VENDOR_IDS")"
set -e
echo "$out"

if grep -q '^ERROR' <<<"$out"; then
  exit 1
fi
if ! grep -qE '^(GRANTED|REVOKED) ' <<<"$out"; then
  echo >&2
  echo "No connected USB device has vendor id $VENDOR_IDS. The tablet sees:" >&2
  run_tool list >&2 || true
  die "plug the pinpad in, or pass its vendor id with --vendor-id"
fi

# Confirm from the system's own state rather than trusting the helper's output: in `dumpsys usb`
# a persistent grant is a "uid=<uid>" line followed by "is_granted=true".
persistent="$(adb_cmd shell dumpsys usb | tr -d '\r' | sed -n '/device_persistent_permissions/,$p')"
uid_entry="$(grep -A 1 "uid=$uid\$" <<<"$persistent" || true)"
has_persistent=no
case "$uid_entry" in
  *is_granted=true*) has_persistent=yes ;;
esac

if [ "$ACTION" = "grant" ]; then
  [ "$has_persistent" = yes ] || die "the system does not show a persistent permission for uid $uid after the grant"
  echo
  echo "OK: $PACKAGE (uid $uid) keeps USB access to the pinpad across reboots."
else
  [ "$has_persistent" = no ] || die "the system still shows a persistent permission for uid $uid after the revoke"
  echo
  echo "OK: persistent USB permission removed for $PACKAGE (uid $uid)."
fi
