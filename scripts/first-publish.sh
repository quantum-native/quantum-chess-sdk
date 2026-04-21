#!/bin/bash
# First-time publish to npm. Run once with a temporary token.
# After this, set up trusted publishing via GitHub Actions.
#
# Usage:
#   NPM_TOKEN=npm_xxxxx bash scripts/first-publish.sh
#
set -euo pipefail

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "Set NPM_TOKEN first: NPM_TOKEN=npm_xxxxx bash scripts/first-publish.sh"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Building..."
npm run build

echo "Publishing @quantum-native/quantum-chess-sdk to npm..."
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc.publish
npm publish --access public --registry https://registry.npmjs.org --userconfig .npmrc.publish
rm -f .npmrc.publish

echo "Done! Now set up trusted publishing:"
echo "  1. Go to https://www.npmjs.com/package/@quantum-native/quantum-chess-sdk/access"
echo "  2. Add GitHub Actions as a trusted publisher"
echo "  3. Repository: quantum-native/quantum-chess-sdk"
echo "  4. Workflow: publish.yml"
echo "  5. Environment: (leave blank)"
