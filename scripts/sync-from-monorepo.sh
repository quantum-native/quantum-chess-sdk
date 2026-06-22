#!/bin/bash
# Re-vendor the SDK source from the quantum-chess monorepo.
#
# The published package bundles its own copies of qc-core and qc-quantum
# under src/core and src/quantum, with package imports rewritten to
# relative paths. This script reproduces that vendoring deterministically
# so the SDK can be kept in sync with the engine instead of hand-copied.
#
# Usage:
#   MONO=/path/to/quantum-chess/web-native bash scripts/sync-from-monorepo.sh
#
# Files intentionally NOT vendored (node-only / aqaqaq engine, which need
# native wasm and pull node:fs/worker_threads into browser bundles):
#   - src/node.ts, src/quick-test.ts
#   - adapters/aqaqaq-*, adapters/node-uci-adapter, adapters/node-xboard-adapter
# Files preserved (hand-trimmed, do not overwrite):
#   - src/ai-loader.ts (monorepo version minus the aqaqaq branch)
#   - src/index.ts      (regenerated below from the monorepo, minus aqaqaq)
set -euo pipefail

MONO="${MONO:-/Users/chris/Developer/quantum-chess/web-native}"
PKGS="$MONO/packages"
SDK="$(cd "$(dirname "$0")/.." && pwd)"
DST="$SDK/src"

[ -d "$PKGS/qc-sdk/src" ] || { echo "monorepo not found at $PKGS"; exit 1; }

echo "Vendoring from $PKGS -> $DST"

# --- core: copy verbatim (internal imports already relative) ---
rm -rf "$DST/core"; mkdir -p "$DST/core"
cp "$PKGS/qc-core/src/"*.ts "$DST/core/"

# --- quantum: copy + wasm payload; rewrite core import to ../core ---
rm -rf "$DST/quantum"; mkdir -p "$DST/quantum/wasm"
cp "$PKGS/qc-quantum/src/"*.ts "$DST/quantum/"
cp "$PKGS/qc-quantum/src/wasm/qc-game.js" "$PKGS/qc-quantum/src/wasm/qc-game.wasm" "$DST/quantum/wasm/"
sed -i '' 's#@quantum-native/quantum-chess-core#../core#g' "$DST/quantum/"*.ts

# --- sdk top-level: copy included files (exclude node/quick-test/index/ai-loader) ---
rm -f "$DST/pooling-port.ts"
for f in "$PKGS/qc-sdk/src/"*.ts; do
  b="$(basename "$f")"
  case "$b" in
    node.ts|quick-test.ts|index.ts|ai-loader.ts) continue ;;
  esac
  cp "$f" "$DST/$b"
done
sed -i '' 's#@quantum-native/quantum-chess-core#./core#g; s#@quantum-chess/qc-quantum#./quantum#g' "$DST/"*.ts

# --- adapters: copy included only (exclude aqaqaq + node adapters) ---
rm -rf "$DST/adapters"; mkdir -p "$DST/adapters"
for f in "$PKGS/qc-sdk/src/adapters/"*.ts; do
  b="$(basename "$f")"
  case "$b" in
    aqaqaq-*|node-uci-adapter.ts|node-xboard-adapter.ts) continue ;;
  esac
  cp "$f" "$DST/adapters/$b"
done
sed -i '' 's#@quantum-native/quantum-chess-core#../core#g; s#@quantum-chess/qc-quantum#../quantum#g' "$DST/adapters/"*.ts

# --- tournament: copy verbatim + rewrite ---
rm -rf "$DST/tournament"; mkdir -p "$DST/tournament"
cp "$PKGS/qc-sdk/src/tournament/"*.ts "$DST/tournament/"
sed -i '' 's#@quantum-native/quantum-chess-core#../core#g; s#@quantum-chess/qc-quantum#../quantum#g' "$DST/tournament/"*.ts

# --- index.ts: regenerate from monorepo, drop the aqaqaq export block ---
#   removes the three "Aqaqaq adapters" export lines, then rewrites imports.
sed -e '/Aqaqaq adapters/d' \
    -e '\#export { AqaqaqLegacyAdapter } from "./adapters/aqaqaq-legacy";#d' \
    -e '\#export { AqaqaqHybridAdapter } from "./adapters/aqaqaq-hybrid";#d' \
    -e '\#export type { LegacyAIPort, AqaqaqOptions } from "./adapters/aqaqaq-legacy";#d' \
    -e 's#@quantum-native/quantum-chess-core#./core#g' \
    -e 's#@quantum-chess/qc-quantum#./quantum#g' \
    "$PKGS/qc-sdk/src/index.ts" > "$DST/index.ts"

echo "Done. ai-loader.ts left untouched (hand-trimmed)."
