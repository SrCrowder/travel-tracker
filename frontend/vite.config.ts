import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'My Travel Log',
        short_name: 'Travel Log',
        description: 'Your personal digital travel diary',
        theme_color: '#4F46E5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Photos and thumbnails only: videos are streamed with Range
            // requests and would fill the cache
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/uploads/') && /\.(jpe?g|png|gif|webp|avif)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        // Keep the browser's Host so the API's same-origin (CSRF) check passes
        changeOrigin: false,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        // Keep the browser's Host so the API's same-origin (CSRF) check passes
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['framer-motion'],
          pdf: ['@react-pdf/renderer'],
        },
      },
    },
  },
});
