import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5175'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: 5174,
    // Bound to every interface so the app can be opened from a phone on the
    // same network. Web MIDI needs a secure context, so a phone reaching a dev
    // machine over plain http will report the API as unsupported — which the
    // UI explains rather than failing silently.
    host: true,
    proxy: {
      // Proxying in dev means the browser only ever talks to one origin, so
      // there is no preflight and no CORS surprise between dev and production.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // The sample engine pulls in the whole smplr runtime and is only needed
        // once a sampled piano is selected. Splitting it keeps first paint —
        // and the on-screen keyboard — off that download's critical path.
        manualChunks: { smplr: ['smplr'] },
      },
    },
  },
})
