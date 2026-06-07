import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/static/notebook/dist/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/notebook.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/notebook.[ext]',
      }
    }
  }
})
