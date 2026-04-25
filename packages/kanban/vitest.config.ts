import { defineConfig } from 'vitest/config';
import path from 'path';

const localReact = path.resolve(__dirname, '../../node_modules/react');
const localReactDom = path.resolve(__dirname, '../../node_modules/react-dom');
const testingLibraryReact = path.resolve(
  __dirname,
  '../../node_modules/@testing-library/react/dist/@testing-library/react.esm.js',
);
const testingLibraryDom = path.resolve(
  __dirname,
  '../../node_modules/@testing-library/dom/dist/@testing-library/dom.esm.js',
);
const agentMuxCore = path.resolve(__dirname, '../agent-mux/core/src/index.ts');
const agentMuxCoreKanban = path.resolve(__dirname, '../agent-mux/core/src/kanban.ts');
const agentMuxUiSessionFlow = path.resolve(__dirname, '../agent-mux/ui/src/session-flow.ts');

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // Force vitest to transform these through its pipeline (applying aliases)
        // instead of using Node's native module resolution
        inline: [
          '@testing-library/react',
          '@testing-library/jest-dom',
          '@testing-library/user-event',
          '@testing-library/dom',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@a5c-ai/agent-mux-core/kanban': agentMuxCoreKanban,
      '@a5c-ai/agent-mux-core': agentMuxCore,
      '@a5c-ai/agent-mux-ui/session-flow': agentMuxUiSessionFlow,
      '@testing-library/react': testingLibraryReact,
      '@testing-library/dom': testingLibraryDom,
      '@': path.resolve(__dirname, './src'),
      'react': localReact,
      'react/jsx-runtime': path.join(localReact, 'jsx-runtime'),
      'react/jsx-dev-runtime': path.join(localReact, 'jsx-dev-runtime'),
      'react-dom': localReactDom,
      'react-dom/client': path.join(localReactDom, 'client'),
      'react-dom/test-utils': path.join(localReactDom, 'test-utils'),
    },
  },
});
