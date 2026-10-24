// Share the game through a Cloudflare Tunnel: build it, serve it locally, and run cloudflared in
// front of it. Without a token it opens a quick tunnel (a random https://*.trycloudflare.com
// address, no account needed). With CLOUDFLARE_TUNNEL_TOKEN set it runs your named tunnel; route
// its public hostname to http://localhost:<port> in the Cloudflare dashboard.
//
//   npm run share                 build, serve on 4173, quick tunnel
//   npm run share -- --dev        tunnel the dev server (hot reload) on 5173 instead
//   npm run share -- --port 8090  serve on another local port
//   CLOUDFLARE_TUNNEL_TOKEN=... TUNNEL_HOSTNAME=coop.example.com npm run share

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : dev ? 5173 : 4173;
const token = process.env.CLOUDFLARE_TUNNEL_TOKEN;
const hostname = process.env.TUNNEL_HOSTNAME;
const local = `http://127.0.0.1:${port}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
/** Processes started here, stopped together on exit or failure. */
const children: ChildProcess[] = [];
let stopping = false;

if (!Number.isInteger(port) || port <= 0) fail(`Not a port: ${args[portArg + 1]}`);
const probe = spawnSync('cloudflared', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  fail([
    'cloudflared is not installed or not on PATH. Install it, then run this again:',
    '  macOS:   brew install cloudflared',
    '  Windows: winget install --id Cloudflare.cloudflared',
    '  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    'Or use Docker instead: docker compose --profile tunnel up --build',
  ].join('\n'));
}

/** Stop a child and anything it started (npx runs Vite as a grandchild). */
const end = (c: ChildProcess) => {
  if (c.exitCode !== null || c.pid === undefined) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']);
    else process.kill(-c.pid, 'SIGTERM');
  } catch {
    c.kill('SIGTERM');
  }
};
const stop = (code = 0) => {
  stopping = true;
  for (const c of children) end(c);
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (!dev) {
  console.log('Building the game…');
  const b = spawnSync(npm, ['run', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) fail('The build failed; nothing to share.');
}

const server = spawn(npx, dev ? ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'] : ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
  detached: process.platform !== 'win32',
});
children.push(server);
server.on('exit', (code) => { if (!stopping) { console.error(`The local server stopped (code ${code}).`); stop(code ?? 1); } });

await waitFor(local);
console.log(`Serving ${dev ? 'the dev server' : 'the built game'} at ${local}`);

// The token goes to cloudflared through its environment, not the command line, so it stays out of process lists.
const tunnelArgs = token ? ['tunnel', '--no-autoupdate', 'run'] : ['tunnel', '--no-autoupdate', '--url', local];
const tunnel = spawn('cloudflared', tunnelArgs, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(token ? { TUNNEL_TOKEN: token } : {}) }, detached: process.platform !== 'win32' });
children.push(tunnel);
let announced = false;
const watch = (chunk: Buffer) => {
  const text = chunk.toString();
  if (process.env.TUNNEL_VERBOSE) process.stderr.write(text);
  const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!announced && (url || (token && /Registered tunnel connection/.test(text)))) {
    announced = true;
    const where = url ?? (hostname ? `https://${hostname}` : 'the public hostname routed to this tunnel in your Cloudflare dashboard');
    console.log(['', '='.repeat(66), ` Agricultural Cooperative Tycoon is shared at:`, `   ${where}`, url ? ' (a quick tunnel: anyone with the link can open it until you stop)' : ' (your named tunnel)', ' Each visitor plays their own game; saves stay in their browser.', ' Press Ctrl+C to stop sharing.', '='.repeat(66), ''].join('\n'));
  }
  if (/failed to (?:unmarshal|validate) .*token|Unauthorized|invalid tunnel token/i.test(text)) fail('cloudflared rejected the tunnel token. Check CLOUDFLARE_TUNNEL_TOKEN.');
};
tunnel.stdout!.on('data', watch);
tunnel.stderr!.on('data', watch);
tunnel.on('exit', (code) => { if (!stopping) { console.error(`cloudflared stopped (code ${code}).`); stop(code ?? 1); } });

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  fail(`The local server did not come up at ${url}.`);
}

function fail(message: string): never {
  console.error(message);
  for (const c of children) end(c);
  process.exit(1);
}
