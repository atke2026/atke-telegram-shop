import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080';

export default defineConfig({
  // Production mounts Suq below YeneShop's existing site. Development keeps
  // `/` unless VITE_BASE_PATH is explicitly supplied.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    // FSD layers are imported by name, never by a chain of ../../..
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@widgets': path.resolve(__dirname, 'src/widgets'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  // The API also serves /logos, so both are proxied to the same origin locally.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/logos': { target: API_TARGET, changeOrigin: true },
    },
  },
  // Mirrored for `vite preview`, which is the way to check a build on a host
  // whose inotify watcher limit is exhausted.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/logos': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
