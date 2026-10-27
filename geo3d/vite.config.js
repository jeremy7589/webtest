import { defineConfig } from 'vite'

// The deployable app is written to ../surat3d (index.html + assets/), next to the data folder
// ../surat3d/data that the dev server also serves at /data. Nothing is duplicated.
export default defineConfig({
  base: './',
  publicDir: '../surat3d',
  build: {
    outDir: '../surat3d',
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: (id) => { if (id.includes('/node_modules/three/')) return 'three'; if (id.includes('/node_modules/postprocessing/') || id.includes('/node_modules/n8ao/')) return 'post'; if (id.includes('/node_modules/three-mesh-bvh/')) return 'bvh' } } },
  },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
})
