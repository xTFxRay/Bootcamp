import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Send any /api request from the webpage to the Express server.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
