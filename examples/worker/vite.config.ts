import renderer from "vite-plugin-electron-renderer";
import electron from "vite-plugin-electron";
import { defineConfig } from "vite";
import pkg from "./package.json";

export default defineConfig({
  plugins: [
    electron({
      entry: ["electron/main.ts", "electron/worker.ts"],
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
