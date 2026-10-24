/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite answers only requests addressed to localhost unless told otherwise. A Cloudflare quick
// tunnel arrives as *.trycloudflare.com; a named tunnel as the hostname set in TUNNEL_HOSTNAME.
const tunnelHosts = ['.trycloudflare.com', ...(process.env.TUNNEL_HOSTNAME ? [process.env.TUNNEL_HOSTNAME] : [])];

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { allowedHosts: tunnelHosts },
  preview: { allowedHosts: tunnelHosts },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
