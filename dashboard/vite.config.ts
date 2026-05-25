import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4321,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4320',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 4321,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
