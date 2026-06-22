import { defineConfig } from "tsup";

// The quantum engine ships as an emscripten module: a JS loader
// (qc-game.js) plus a separate 3.2MB qc-game.wasm. The loader finds the
// wasm at runtime via `new URL('qc-game.wasm', import.meta.url)`, so the
// loader must NOT be bundled — keep it external and copy both files next
// to the built bundle so the relative URL resolves in the installed pkg.
export default defineConfig({
  entry: ["src/index.ts", "src/adapters/module-worker-runtime.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  esbuildPlugins: [
    {
      name: "external-qc-game-wasm",
      setup(build) {
        // Any import of the emscripten loader stays external (unbundled).
        build.onResolve({ filter: /qc-game\.js$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
  // Copy the engine payload next to the bundle. The bundled dynamic
  // import keeps the literal "./wasm/qc-game.js" specifier, which
  // resolves relative to the chunk that holds it (dist root).
  onSuccess:
    "mkdir -p dist/wasm && cp src/quantum/wasm/qc-game.js src/quantum/wasm/qc-game.wasm dist/wasm/",
});
