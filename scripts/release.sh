#!/usr/bin/env bash
# Build a signed release APK and publish it on https://coenvermeer.nl/movienight/.
#   scripts/release.sh            build + upload
#   scripts/release.sh --no-upload build only (page in dist/site/)
#   scripts/release.sh --page-only only rebuild + upload the page, with the APK built last time
# Needs: src/config.ts with real keys, MN_* signing properties in ~/.gradle/gradle.properties,
# and the Android SDK + JDK below. First bump version/versionCode in app.json and add an
# entry to release-notes.md (shown on the page) and CHANGELOG.md.
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/usr/local/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
# The default `node` on this Mac is an old v16; put the newest Node 22 from nvm first.
NODE22=$(ls -d "$HOME"/.nvm/versions/node/v22.* 2>/dev/null | sort -V | tail -1 || true)
[[ -n "$NODE22" ]] && export PATH="$NODE22/bin:$PATH"
SERVER=beheer@134.209.201.232
WEBDIR=/var/www/coenvermeer.nl/www/movienight

grep -q "YOUR_" src/config.ts && { echo "src/config.ts still has placeholder keys"; exit 1; }
grep -q "^MN_STORE_FILE=" ~/.gradle/gradle.properties 2>/dev/null || { echo "MN_* signing properties missing in ~/.gradle/gradle.properties"; exit 1; }

APK=android/app/build/outputs/apk/release/app-release.apk
# Sentry source maps are uploaded only when a token is set (export SENTRY_AUTH_TOKEN=…);
# without one the build skips the upload instead of failing.
[[ -n "${SENTRY_AUTH_TOKEN:-}" ]] || export SENTRY_DISABLE_AUTO_UPLOAD=true
if [[ "${1:-}" != "--page-only" ]]; then
  npm run imdb
  npx expo prebuild --platform android --clean --no-install
  (cd android && ./gradlew assembleRelease --console=plain -q)
fi
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$APK" | grep -m1 "SHA-256"
APK_VERSION=$("$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "$APK" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")
APP_VERSION=$(node -p "require('./app.json').expo.version")
[[ "$APK_VERSION" == "$APP_VERSION" ]] || { echo "APK is $APK_VERSION but app.json says $APP_VERSION"; exit 1; }

node scripts/site.mjs "$APK"
[[ "${1:-}" == "--no-upload" ]] && exit 0

# One SSH connection (the server rate-limits SSH): replace the folder's contents.
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C dist/site . | ssh -o BatchMode=yes "$SERVER" \
  "mkdir -p $WEBDIR && find $WEBDIR -mindepth 1 -delete && tar xzf - -C $WEBDIR && chmod -R a+rX $WEBDIR"
echo "Published: https://coenvermeer.nl/movienight/"
