import { useGame } from '../game/store';
import { addDays, fmt, parseDay, BOSS_FROM_LAST_WEEK, BOSS_RESTED, weekday, WEEKDAY_SHORT } from '../game/rules';
import { Icon } from './Icon';
import { PanelHeader } from './parts';

export function BossScreen() {
  const s = useGame();
  const b = s.boss;
  const pct = (b.hp / b.max) * 100;
  const end = parseDay(addDays(b.week, 6));
  const endStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const eyes = b.killed ? '#555' : b.enraged ? '#ff2a1a' : '#ff8000';

  return (
    <div className="boss">
      <svg className="bossart" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <radialGradient id="bossbg" cx="50%" cy="40%"><stop offset="0" stopColor={b.enraged ? '#6a1a0a' : '#5a2a10'} /><stop offset="1" stopColor="#0b0a08" /></radialGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#bossbg)" stroke="#8a6f35" strokeWidth="2" />
        <path d="M30 40 L40 18 L48 38 Z M90 40 L80 18 L72 38 Z" fill="#c8a24a" />
        <ellipse cx="60" cy="62" rx="30" ry="32" fill={b.killed ? '#2a2a2a' : '#3a2a1a'} stroke="#000" strokeWidth="2" />
        <circle cx="48" cy="56" r="6" fill={eyes} className={b.killed ? '' : 'boss-eye'} />
        <circle cx="72" cy="56" r="6" fill={eyes} className={b.killed ? '' : 'boss-eye'} />
        <path d={b.killed ? 'M44 82 Q60 72 76 82' : 'M44 78 Q60 92 76 78'} stroke="#000" strokeWidth="4" fill="none" />
        {b.killed && <path d="M42 50 l12 12 m0 -12 l-12 12 M66 50 l12 12 m0 -12 l-12 12" stroke="#888" strokeWidth="3" />}
      </svg>
      <h3 className="boss-name">{b.name}</h3>
      <p className="boss-quote">“{b.quote}”</p>
      <span className="q-meta">Chefe da semana · cai até dom {endStr} 23:59{b.enraged && ' · ENFURECIDO'}</span>
      <div className="hpbar"><i style={{ width: `${pct}%` }} /><span>{fmt(b.hp)} / {fmt(b.max)}</span></div>
      {b.killed
        ? <p className="boss-dead">Derrotado! Saque: 500 de ouro e +{fmt(BOSS_RESTED)} de XP descansado para amanhã.</p>
        : <p className="q-meta">Cada ponto de XP que você ganha causa 1 de dano. A vida do chefe é {Math.round(BOSS_FROM_LAST_WEEK * 100)}% do XP que você fez na semana passada.</p>}

      <PanelHeader right={`${fmt(s.weekXp)} XP na semana`}>Registro de combate</PanelHeader>
      <div className="log">
        {b.log.length === 0 && <p className="q-meta">Nenhum golpe ainda. Conclua uma missão para atacar.</p>}
        {b.log.map((l, i) => (
          <div key={i}><span className="dmg"><Icon id="sword" size={11} /> {fmt(l.dmg)}</span> {WEEKDAY_SHORT[weekday(l.day)]} · {l.what}</div>
        ))}
      </div>
      <PanelHeader right={`${s.counters.bossKills} derrotados`}>Histórico</PanelHeader>
    </div>
  );
}
