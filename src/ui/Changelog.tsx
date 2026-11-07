import { useEffect, useState } from 'react';
import { Preferences } from '../storage';
import changelog from '../changelog.json';
import { currentVersion, isNewer } from '../fx/updater';
import { Sheet } from './parts';

interface Entry { version: string; date: string; title: string; items: string[] }
const ENTRIES = changelog as Entry[];
const SEEN_KEY = 'changelog-seen';

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');

function EntryView({ e, current }: { e: Entry; current: boolean }) {
  return (
    <article className="cl-entry">
      <header>
        <b>Versão {e.version}</b>
        {current && <span className="cl-tag">instalada</span>}
        <small>{fmtDate(e.date)}</small>
      </header>
      <h3>{e.title}</h3>
      <ul>{e.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </article>
  );
}

/** Histórico completo de versões. */
export function ChangelogSheet({ onClose, only }: { onClose: () => void; only?: string[] }) {
  const [version, setVersion] = useState('');
  useEffect(() => { void currentVersion().then(setVersion); }, []);
  const list = only ? ENTRIES.filter(e => only.includes(e.version)) : ENTRIES;
  return (
    <Sheet title={only ? 'Novidades' : 'Histórico de versões'} onClose={onClose}
      footer={only ? <button className="btn gold" onClick={onClose}>Continuar a jornada</button> : undefined}>
      {list.map(e => <EntryView key={e.version} e={e} current={e.version === version} />)}
    </Sheet>
  );
}

/** Depois de atualizar, mostra uma vez o que mudou desde a última versão vista. */
export function WhatsNew() {
  const [show, setShow] = useState<string[] | null>(null);
  useEffect(() => {
    void (async () => {
      const cur = await currentVersion();
      const seen = (await Preferences.get({ key: SEEN_KEY })).value;
      await Preferences.set({ key: SEEN_KEY, value: cur });
      if (seen === cur) return;
      const fresh = ENTRIES.filter(e => !isNewer(e.version, cur) && (!seen || isNewer(e.version, seen)));
      // Primeira abertura sem registro: mostra só a versão atual
      const pick = seen ? fresh : fresh.filter(e => e.version === cur);
      if (pick.length) setShow(pick.map(e => e.version));
    })();
  }, []);
  if (!show) return null;
  return <ChangelogSheet only={show} onClose={() => setShow(null)} />;
}
