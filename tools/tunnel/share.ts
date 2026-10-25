// Share the game through a Cloudflare Tunnel from the terminal (D-122, D-123): build it, serve it
// with Vite, and start the tunnel set up in Settings — a quick tunnel (random
// https://*.trycloudflare.com address, no account) unless a named tunnel is configured there or
// CLOUDFLARE_TUNNEL_TOKEN is set. The same server keeps the admin menu's controls working.
//
//   npm run share                 build, serve on 4173, start the tunnel
//   npm run share -- --dev        share the dev server (hot reload) on 5173 instead
//   npm run share -- --port 8090  serve on another local port

import { spawnSync } from 'node:child_process';
import { createServer, preview } from 'vite';
import { adminPasswordIsTemporary } from '../accounts/store.ts';
import { announceWhenUp, firstSignInNote } from './api.ts';
import { cloudflaredVersion, loadConfig, saveConfig, start, status } from './manager.ts';

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : dev ? 5173 : 4173;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!Number.isInteger(port) || port <= 0) fail(`Not a port: ${args[portArg + 1]}`);
if (!cloudflaredVersion()) {
  fail([
    'cloudflared is not installed or not on PATH. Install it, then run this again:',
    '  macOS:   brew install cloudflared',
    '  Windows: winget install --id Cloudflare.cloudflared',
    '  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    'Or use Docker instead: docker compose --profile tunnel up --build',
  ].join('\n'));
}
// A token in the environment means a named tunnel, as before Settings existed.
if (process.env.CLOUDFLARE_TUNNEL_TOKEN && loadConfig().mode !== 'named' && !loadConfig().token) saveConfig({ mode: 'named' });

if (!dev) {
  console.log('Building the game…');
  const b = spawnSync(npm, ['run', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) fail('The build failed; nothing to share.');
}

const opts = { host: '127.0.0.1', port, strictPort: true };
const server = dev ? await createServer({ server: opts }) : await preview({ preview: opts });
if (dev) await (server as Awaited<ReturnType<typeof createServer>>).listen();
const local = `http://127.0.0.1:${port}`;
console.log(`Serving ${dev ? 'the dev server' : 'the built game'} at ${local} (sign in as an admin for the admin menu).`);
// A login page with a temporary password is not put on the internet (D-127).
if (await adminPasswordIsTemporary()) {
  console.log(firstSignInNote(port));
  console.log('Then start sharing from the admin menu (Sharing tab).');
} else {
  if (status().state !== 'running' && status().state !== 'starting') start(local);
  announceWhenUp((url) => { if (!url && status().state === 'error') process.exitCode = 1; });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
