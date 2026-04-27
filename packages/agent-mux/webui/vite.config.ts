import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@a5c-ai/agent-catalog': path.resolve(rootDir, '..', '..', 'agent-catalog', 'src', 'index.ts'),
      '@a5c-ai/agent-mux-core/browser': path.resolve(rootDir, '..', 'core', 'src', 'browser.ts'),
      '@a5c-ai/agent-mux-core': path.resolve(rootDir, '..', 'core', 'src', 'index.ts'),
      '@a5c-ai/agent-mux-ui/session-flow': path.resolve(rootDir, '..', 'ui', 'src', 'session-flow.ts'),
      '@a5c-ai/agent-mux-ui': path.resolve(rootDir, '..', 'ui', 'src', 'index.ts'),
      'react-native': path.resolve(rootDir, '..', '..', '..', 'node_modules', 'react-native-web'),
      'react-native$': path.resolve(rootDir, '..', '..', '..', 'node_modules', 'react-native-web'),
      '@webui': path.join(rootDir, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 4178,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
