import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
  // 'web' mode is the hosted Vercel build (needs base '/' and a PWA manifest/SW).
  // Every other mode (default 'production' via electron:build, 'mobileshell', etc.)
  // keeps base './' for Electron's file:// loading — do not add the PWA plugin there,
  // a service worker has no business running inside the desktop app.
  const isWeb = mode === 'web';
  return {
    base: isWeb ? '/' : './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      isWeb && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'Hoard Lavish ERP',
          short_name: 'Hoard Lavish',
          description: 'Hoard Lavish POS & Inventory ERP',
          start_url: '/',
          display: 'standalone',
          background_color: '#f8fafc',
          theme_color: '#0f172a',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts' },
            },
          ],
        },
      }),
    ].filter(Boolean),
    // GEMINI_API_KEY is deliberately NOT defined here — services/geminiService.ts
    // is unused dead code today (nothing imports it), but inlining a secret into
    // the client bundle via `define` is a standing risk regardless: the moment
    // someone imports that module, the key ships to every browser. If the Gemini
    // features come back, they need a server-side proxy (Supabase Edge Function),
    // not a client-side API key.
    define: {
      '__APP_VERSION__': JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: './vitest.setup.ts',
    }
  };
});
