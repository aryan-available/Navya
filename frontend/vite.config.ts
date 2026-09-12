import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.PORT) || 3000;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@workspace/api-client-react': path.resolve(__dirname, 'src/api-client'),
    },
    dedupe: ['react', 'react-dom'],
  },

  server: {
    port,
    host: '0.0.0.0',

    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },

      '/auth': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },

      '/signal': {
        target: process.env.API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  preview: {
    port,
    host: '0.0.0.0',
  },
});