import { useEffect, useState } from 'react';
import { checkForUpdate, currentVersion, getToken, installUpdate, setToken, REPO, UpdateError, type Release } from '../fx/updater';
import { Icon } from './Icon';
import { PanelHeader, Sheet } from './parts';

const mb = (b: number) => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';

/** Folha com as novidades do release e o botão que baixa e instala. */
export function UpdateSheet({ rel, onClose }: { rel: Release; onClose: () => void }) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    setPct(0);
    try { await installUpdate(rel, setPct); }
    catch (e) { setErr(e instanceof UpdateError ? e.message : `Não deu para atualizar: ${(e as Error).message}`); }
    finally { setPct(null); }
  };
  return (
    <Sheet title={`dQuests ${rel.version}`} onClose={onClose}
      footer={<button className="btn gold" disabled={pct !== null} onClick={go}>{pct !== null ? `Baixando ${pct}%` : `Atualizar (${mb(rel.size)})`}</button>}>
      <p className="q-meta">Publicada em {new Date(rel.date).toLocaleDateString('pt-BR')}. Seu progresso continua salvo depois de instalar.</p>
      {pct !== null && <div className="castbar"><i style={{ width: `${pct}%`, animation: 'none' }} /><span>Baixando atualização</span></div>}
      {rel.notes.trim() ? <div className="notes">{rel.notes}</div> : <p className="q-meta">Sem notas nesta versão.</p>}
      {err && <p className="err">{err}</p>}
    </Sheet>
  );
}

/** Bloco das Opções: token do GitHub e checagem manual. */
export function UpdateSettings() {
  const [version, setVersion] = useState('');
  const [token, setTok] = useState('');
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [rel, setRel] = useState<Release | null>(null);

  useEffect(() => {
    void currentVersion().then(setVersion);
    void getToken().then(t => { setTok(t); setSaved(!!t); });
  }, []);

  const check = async () => {
    setBusy(true);
    setStatus('');
    try {
      await setToken(token.trim());
      setSaved(!!token.trim());
      const r = await checkForUpdate(token.trim());
      if (r) setRel(r);
      else setStatus('Você já está na versão mais nova.');
    } catch (e) {
      setStatus(e instanceof UpdateError ? e.message : 'Algo deu errado na checagem.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <PanelHeader right={`versão ${version}`}>Atualizações</PanelHeader>
      <p className="q-meta pad">As versões novas saem nos releases do repositório privado <b>{REPO}</b>. O app usa um token seu do GitHub para enxergar esse repositório (e o do save, se a sincronização estiver ligada). Ele fica salvo só neste aparelho.</p>
      <label className="field"><span>Token do GitHub</span>
        <input id="opt-token" type="password" value={token} onChange={e => { setTok(e.target.value); setSaved(false); }} placeholder="github_pat_..." autoComplete="off" />
      </label>
      <div className="row-btns">
        <button className="btn" disabled={busy || !token.trim()} onClick={check}><Icon id="undo" size={14} /> {busy ? 'Verificando…' : 'Verificar atualização'}</button>
        {saved && <button className="btn ghost" onClick={async () => { await setToken(''); setTok(''); setSaved(false); setStatus('Token removido.'); }}>Remover token</button>}
      </div>
      {status && <p className="q-meta pad">{status}</p>}
      {rel && <UpdateSheet rel={rel} onClose={() => setRel(null)} />}
    </>
  );
}
