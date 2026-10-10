import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Chemins relatifs : le site marche quel que soit le nom du dépôt GitHub Pages
  base: './',
  worker: { format: 'es' },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lignées',
        short_name: 'Lignées',
        description: 'Suivre les sources de son arbre généalogique à partir d’un fichier GEDCOM',
        lang: 'fr',
        theme_color: '#2f5d50',
        background_color: '#f7f4ee',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // les listes de localités ne sont téléchargées que pour les pays de l'arbre, puis gardées
        runtimeCaching: [{ urlPattern: /\/geo\/[\w]+\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'lieux' } }],
      },
    }),
  ],
  test: { environment: 'node' },
})
