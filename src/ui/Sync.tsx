import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { resolveChoice, setSyncEnabled, syncNow, useSync, SAVE_REPO } from '../sync/sync';
import { Icon } from './Icon';
import { PanelHeader, Sheet } from './parts';

function ago(at: number | null) {
  if (!at) return 'nunca';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'agora há pouco';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return new Date(at).toLocaleDateString('pt-BR');
}

/** Bloco das Opções. */
export function SyncSettings() {
  const { phase, at, error } = useSync();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);
  const on = phase !== 'off';

  return (
    <>
      <PanelHeader right={on ? (phase === 'syncing' ? 'sincronizando…' : `última: ${ago(at)}`) : 'desligada'}>Sincronização</PanelHeader>
      <p className="q-meta pad">Mantém o celular e o PC com o mesmo save, guardado no repositório privado <b>{SAVE_REPO}</b>. Usa o mesmo token das atualizações, que precisa de permissão de escrita nesse repositório.</p>
      <label className="toggle"><input id="opt-sync" type="checkbox" checked={on} onChange={e => void setSyncEnabled(e.target.checked)} /> Sincronizar este aparelho</label>
      {on && <button className="btn" disabled={phase === 'syncing'} onClick={() => void syncNow()}><Icon id="undo" size={14} /> Sincronizar agora</button>}
      {phase === 'error' && <p className="err">{error}</p>}
    </>
  );
}

/** Primeira sincronização com herói nos dois lados: o jogador escolhe qual save fica. */
export function SyncChoice() {
  const choice = useSync(s => s.choice);
  const hero = useGame(s => s.hero);
  const level = useGame(s => s.level);
  const [busy, setBusy] = useState(false);
  if (!choice) return null;
  const pick = async (use: 'remote' | 'local') => { setBusy(true); try { await resolveChoice(use); } finally { setBusy(false); } };
  return (
    <Sheet title="Qual save fica?" onClose={() => useSync.setState({ choice: null, phase: 'idle' })}>
      <p>Já existe um save na nuvem, e este aparelho também tem um. Escolha qual vale daqui pra frente. O outro é substituído.</p>
      <div className="choice-grid">
        <button className="choice" disabled={busy} onClick={() => pick('remote')}>
          <small>Nuvem</small><b>{choice.name}</b><span>Nível {choice.level}</span>
          <em>{choice.rev ? `salvo em ${new Date(choice.rev).toLocaleString('pt-BR')}` : ''}</em>
        </button>
        <button className="choice" disabled={busy} onClick={() => pick('local')}>
          <small>Este aparelho</small><b>{hero.name}</b><span>Nível {level}</span>
          <em>substitui o da nuvem</em>
        </button>
      </div>
      <p className="q-meta">O histórico do repositório guarda as versões antigas, então dá pra recuperar se escolher errado.</p>
    </Sheet>
  );
}

/** Ícone de nuvem no topo com o estado da sincronização. */
export function SyncBadge({ onClick }: { onClick: () => void }) {
  const phase = useSync(s => s.phase);
  if (phase === 'off') return null;
  const label = { idle: 'Sincronização ligada', syncing: 'Sincronizando', ok: 'Sincronizado', error: 'Erro na sincronização' }[phase];
  return (
    <button className={`icon-btn sync-badge ${phase}`} onClick={onClick} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M6.5 19A4.5 4.5 0 0 1 6 10a6 6 0 0 1 11.6-1.6A5 5 0 0 1 17.5 19z" /></svg>
    </button>
  );
}
