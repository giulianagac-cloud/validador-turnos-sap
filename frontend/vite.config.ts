import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En modo dev el front corre en 5173 y el backend en 8000.
    // Proxy para que las llamadas relativas a /api lleguen al backend.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
