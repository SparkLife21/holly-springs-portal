import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'))
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), githubPagesSpaFallback()],
})
