import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    preact(),
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['modules/evals/evals.html'],
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
