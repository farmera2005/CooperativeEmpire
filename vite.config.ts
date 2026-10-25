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
// ALLOWED_HOSTS adds names the game is opened by on your network (comma-separated), or `all`
// (the Docker app service) to accept any. Safe for the sharing controls, which never rely on the
// Host header alone (D-126).
const extra = (process.env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
const tunnelHosts: string[] | true = extra.includes('all') ? true : ['.trycloudflare.com', ...(named ? [named] : []), ...extra];

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
