import { useEffect, useRef, useState } from 'react';
import { fmt } from '../game/rules';
import { onFx } from '../fx/bus';

type Pop = { id: number; amount: number; rested: number; crit: boolean };
let pid = 0;

/**
 * Barra de XP no estilo do WoW: o ganho enche primeiro em roxo escuro,
 * depois o roxo claro alcança, e o "+XP" sobe acima da barra.
 */
export function XpBar({ level, pct, restPct }: { level: number; pct: number; restPct: number }) {
  const [gain, setGain] = useState(pct); // camada escura (na frente do ganho)
  const [fill, setFill] = useState(pct); // camada clara (alcança depois)
  const [instant, setInstant] = useState(false);
  const [glow, setGlow] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const prev = useRef({ level, pct });

  useEffect(() => {
    const p = prev.current;
    prev.current = { level, pct };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, f: () => void) => { timers.push(setTimeout(f, ms)); };
    setInstant(false);
    if (level > p.level) {
      // subiu de nível: enche até o fim, zera e enche o que sobrou
      setGain(100); setGlow(g => g + 1);
      later(500, () => setFill(100));
      later(1300, () => { setInstant(true); setGain(0); setFill(0); });
      later(1360, () => { setInstant(false); setGain(pct); });
      later(1860, () => setFill(pct));
    } else if (level === p.level && pct > p.pct) {
      setGain(pct); setGlow(g => g + 1);
      later(550, () => setFill(pct));
    } else {
      setGain(pct); setFill(pct); // desfazer, perda ou carga do save
    }
    return () => timers.forEach(clearTimeout);
  }, [level, pct]);

  useEffect(() => onFx(e => {
    if (e.type !== 'xp' || e.amount <= 0) return;
    const pop = { id: ++pid, amount: e.amount, rested: e.rested, crit: e.crit };
    setPops(v => [...v.slice(-2), pop]);
    setTimeout(() => setPops(v => v.filter(x => x.id !== pop.id)), 2000);
  }), []);

  return (
    <div className="xpbar-box">
      <div className="xp-pops" aria-hidden>
        {pops.map(p => (
          <span key={p.id} className={`xp-pop${p.crit ? ' crit' : ''}`}>
            +{fmt(p.amount)} XP{p.crit && ' CRÍTICO!'}
            {p.rested > 0 && <small>({fmt(p.rested)} descansado)</small>}
          </span>
        ))}
      </div>
      <div className={`xpbar${instant ? ' instant' : ''}`}>
        <div className="xpgain" style={{ width: `${gain}%` }} />
        <div className="xpfill" style={{ width: `${fill}%` }} />
        <div className="xprest" style={{ left: `${gain}%`, width: `${restPct}%` }} />
        <div className="xpticks" />
        {glow > 0 && <div key={glow} className="xpglow" />}
      </div>
    </div>
  );
}
