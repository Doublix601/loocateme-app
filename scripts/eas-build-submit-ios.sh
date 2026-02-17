#!/usr/bin/env bash
set -euo pipefail

# Navigate to app root (loocateme-app)
cd "$(dirname "$0")/.."

echo "== LoocateMe Release iOS (EAS Build + Submit) =="

# Check npx availability
if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Please install Node.js/npm." >&2
  exit 1
fi

echo "→ Checking EAS CLI..."
npx --yes eas --version || {
  echo "EAS CLI not available. It should be available via npx. If it fails, try: npm i -D eas-cli" >&2
  exit 1
}

echo "→ Checking Expo/EAS authentication..."
if ! npx --yes eas whoami >/dev/null 2>&1; then
  echo "Not logged in to EAS. Launching interactive login..."
  # Login interactively; if user cancels, build will prompt again later
  npx eas login || true
fi

echo "→ Running expo doctor (optional)..."
npx expo-doctor || true

echo "→ Starting iOS production build with auto submit to TestFlight..."
npx eas build -p ios --profile production --auto-submit
status=$?

if [ $status -eq 0 ]; then
  echo ""
  echo "✅ Build triggered successfully. Track progress on the EAS dashboard."
  echo "   List recent builds: npx eas build:list --platform ios"
  echo "   Re-submit last build: npx eas submit -p ios --latest"
else
  echo ""
  echo "❌ Build command failed with status $status"
fi

exit $status
