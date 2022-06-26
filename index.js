const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

/**
 * @type {import('.').VitePluginElectronRenderer}
 */
module.exports = function renderer(options = {}) {
  const name = 'vite-plugin-electron-renderer';
  const builtins = builtinModules.filter(e => !e.startsWith('_'));
  // dependencies of package.json
  const dependencies = options.dependencies || [];
  const moduleCache = new Map();
  /**
   * @type {import('vite').ResolvedConfig}
   */
  let config;

  return [
    {
      name: `${name}:node.js`,
      enforce: 'pre',
      configResolved(config) {
        // Resolve package.json dependencies
        const pkgId = path.join(config.root, 'package.json');
        if (fs.existsSync(pkgId)) {
          const pkg = require(pkgId);
          // TODO: Nested package name
          dependencies.push(...Object.keys(pkg.dependencies || {}));
        }
      },
      resolveId(source) {
        const id = source.replace('node:', '');
        const modules = builtins.concat(dependencies);
        if (modules.includes(id)) return id;
      },
      load(id) {
        /**
         * ## 🎯 Using Node.js package in Electron-Renderer
         * 
         * Many times, many people want to use the Node.js package in Electron-Renderer, but it may not work correctly in Vite by default.  
         * 有很多时候很多人想在 Electron-Renderer 中使用 Node.js 模块，但这在 Vite 可能无法正常的构建。  
         * 
         * e.g.  
         *   Let's use `serialport` as an example.  
         *   让我们使用 `serialport` 举个例子 🌰。  
         * 
         * ```js
         * // ❌ May not work correctly in Vite by default.
         * import serialport, { SerialPort, SerialPortMock } from 'serialport';
         * ```
         * 
         * At this time, we need to use load-hook to convert `serialport` to ensure that it works normally.  
         * 这时候我们需要使用 load-hook 转换 `serialport`，以确保它能正常工作。  
         * 
         * e.g.
         * 
         * ```js
         * // serialport
         * const _M_ = require('serialport');
         * const _D_ = _M_.default || _M_;
         * export { _D_ as default };
         * export const SerialPort = _M_.SerialPort;
         * export const SerialPortMock = _M_.SerialPortMock;
         * ```
         * 
         * Try to use again.
         * 
         * ```js
         * // ✅ This looks like nothing has changed, but it works normally after the load-hook converted.
         * import serialport, { SerialPort, SerialPortMock } from 'serialport';
         * ```
         * 
         * 🚧 It should be noted that the Node.js package, as a dependency of the project, should be placed in `dependencies`; Unless you konw how to build them with Vite.  
         * 需要注意的一点是，Node.js 模块作为项目的依赖，应该放到 `dependencies` 中；除非你知道如何使用 Vite 构建他们。  
         */

        const modules = builtins.concat(dependencies);
        if (modules.includes(id)) {
          const cache = moduleCache.get(id);
          if (cache) return cache;

          const nodeModule = require(id);
          const requireModule = `const _M_ = require("${id}");`;
          const exportDefault = `const _D_ = _M_.default || _M_;\nexport { _D_ as default };`;
          const exportMembers = Object
            .keys(nodeModule)
            .filter(n => n !== 'default')
            .map(attr => `export const ${attr} = _M_.${attr};`).join('\n')
          const nodeModuleCodeSnippet = `
${requireModule}
${exportDefault}
${exportMembers}
`.trim();

          moduleCache.set(id, nodeModuleCodeSnippet);
          return nodeModuleCodeSnippet;
        }
      },
    },
    {
      name: `${name}:serve`,
      apply: 'serve',
      // 🚧 Must be use config hook
      config(config) {
        // Vite ---- resolve.alias ----
        if (!config.resolve) config.resolve = {};

        // TODO: Compatible ESM module
        // If the package is ESM module, like node-fetch, execa
        if (!config.resolve.conditions) config.resolve.conditions = ['node'];

        if (!config.resolve.alias) config.resolve.alias = [];
        const electronjs = path.join(__dirname, 'electron-renderer.js');
        if (Array.isArray(config.resolve.alias)) {
          config.resolve.alias.push({ find: 'electron', replacement: electronjs });
        } else {
          config.resolve.alias['electron'] = electronjs;
        }

        // Vite ---- optimizeDeps.exclude ----
        if (!config.optimizeDeps) config.optimizeDeps = {};
        if (!config.optimizeDeps.exclude) config.optimizeDeps.exclude = [];

        config.optimizeDeps.exclude.push('electron');
      },
    },
    {
      name: `${name}:build`,
      apply: 'build',
      config(config) {
        // make sure that Electron can be loaded into the local file using `loadFile` after packaging
        if (!config.base) config.base = './';

        if (!config.build) config.build = {};
        // TODO: Init `config.build.target`

        // ensure that static resources are loaded normally
        if (config.build.assetsDir === undefined) config.build.assetsDir = '';
        // https://github.com/electron-vite/electron-vite-vue/issues/107
        if (config.build.cssCodeSplit === undefined) config.build.cssCodeSplit = false;

        // Rollup ---- init ----
        if (!config.build.rollupOptions) config.build.rollupOptions = {};
        if (!config.build.rollupOptions.output) config.build.rollupOptions.output = {};

        // Rollup ---- external ----
        let external = config.build.rollupOptions.external;
        const electronBuiltins = builtins.map(e => [e, `node:${e}`]).flat()
          .concat('electron')
          .concat(dependencies);
        if (
          Array.isArray(external) ||
          typeof external === 'string' ||
          external instanceof RegExp
        ) {
          external = electronBuiltins.concat(external);
        } else if (typeof external === 'function') {
          const original = external;
          external = function (source, importer, isResolved) {
            if (electronBuiltins.includes(source)) {
              return true;
            }
            return original(source, importer, isResolved);
          };
        } else {
          external = electronBuiltins;
        }

        // make builtin modules & electron external when rollup
        config.build.rollupOptions.external = external;

        // Rollup ---- output.format ----
        const output = config.build.rollupOptions.output;
        if (Array.isArray(output)) {
          for (const o of output) {
            if (o.format === undefined) o.format = 'cjs';
          }
        } else {
          // external modules such as `electron`, `fs`
          // they can only be loaded normally under CommonJs
          if (output.format === undefined) output.format = 'cjs';
        }
      },
    },
    {
      name: `${name}:polyfill-exports`,
      configResolved(_config) {
        config = _config;
      },
      transformIndexHtml(html) {
        const output = config.build.rollupOptions.output;
        if (!output) return;

        const formats = ['cjs', 'commonjs'];

        // https://github.com/electron-vite/vite-plugin-electron/issues/6
        // https://github.com/electron-vite/vite-plugin-electron/commit/e6decf42164bc1e3801e27984322c41b9c2724b7#r75138942
        if (
          Array.isArray(output)
            // Once an `output.format` is CJS, it is considered as CommonJs
            ? output.find(o => formats.includes(o.format))
            : formats.includes(output.format)
        ) {
          // fix(🐞): exports is not defined
          const polyfill = `<script>var exports = typeof module !== 'undefined' ? module.exports : {};</script>`;
          return html.replace(/(<\/[\s]*?head[\s]*?>)/, polyfill + '\n$1');
        }
      },
    },
  ];
};
