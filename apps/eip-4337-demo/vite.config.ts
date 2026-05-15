import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/bundler': {
        target: 'https://aa-bundle.confluxrpc.org',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/',
      },
    },
  },
})
