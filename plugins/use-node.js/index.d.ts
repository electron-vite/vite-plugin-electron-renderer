import { Plugin } from 'vite';

declare const useNodeJs: UseNodeJs;
export default useNodeJs;

export interface Options {
  /**
   * Explicitly include/exclude some CJS modules  
   * `modules` includes `dependencies` of package.json, Node.js's `builtinModules` and `electron`  
   */
  resolve?: (modules: string[]) => typeof modules | undefined
}

export interface UseNodeJs {
  (options?: Options): Plugin;
}
