import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Sin estas variables la app compila pero se ve en blanco: mejor que el build (y el deploy en Vercel) falle con un aviso claro.
  const env = { ...loadEnv(mode, process.cwd()), ...process.env }
  const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !env[k])
  if (command === 'build' && faltan.length) {
    throw new Error(`Faltan variables de entorno: ${faltan.join(', ')} (en Vercel: Settings → Environment Variables)`)
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      // PWA: instalable en el celular, abre sin internet y recibe notificaciones push.
      VitePWA({
        strategies: 'injectManifest', // service worker propio (src/sw/sw.ts) para manejar push
        srcDir: 'src/sw',
        filename: 'sw.ts',
        registerType: 'prompt', // la app avisa "hay una nueva versión" en vez de recargar sola
        injectRegister: false, // lo registra components/Pwa.tsx
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
        devOptions: { enabled: false },
        manifest: {
          name: 'CuentaVecina — el cuaderno de fiados, digital',
          short_name: 'CuentaVecina',
          description: 'Cuentas corrientes y ventas al crédito para bodegas y comercios de barrio.',
          lang: 'es-PE',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#1e2a45',
          background_color: '#fbfaf6',
          categories: ['finance', 'business'],
          icons: [
            { src: '/icons/icono-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  }
})
