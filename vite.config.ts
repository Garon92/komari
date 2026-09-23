/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/komari/',
  server: { port: 5176, strictPort: true },
  preview: { port: 5176, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/komari/',
        name: 'Komáři – plácni je dřív, než štípnou!',
        short_name: 'Komáři',
        description: 'Arkádová hra s plácačkou: vlny komárů, kombo, vylepšení a úspěchy.',
        lang: 'cs',
        start_url: '/komari/',
        scope: '/komari/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1b14',
        theme_color: '#4fe18c',
        categories: ['games', 'kids', 'entertainment'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/komari/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
