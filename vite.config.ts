import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` keeps every asset URL relative, so the same build works from
// `npm run preview`, a GitHub Pages project sub-path, or any static host.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          charts: ['recharts'],
          react: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
});
