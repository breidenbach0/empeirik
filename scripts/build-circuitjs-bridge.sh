#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM_URL="https://github.com/pfalstad/circuitjs1.git"
UPSTREAM_COMMIT="c0b264e462fb8935c09b0e2a4dfa884debbde6b5"
BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/empeirik-circuitjs.XXXXXX")"
SOURCE_ROOT="$BUILD_ROOT/circuitjs1"
GRADLE_CACHE="${TMPDIR:-/tmp}/empeirik-gradle-cache"

cleanup() {
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT

if [[ -z "${EMPEIRIK_JAVA_HOME:-}" ]] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
  EMPEIRIK_JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17 2>/dev/null || true)"
fi

if [[ -z "${EMPEIRIK_JAVA_HOME:-}" ]] && [[ -n "${JAVA_HOME:-}" ]]; then
  EMPEIRIK_JAVA_HOME="$JAVA_HOME"
fi

if [[ -z "${EMPEIRIK_JAVA_HOME:-}" ]]; then
  echo "A JDK 17-21 is required. Set EMPEIRIK_JAVA_HOME to its directory." >&2
  exit 1
fi

echo "Cloning CircuitJS1 at $UPSTREAM_COMMIT"
git clone --filter=blob:none --no-checkout "$UPSTREAM_URL" "$SOURCE_ROOT"
git -C "$SOURCE_ROOT" checkout --detach "$UPSTREAM_COMMIT"

echo "Applying the empeirik native editor bridge"
cp -R "$PROJECT_ROOT/vendor/circuitjs1/src/." "$SOURCE_ROOT/src/"

echo "Compiling CircuitJS1"
JAVA_HOME="$EMPEIRIK_JAVA_HOME" \
GRADLE_USER_HOME="$GRADLE_CACHE" \
  "$SOURCE_ROOT/gradlew" -p "$SOURCE_ROOT" makeSite --no-daemon

mkdir -p "$PROJECT_ROOT/circuitjs"
if [[ -d "$PROJECT_ROOT/circuitjs/circuitjs1" ]]; then
  # GWT filenames are content hashes. Remove only obsolete generated bundles;
  # the freshly built five permutations are copied immediately below.
  find "$PROJECT_ROOT/circuitjs/circuitjs1" -maxdepth 1 -type f -name '*.cache.js' -delete
fi
cp -R "$SOURCE_ROOT/site/." "$PROJECT_ROOT/circuitjs/"

# empeirik intentionally disables CircuitJS1's offline cache so a rebuilt
# GWT bundle is visible on the next reload.
cp "$PROJECT_ROOT/vendor/circuitjs1/service-worker.js" \
  "$PROJECT_ROOT/circuitjs/service-worker.js"

echo "empeirik CircuitJS1 bridge installed in $PROJECT_ROOT/circuitjs"
