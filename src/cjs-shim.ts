import type { ResolvedConfig, Plugin } from 'vite'

export default function cjsShim(): Plugin {
  let config: ResolvedConfig
  let isCjs: boolean

  return {
    name: 'vite-plugin-electron-renderer:cjs-shim',
    apply: 'build',
    config(config) {
      // Assets are not loaded correctly under CJS, so some default build options need to be changed here
      config.build ??= {}

      // https://github.com/electron-vite/electron-vite-vue/issues/107
      config.build.cssCodeSplit ??= false

      // This ensures that static resources are loaded correctly, such as images, `worker.js`
      // BWT, the `.js` file can be loaded correctly with `<script id="shim-require-id">`
      // This causes BUG in ESN
      config.build.assetsDir ??= ''
      // TODO: compatible with custom assetsDir for static resources
    },
    configResolved(_config) {
      config = _config

      const output = config.build.rollupOptions.output
      if (output) {
        const formats = ['cjs', 'commonjs']

        // https://github.com/electron-vite/vite-plugin-electron/issues/6
        // https://github.com/electron-vite/vite-plugin-electron/commit/e6decf42164bc1e3801e27984322c41b9c2724b7#r75138942
        if (
          Array.isArray(output)
            // Once an `output.format` is CJS, it is considered as CommonJs
            ? output.find(o => formats.includes(o.format as string))
            : formats.includes(output.format as string)
        ) {
          isCjs = true
        }
      }
    },
    transformIndexHtml(html) {
      if (!isCjs) return

      const headRE = /(<\s*?head\s*?>)/
      const assetsDir = config.build.assetsDir

      if (assetsDir) {
        // ---------------------------------------- shim-require-id
        // TODO: https://github.com/electron-vite/vite-plugin-electron-renderer/blob/v0.14.1/src/index.ts#L348-L349
        const requireIdShim = `<script id="shim-require-id">
; (function () {
  if (typeof require !== 'function') return;
  var Module = require('module');
  var _resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    // "assetsDir" is always at the same level as "index.html"
    var prefix = './';
    if (request.startsWith(prefix)) {
      try {
        // TODO: The way is more elegant.
        var newRequest = request.replace(prefix, prefix + '${assetsDir + "/"}');
        return _resolveFilename.call(this, newRequest, parent, isMain, options);
      } catch (error) { }
    }
    return _resolveFilename.call(this, request, parent, isMain, options);
  };
})();
</script>`
        html = html.replace(headRE, '$1\n' + requireIdShim)
      }

      // ---------------------------------------- shim-exports
      // fix(🐞): `exports is not defined` in "use strict"
      const exportsShim = `<script id="shim-exports">var exports = typeof module !== 'undefined' ? module.exports : {};</script>`
      html = html.replace(headRE, '$1\n' + exportsShim)

      return html
    }
  }
}
