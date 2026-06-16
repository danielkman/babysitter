/**
 * Library build (Phase 2): emits a self-contained React component bundle that
 * kradle/web consumes as a PREBUILT artifact (dist-lib/commander.mjs +
 * dist-lib/commander.css). React is EXTERNAL — the host owns the single React
 * instance; we never bundle a second copy.
 *
 * The standalone app build (`vite.config.ts` → `npm run build`/`npm run dev`)
 * is untouched.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    lib: {
      entry: 'src/lib.tsx',
      formats: ['es'],
      fileName: () => 'commander.mjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'commander.css';
          return assetInfo.name ?? 'asset-[hash][extname]';
        },
      },
    },
    outDir: 'dist-lib',
    cssCodeSplit: false,
    emptyOutDir: true,
  },
});
