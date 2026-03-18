import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Silences the Firefox "Source map error: JSON.parse" warning caused by the
// React DevTools browser extension injecting installHook.js with a
// sourceMappingURL that the dev server can't resolve.
const silenceReactDevtoolsSourceMapWarning: Plugin = {
  name: 'silence-react-devtools-source-map-warning',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req as { url?: string }).url === '/installHook.js.map') {
        res.setHeader('Content-Type', 'application/json');
        res.end('{"version":3,"sources":[],"mappings":""}');
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), silenceReactDevtoolsSourceMapWarning],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
