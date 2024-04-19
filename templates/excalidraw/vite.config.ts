import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Excalidraw + Triplit',
        short_name: 'Excalidraw + Triplit',
        icons: [
          {
            src: '/excalidraw-x-triplit-logo.png',
            type: 'image/png',
            sizes: '256x256',
          },
        ],
      },
      devOptions: { enabled: true },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      includeAssets: ['**/*'],
    }),
  ],
});
