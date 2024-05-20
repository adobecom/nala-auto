import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // https: {
    //   key: fs.readFileSync(path.resolve('.', 'key.pem')),
    //   cert: fs.readFileSync(path.resolve('.', 'cert.pem')),
    // },
    proxy: {
      '/api': {
        target: 'https://s3-sj3.corp.adobe.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
