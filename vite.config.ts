import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { ocrAssets } from './vite.plugins.ts'

export default defineConfig({
  plugins: [react(), ocrAssets()],
  // Relative asset paths: the build works from any sub-path (GitHub Pages).
  base: './',
})
