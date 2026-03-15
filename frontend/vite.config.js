import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When BACKEND_URL is set, proxy API and WebSocket calls to the remote backend
// (e.g. Cloud Run) instead of localhost.
//
// Local dev against localhost:  npm run dev
// Local dev against Cloud Run:  BACKEND_URL=https://your-service.run.app npm run dev

export default defineConfig(() => {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  const isRemote = backendUrl.startsWith('https');
  const wsTarget = backendUrl.replace(/^http/, isRemote ? 'wss' : 'ws');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: isRemote,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          secure: isRemote,
        },
      },
    },
  };
});
