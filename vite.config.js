import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Production build: no console output, so nothing about users or errors shows in the browser console
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Keep Firebase in its own chunk so the app shell loads faster
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] },
      },
    },
  },
}));
