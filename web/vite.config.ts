import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = Number(process.env.BACKEND_PORT ?? 3000)

export default defineConfig({
  plugins: [react()],
  server: {
    port: backendPort > 0 ? backendPort + 1 : 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
