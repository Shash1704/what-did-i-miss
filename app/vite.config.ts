import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the static build works on GitHub Pages under /<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
})
