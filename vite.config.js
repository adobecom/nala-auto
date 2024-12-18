import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://s3-sj3.corp.adobe.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/nala': {
        target: 'https://nalaauto.ci.corp.adobe.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nala/, ''),
        secure: false,
      }
    }
  }
})
