const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

/**
 * @type {import('.').UseNodeJs}
 */
module.exports = function useNodeJs(options = {}) {
  const builtins = [];
  const dependencies = [];
  const ESM_deps = [];
  const CJS_modules = []; // builtins + dependencies
  const moduleCache = new Map();

  return {
    name: 'vite-plugin-electron-renderer:use-node.js',
    // Bypassing Vite's builtin 'vite:resolve' plugin
    enforce: 'pre',
    // 🚧 Must be use config hook
    config(config, env) {
      if (env.command === 'serve') {
        // Vite ---- resolve.alias ----
        if (!config.resolve) config.resolve = {};

        // TODO: Compatible ESM module
        // If the package is ESM module, like node-fetch
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

      } else if (env.command === 'build') {

        // Rollup ---- init ----
        if (!config.build) config.build = {};
        if (!config.build.rollupOptions) config.build.rollupOptions = {};
        if (!config.build.rollupOptions.output) config.build.rollupOptions.output = {};

        // Rollup ---- external ----
        let external = config.build.rollupOptions.external;
        const electronBuiltins = CJS_modules.concat('electron');
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
      }
    },
    configResolved(config) {
      const resolved = resolveModules(config, options);
      builtins.push(...resolved.builtins);
      dependencies.push(...resolved.dependencies);
      ESM_deps.push(...resolved.ESM_deps);
      CJS_modules.push(...builtins.concat(dependencies));
    },
    resolveId(source) {
      // TODO: Identify ESM

      const id = source.replace('node:', '');
      if (CJS_modules.includes(id)) return id;
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

      if (CJS_modules.includes(id)) {
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
  };
};

/**
 * @type {(config: import('vite').ResolvedConfig, options: import('.').Options) => { builtins: string[]; dependencies: string[]; ESM_deps: string[]; }}
 */
function resolveModules(config, options) {
  const root = config.root;
  const cwd = process.cwd();
  const builtins = builtinModules.filter(e => !e.startsWith('_')); builtins.push(...builtins.map(m => [m, `node:${m}`]));
  // dependencies of package.json
  let dependencies = [];
  // dependencies(ESM) of package.json
  const ESM_deps = [];

  // Resolve package.json dependencies
  const pkgId = lookupFile('package.json', [root, cwd])
  if (pkgId) {
    const pkg = require(pkgId);
    for (const package of Object.keys(pkg.dependencies || {})) {
      const _pkgId = lookupFile(
        'package.json',
        [root, cwd].map(r => `${r}/node_modules/${package}`),
      );
      if (_pkgId) {
        const _pkg = require(_pkgId);
        if (_pkg.type === 'module') {
          ESM_deps.push(package);
          continue;
        }
      }

      // TODO: Nested package name, but you can explicity include it by `options.resolve`
      dependencies.push(package);
    }
  }

  if (options.resolve) {
    const tmp = options.resolve(dependencies);
    if (tmp) dependencies = tmp;
  }

  return {
    builtins,
    dependencies,
    ESM_deps,
  };
}

function lookupFile(filename, paths) {
  for (const p of paths) {
    const filepath = path.join(p, filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }
}
