import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Spiegelt im Dev-Server den nginx-Reverse-Proxy aus der Produktion: das Frontend ruft
    // immer relative "/api"-Pfade auf (API_BASE = ''), damit es sowohl lokal als auch hinter
    // einem Reverse-Proxy/CDN (z.B. Synology NAS, ipv64.net CloudRouter) ohne separat
    // freizugebenden Backend-Port funktioniert.
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true
      }
    }
  }
})
