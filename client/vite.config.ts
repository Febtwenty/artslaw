import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Silences Firefox "Source map error: No sources are declared" warnings from
// React DevTools extension files and Vite pre-bundled dep source maps that
// have empty sources arrays.
const emptySourceMap = '{"version":3,"sources":[""],"sourcesContent":[""],"mappings":"","names":[]}';
const devtoolsMapPattern = /\/(installHook|react_devtools_backend_compact)\.js\.map$/;

const silenceSourceMapWarnings: Plugin = {
  name: 'silence-source-map-warnings',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req as { url?: string }).url ?? '';
      if (devtoolsMapPattern.test(url)) {
        res.setHeader('Content-Type', 'application/json');
        res.end(emptySourceMap);
        return;
      }
      next();
    });
  },
  // Suppress "No sources declared" for Vite pre-bundled dep source maps
  enforce: 'pre',
};

export default defineConfig({
  plugins: [react(), silenceSourceMapWarnings],
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
