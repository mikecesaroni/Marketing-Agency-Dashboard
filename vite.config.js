import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Two shells for the one app. client.html is what a client's link
      // serves (netlify.toml routes the six client paths to it): no web app
      // manifest, so "Add to Home Screen" saves the page itself and not the
      // CRM's start page. See docs/client-dashboards.md.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        client: resolve(import.meta.dirname, 'client.html'),
      },
    },
  },
})
