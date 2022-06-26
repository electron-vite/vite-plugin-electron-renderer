import { Plugin } from 'vite';

declare const electronRenderer: VitePluginElectronRenderer;
export default electronRenderer;

export interface Options {
  /**
   * Explicitly include some CJS modules  
   * e.g.  
   * - Nested package name: `foo/bar/baz`
   * - User's module: `./foo`
   */
  dependencies?: string[]
}

export interface VitePluginElectronRenderer {
  (options?: Options): Plugin[];
}
