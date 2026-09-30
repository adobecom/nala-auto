import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = ['nala-auto.corp.adobe.com']

// Shared by `vite` (dev) and `vite preview` (production build). Vite reads
// `server.proxy` and `preview.proxy` from separate config keys, so serving the
// built app would silently lose every proxy unless both get the same object.
const proxy = {
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
  // Run-console backend: dispatch + live-track the screenshot-diff workflow,
  // and serve the downscaled sidebar thumbnails (/lab/thumb).
  '/lab': {
    target: `http://localhost:${process.env.LAB_PORT || 4000}`,
    changeOrigin: true,
    ws: true,
  }
}

export default defineConfig({
  // Absolute, not './': the app uses BrowserRouter, so a deep link like
  // /imagediff/bacom would resolve relative asset URLs against /imagediff/
  // and 404. The site is served from the domain root.
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      // React and the router are on every page; keeping them in one chunk lets
      // the browser reuse them across route-level lazy chunks.
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  server: { allowedHosts, proxy },
  preview: { allowedHosts, proxy },
})

