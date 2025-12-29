import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],

    // ✅ Cloudflare Pages 필수
    base: '/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // ✅ admin.html + index.html 둘 다 빌드
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
        },
      },
    },
  }
})
