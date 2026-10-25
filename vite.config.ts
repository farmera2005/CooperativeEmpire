/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tunnelControl } from './tools/tunnel/api.ts';
import { loadConfig } from './tools/tunnel/manager.ts';

// Vite answers only requests addressed to localhost unless told otherwise. A Cloudflare quick
// tunnel arrives as *.trycloudflare.com; a named tunnel as the hostname set in Settings or in
// TUNNEL_HOSTNAME (read when the server starts).
const named = loadConfig().hostname;
const tunnelHosts = ['.trycloudflare.com', ...(named ? [named] : [])];

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), tunnelControl()],
  server: { allowedHosts: tunnelHosts },
  preview: { allowedHosts: tunnelHosts },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
