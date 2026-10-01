import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Where the two packages actually are: inside node_modules when installed,
 * and a checkout elsewhere on the disk when linked for working on both at
 * once. The dev server has to be allowed to serve from there, and its
 * watcher told not to ignore them.
 */
const at = (pkg: string) => dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`));
const packages = ['artshape-render', 'artshape-physics'];

export default defineConfig({
  server: {
    port: 5202,
    strictPort: true,
    watch: { ignored: packages.map((p) => `!**/node_modules/${p}/**`) },
    fs: { allow: ['.', ...packages.map(at)] },
  },
  optimizeDeps: { exclude: packages },
});
