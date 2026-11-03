import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.LUMEN_API ?? 'http://localhost:4317';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/assets': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
