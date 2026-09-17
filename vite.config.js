import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['nala-auto.corp.adobe.com'],
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
      },
      // Run-console backend: dispatch + live-track the screenshot-diff workflow.
      '/lab': {
        target: `http://localhost:${process.env.LAB_PORT || 4000}`,
        changeOrigin: true,
        ws: true,
      }
    }
  }
})
