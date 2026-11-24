import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    crx({ manifest, contentScripts: { injectCss: true } }),
    react(),
  ],
  server: {
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  },
  build: {
    sourcemap: mode !== 'production',
    minify: 'esbuild',
    target: 'es2022',
    rollupOptions: {
      output: {
        sourcemapExcludeSources: false,
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  esbuild: { 
    keepNames: true,
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none',
  },
}))
