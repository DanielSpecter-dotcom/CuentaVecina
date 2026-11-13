import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Sin estas variables la app compila pero se ve en blanco: mejor que el build (y el deploy en Vercel) falle con un aviso claro.
  const env = { ...loadEnv(mode, process.cwd()), ...process.env }
  const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !env[k])
  if (command === 'build' && faltan.length) {
    throw new Error(`Faltan variables de entorno: ${faltan.join(', ')} (en Vercel: Settings → Environment Variables)`)
  }
  return { plugins: [react(), tailwindcss()] }
})
