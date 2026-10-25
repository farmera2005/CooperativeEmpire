import { useCallback, useEffect, useState } from 'react';
import { Panel } from '../components/Panel';
import { fetchStatus, rememberKey, saveTunnelConfig, savedKey, startTunnel, stopTunnel, type TunnelAvailability, type TunnelStatusView } from '../tunnelClient';

const STATE_LABEL: Record<TunnelStatusView['state'], string> = { stopped: 'Not sharing', starting: 'Starting…', running: 'Sharing', error: 'Problem' };
const STATE_TONE: Record<TunnelStatusView['state'], string> = { stopped: 'bg-stone-200 text-stone-700', starting: 'bg-[#fbf3d6] text-stone-800', running: 'bg-field text-white', error: 'bg-rust text-white' };

/** App settings (D-123): sharing the game over a Cloudflare Tunnel, configured and run from here. */
export default function SettingsScreen({ onBack }: { onBack?: () => void }) {
  const [availability, setAvailability] = useState<TunnelAvailability | null>(null);
  const [st, setSt] = useState<TunnelStatusView | null>(null);
  const [mode, setMode] = useState<'quick' | 'named'>('quick');
  const [hostname, setHostname] = useState('');
  const [token, setToken] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadedForm, setLoadedForm] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetchStatus();
    setAvailability(r.availability);
    setSt(r.status);
    return r.status;
  }, []);

  useEffect(() => {
    void refresh().then((s) => {
      if (s && !loadedForm) {
        setMode(s.config.mode);
        setHostname(s.config.hostname);
        setAutoStart(s.config.autoStart);
        setLoadedForm(true);
      }
    });
  }, [refresh, loadedForm]);
  // Poll quickly while the tunnel comes up, slowly otherwise.
  useEffect(() => {
    if (availability !== 'ok') return;
    const t = setInterval(() => { void refresh(); }, st?.state === 'starting' ? 1000 : 4000);
    return () => clearInterval(t);
  }, [availability, st?.state, refresh]);

  const act = async (fn: () => Promise<TunnelStatusView>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const s = await fn();
      setSt(s);
      if (ok) setMsg({ tone: 'ok', text: ok });
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const save = () => act(async () => {
    const s = await saveTunnelConfig({ mode, hostname, autoStart, ...(token.trim() ? { token } : {}) });
    setToken('');
    return s;
  }, 'Settings saved.');
  const dirty = !!st && (mode !== st.config.mode || hostname !== st.config.hostname || autoStart !== st.config.autoStart || token.trim() !== '');
  const running = st?.state === 'running' || st?.state === 'starting';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {onBack && <div className="flex items-center justify-between"><h1 className="headline text-3xl font-bold">Settings</h1><button className="btn" onClick={onBack}>Back</button></div>}

      <Panel title="Share the game (Cloudflare Tunnel)">
        <p className="text-sm text-stone-600">
          A Cloudflare Tunnel gives the game a public web address without opening ports on your router. Each visitor plays their own game,
          and saves stay in their own browser; nothing on this computer is shared but the game itself.
        </p>

        {availability === null && <p className="mt-3 text-sm text-stone-500">Checking…</p>}
        {availability === 'remote' && (
          <p className="mt-3 rounded border border-stone-300 bg-stone-50 p-3 text-sm">Sharing is controlled from the computer running the game.</p>
        )}
        {availability === 'needKey' && (
          <form className="mt-3 space-y-2 rounded border border-stone-300 bg-stone-50 p-3 text-sm" onSubmit={async (e) => {
            e.preventDefault();
            rememberKey(keyInput.trim());
            const r = await refresh();
            if (r) { setKeyError(''); setKeyInput(''); setLoadedForm(false); }
            else { rememberKey(''); setKeyError('That key was not accepted.'); }
          }}>
            <p>You opened the game from another computer. To change sharing from here, enter the <b>sharing key</b> that the game server printed when it started
              (with Docker: <code>docker compose logs app</code>). This browser remembers it.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-80" type="password" autoComplete="off" aria-label="Sharing key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Sharing key" />
              <button className="btn btn-primary" type="submit" disabled={!keyInput.trim()}>Unlock</button>
              {keyError && <span className="text-rust">{keyError}</span>}
            </div>
          </form>
        )}
        {availability === 'unsupported' && (
          <div className="mt-3 rounded border border-stone-300 bg-stone-50 p-3 text-sm">
            <p>This copy of the game is served without sharing controls (for example the Docker image or a static web host).</p>
            <p className="mt-1">To control sharing from here, run the game with <code>npm run dev</code>, <code>npm run preview</code> or <code>npm run share</code>. With Docker, run <code>docker compose up --build</code> (the app service) and open <code>http://localhost:8080</code>.</p>
          </div>
        )}

        {availability === 'ok' && st && (
          <div className="mt-3 space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded border border-stone-300 bg-white p-3" aria-live="polite">
              <span className={`rounded px-2 py-0.5 text-sm font-semibold ${STATE_TONE[st.state]}`}>{STATE_LABEL[st.state]}</span>
              {st.state === 'running' && st.url && (
                <>
                  <a className="font-semibold text-sky underline" href={st.url} target="_blank" rel="noreferrer">{st.url}</a>
                  <button className="btn" onClick={() => { void navigator.clipboard?.writeText(st.url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy link'}</button>
                </>
              )}
              {st.state === 'running' && !st.url && <span className="text-sm">Connected. Visitors use the public hostname routed to your named tunnel.</span>}
              {st.state === 'starting' && <span className="text-sm text-stone-600">Connecting to Cloudflare; this takes a few seconds.</span>}
              {st.state === 'error' && st.error && <span className="text-sm text-rust">{st.error}</span>}
              <div className="ml-auto flex gap-2">
                <button className="btn btn-primary" disabled={busy || running || !st.cloudflared} onClick={() => act(startTunnel)}>Start sharing</button>
                <button className="btn" disabled={busy || !running} onClick={() => act(stopTunnel, 'Sharing stopped.')}>Stop sharing</button>
              </div>
            </div>

            {!st.cloudflared && (
              <div className="rounded border border-grain bg-[#fbf3d6] p-3 text-sm">
                <b>cloudflared is not installed</b> on this computer. Install it, then come back here:
                <ul className="ml-5 mt-1 list-disc">
                  <li>macOS: <code>brew install cloudflared</code></li>
                  <li>Windows: <code>winget install --id Cloudflare.cloudflared</code></li>
                  <li>Linux: Cloudflare's downloads page (packages for Debian, Red Hat and others)</li>
                </ul>
              </div>
            )}

            <fieldset className="space-y-2 text-sm" disabled={busy}>
              <legend className="mb-1 text-xs font-semibold uppercase text-stone-500">Tunnel</legend>
              <label className="flex items-start gap-2">
                <input type="radio" name="tunnel-mode" checked={mode === 'quick'} onChange={() => setMode('quick')} className="mt-1" />
                <span><b>Quick tunnel</b>: no Cloudflare account; a new random address ending in trycloudflare.com each time you start. Anyone with the link can open the game while it runs.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="tunnel-mode" checked={mode === 'named'} onChange={() => setMode('named')} className="mt-1" />
                <span><b>Named tunnel</b>: your own hostname, set up in the Cloudflare dashboard (Zero Trust › Networks › Tunnels). Route its public hostname to this server{st.localUrl ? ` (${st.localUrl})` : ''} and paste the tunnel's token below.</span>
              </label>
              {mode === 'named' && (
                <div className="ml-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label>Tunnel token
                    <input className="input mt-1 w-full" type="password" autoComplete="off" aria-label="Tunnel token" value={token} onChange={(e) => setToken(e.target.value)}
                      placeholder={st.config.tokenSet ? `Saved (${st.config.tokenHint}); paste to replace` : 'Paste the token'} />
                    <span className="text-xs text-stone-500">
                      {st.config.tokenFromEnv ? 'Using CLOUDFLARE_TUNNEL_TOKEN from the environment. ' : ''}Stored only on this computer, in .tunnel.json (not shared, not committed).
                    </span>
                    {st.config.tokenSet && !st.config.tokenFromEnv && <button className="mt-1 text-xs text-rust underline" type="button" onClick={() => act(() => saveTunnelConfig({ clearToken: true }), 'Saved token removed.')}>Remove saved token</button>}
                  </label>
                  <label>Public hostname
                    <input className="input mt-1 w-full" aria-label="Public hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="coop.example.com" />
                    <span className="text-xs text-stone-500">Shown as the shared address. Restart the game server after changing it so it accepts the new name.</span>
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} /> Start sharing whenever the game server starts
              </label>
              <div className="flex items-center gap-3">
                <button className="btn btn-primary" type="button" disabled={busy || !dirty} onClick={save}>Save settings</button>
                {running && dirty && <span className="text-xs text-stone-500">Changes apply the next time sharing starts.</span>}
                {msg && <span className={`text-sm ${msg.tone === 'err' ? 'text-rust' : 'text-field'}`}>{msg.text}</span>}
              </div>
            </fieldset>

            {savedKey() && <p className="text-xs text-stone-500">Unlocked with the sharing key. <button className="underline" type="button" onClick={() => { rememberKey(''); void refresh(); }}>Forget the key on this browser</button></p>}
            <p className="text-xs text-stone-500">
              To limit who can open a named tunnel, add a Cloudflare Access policy to its hostname. Sharing stops when the game server stops.
              {st.cloudflared ? ` ${st.cloudflared}.` : ''}
            </p>
            {st.log.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-stone-600">cloudflared log</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-stone-100 p-2">{st.log.join('\n')}</pre>
              </details>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
