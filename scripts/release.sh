#!/usr/bin/env bash
# Build a signed release APK and publish it on https://coenvermeer.nl/movienight/.
#   scripts/release.sh            build + upload
#   scripts/release.sh --no-upload build only (page in dist/site/)
# Needs: src/config.ts with real keys, MN_* signing properties in ~/.gradle/gradle.properties,
# and the Android SDK + JDK below. First bump version/versionCode in app.json and add an
# entry to release-notes.md (shown on the page) and CHANGELOG.md.
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/usr/local/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
SERVER=beheer@134.209.201.232
WEBDIR=/var/www/coenvermeer.nl/www/movienight

grep -q "YOUR_" src/config.ts && { echo "src/config.ts still has placeholder keys"; exit 1; }
grep -q "^MN_STORE_FILE=" ~/.gradle/gradle.properties 2>/dev/null || { echo "MN_* signing properties missing in ~/.gradle/gradle.properties"; exit 1; }

npm run imdb
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease --console=plain -q)
APK=android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$APK" | grep -m1 "SHA-256"

node scripts/site.mjs "$APK"
[[ "${1:-}" == "--no-upload" ]] && exit 0

# One SSH connection (the server rate-limits SSH): replace the folder's contents.
tar czf - -C dist/site . | ssh -o BatchMode=yes "$SERVER" \
  "mkdir -p $WEBDIR && find $WEBDIR -mindepth 1 -delete && tar xzf - -C $WEBDIR && chmod -R a+rX $WEBDIR"
echo "Published: https://coenvermeer.nl/movienight/"
