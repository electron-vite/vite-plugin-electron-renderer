import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import pkg from "./package.json";

export default defineConfig({
  plugins: [
    electron({
      entry: "electron/main.ts",
      vite: {
        build: {
          rollupOptions: {
            external: Object.keys(
              "dependencies" in pkg ? pkg.dependencies : {}
            ),
          },
        },
      },
    }),
    renderer({
      // Enables use of Node.js API in the Renderer-process
      nodeIntegration: true,
      // Like Vite's pre bundling
      optimizeDeps: {
        include: [
          "sqlite3", // cjs (C++)
          "serialport", // cjs (C++)
          "electron-store", // cjs
          "execa", // esm
          "got", // esm
          "node-fetch", // esm
        ],
      },
    }),
  ],
  build: {
    minify: false,
    rollupOptions: {
      external: Object.keys("dependencies" in pkg ? pkg.dependencies : {}),
    },
  },
  optimizeDeps: {
    // If an npm package is a pure ESM format package,
    // and the packages it depends on are also in ESM format,
    // then put it in `optimizeDeps.exclude` and it will work normally.
    // exclude: ['only-support-pure-esmodule-package'],
  },
});
