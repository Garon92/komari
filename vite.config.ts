/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { g92Pwa } from './src/kit/pwa';

export default defineConfig({
  base: '/komari/',
  server: { port: 5176, strictPort: true },
  preview: { port: 5176, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  plugins: [
    VitePWA(g92Pwa('komari')),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
