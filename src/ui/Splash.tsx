import { useEffect, useState } from 'react';
import fallback from '../quotes.json';
import logo from '../logo.png';
import { cachedQuotes } from '../sync/sync';

/** Quanto tempo a tela de loading fica, para dar tempo de ler a frase. */
const SHOW_MS = 6000;
const FADE_MS = 600;

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? '';

/** Tela de abertura com uma frase sorteada. As frases vêm do config.json da nuvem ("frases");
 *  sem ele (ou antes da primeira sincronização), valem as de src/quotes.json. O app carrega por trás. */
export function Splash() {
  const [quote, setQuote] = useState<string | null>(null);
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show');

  useEffect(() => {
    void cachedQuotes().then(list => setQuote(pick(list.length ? list : fallback)));
    const a = setTimeout(() => setPhase('fade'), SHOW_MS);
    const b = setTimeout(() => setPhase('gone'), SHOW_MS + FADE_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className={`splash${phase === 'fade' ? ' out' : ''}`} onClick={() => setPhase('fade')} role="status">
      <img src={logo} alt="" width={72} height={72} />
      {quote && <blockquote>"{quote}"</blockquote>}
      <div className="splash-bar"><i style={{ animationDuration: `${SHOW_MS}ms` }} /></div>
    </div>
  );
}
