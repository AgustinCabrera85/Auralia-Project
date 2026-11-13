import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Dependency discovery should start from the actual applications, not HTML
  // reports and temporary browser/profiler harnesses anywhere in the workspace.
  optimizeDeps: {
    entries: ['index.html', 'world-editor.html', 'mapa-interactivo.html', 'world-preview.html', 'public/water-lab-v4.html'],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        worldPreview: fileURLToPath(new URL('./world-preview.html', import.meta.url)),
      },
    },
  },
  server: {
    watch: {
      // These folders change during tests and analysis, independently of the
      // game. In particular, Chromium profiles must never drive Vite's watcher.
      ignored: ['**/.test-build/**', '**/graphify-out/**', '**/.codex/**'],
    },
  },
});
