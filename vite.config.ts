import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { GOOGLE_FONTS_URL } from './src/core/themes';

const API = process.env.LUMEN_API ?? 'http://localhost:4317';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'lumen-fonts',
      transformIndexHtml: (html) => html.replace('%LUMEN_FONTS%', GOOGLE_FONTS_URL.replace(/&/g, '&amp;')),
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/media': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2500,
  },
});
