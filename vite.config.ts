import { defineConfig } from 'vite';

export default defineConfig({
  // Dependency discovery should start from the actual applications, not HTML
  // reports and temporary browser/profiler harnesses anywhere in the workspace.
  optimizeDeps: {
    entries: ['index.html', 'world-editor.html', 'mapa-interactivo.html', 'public/water-lab-v4.html'],
  },
  server: {
    watch: {
      // These folders change during tests and analysis, independently of the
      // game. In particular, Chromium profiles must never drive Vite's watcher.
      ignored: ['**/.test-build/**', '**/graphify-out/**', '**/.codex/**'],
    },
  },
});
