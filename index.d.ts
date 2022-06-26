import { Plugin } from 'vite';

declare const electronRenderer: VitePluginElectronRenderer;
export default electronRenderer;

export interface Options {
  /**
   * Explicitly include/exclude some CJS modules  
   * `modules` includes `dependencies` of package.json, Node.js's `builtinModules` and `electron`  
   */
  resolve?: (modules: string[]) => typeof modules | undefined
}

export interface VitePluginElectronRenderer {
  (options?: Options): Plugin[];
}
