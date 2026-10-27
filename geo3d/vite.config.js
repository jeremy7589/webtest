import { defineConfig } from 'vite'

// Built app lives in ./dist and loads its data from ../public/data at runtime (see src/config.js),
// so the ~15 MB of model assets are committed once and served by any static host.
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    copyPublicDir: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: (id) => { if (id.includes('node_modules/three/')) return 'three'; if (id.includes('postprocessing') || id.includes('n8ao')) return 'post'; if (id.includes('three-mesh-bvh')) return 'bvh' } } },
  },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
})
