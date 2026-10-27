import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let supabaseOrigin = null
  try {
    if (env.VITE_SUPABASE_URL) supabaseOrigin = new URL(env.VITE_SUPABASE_URL).origin
  } catch {
    // URL inválida: sin preconnect
  }

  return {
    plugins: [
      react(),
      // Preconnect al proyecto de Supabase (auth y Realtime) en cuanto se lee el HTML.
      {
        name: 'preconnect-supabase',
        transformIndexHtml: (html) =>
          supabaseOrigin ? html.replace('</head>', `  <link rel="preconnect" href="${supabaseOrigin}" crossorigin />\n  </head>`) : html,
      },
      // App instalable en el móvil. El service worker solo guarda los archivos de la propia web: Supabase y /api van
      // siempre a la red, así saldos, chat y partidas nunca salen de caché.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script', // archivo aparte: la CSP no permite scripts en línea
        manifest: {
          name: 'Juegos',
          short_name: 'Juegos',
          description: 'Casino de Juegos',
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0b0f14',
          theme_color: '#0b0f14',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          },
        },
      },
    },
    server: { port: 5174 },
  }
})
