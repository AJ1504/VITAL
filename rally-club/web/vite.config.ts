import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  base: './',
  server: { host: true, port: 5173, fs: { allow: [repo] } },
  preview: { host: true },
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    // Two pages: the browser edition and the Unreal Pixel Streaming player.
    rollupOptions: { input: { main: fileURLToPath(new URL('index.html', import.meta.url)), stream: fileURLToPath(new URL('stream.html', import.meta.url)) } },
  },
});
