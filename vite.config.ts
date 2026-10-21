import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

const PAGES_IMPRESSION = ['print', 'print+fr-be', 'print+en-gb', 'print+nl-be']

export default defineConfig({
  // Chemins relatifs : le site marche quel que soit le nom du dépôt GitHub Pages
  base: './',
  worker: { format: 'es' },
  // pages d'entrée : le site, /print/ (l'impression seule, dans la langue du navigateur) et une page par langue (scripts/pages-print.mjs)
  build: { rollupOptions: { input: Object.fromEntries(PAGES_IMPRESSION.map((d) => [d, resolve(__dirname, d, 'index.html')]).concat([['main', resolve(__dirname, 'index.html')]])) } },
  plugins: [
    preact(),
    // les pages d'impression sont un cran plus bas : le manifeste ajouté par le plugin PWA doit remonter d'un dossier
    {
      name: 'manifeste-print',
      apply: 'build',
      enforce: 'post',
      closeBundle: { order: 'post', sequential: true, handler() {
        for (const d of PAGES_IMPRESSION) {
          const f = resolve(__dirname, 'dist', d, 'index.html')
          if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace('"./manifest.webmanifest"', '"../manifest.webmanifest"'))
        }
      } },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Lignées',
        short_name: 'Lignées',
        description: 'Suivre les sources de son arbre généalogique à partir d’un fichier GEDCOM',
        lang: 'fr',
        theme_color: '#1f379f',
        background_color: '#f6f7f9',
        display: 'standalone',
        id: './',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // les images de partage ne servent qu'aux réseaux sociaux
        globIgnores: ['partage-print-*.png'],
        // les listes de localités ne sont téléchargées que pour les pays de l'arbre, puis gardées
        runtimeCaching: [
          { urlPattern: /\/geo\/[\w]+\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'lieux' } },
          // les événements historiques, seulement si on les demande dans le récit
          { urlPattern: /\/evenements\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'evenements' } },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
