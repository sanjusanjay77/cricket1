import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,

    proxy: {
      '/api': {
        target: 'https://cricket1-mvsi.onrender.com',
        changeOrigin: true,
      },

      '/socket.io': {
        target: 'https://cricket1-mvsi.onrender.com',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
