import { useRef, useState } from 'react';
import { ACHIEVEMENTS, ATTR, ATTRIBUTES, CAT, CATEGORIES, FACTIONS, PORTRAITS, TITLE, repLevel, titleText, type AttrId } from '../game/data';
import { attrValue, useGame, type CompletionEvent, type Hero, type Portrait } from '../game/store';
import { critChance, dayKey, fmt, need, parseDay, MAX_LEVEL, restedPerLeisure } from '../game/rules';
import { Icon } from './Icon';
import { PanelHeader, PortraitView, QIcon, Sheet } from './parts';

/** Gráfico radar dos 7 atributos. */
function Radar({ values, focus }: { values: Record<AttrId, number>; focus: AttrId | null }) {
  const n = ATTRIBUTES.length;
  const max = Math.max(10, ...Object.values(values));
  const R = 78, cx = 110, cy = 100;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = ATTRIBUTES.map((a, i) => pt(i, (values[a.id] / max) * R).join(',')).join(' ');
  return (
    <svg viewBox="-24 0 268 200" className="radar" aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={ATTRIBUTES.map((_, i) => pt(i, R * f).join(',')).join(' ')} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {ATTRIBUTES.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
      <polygon points={poly} fill="rgba(212,172,82,.22)" stroke="var(--gold)" strokeWidth="1.5" />
      {ATTRIBUTES.map((a, i) => {
        const [x, y] = pt(i, R + 14);
        return <text key={a.id} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill={focus === a.id ? 'var(--gold)' : 'var(--muted)'} fontWeight={focus === a.id ? 700 : 400}>{a.label}</text>;
      })}
    </svg>
  );
}

/** De onde cada atributo tira XP. Missões e hábitos contam igual. */
function attrSources(id: AttrId): { what: string; how: string }[] {
  const list = CATEGORIES
    .filter(c => c.attr === id && c.id !== 'lazer' && c.id !== 'trabalho')
    .map(c => ({ what: c.label, how: 'todo o XP das missões e hábitos dessa categoria' }));
  if (id === 'maestria') list.unshift({ what: 'Trabalho', how: 'todo o XP; metade, se a missão estiver marcada "Me dá dinheiro"' });
  if (id === 'fortuna') list.push({ what: 'Trabalho com "Me dá dinheiro"', how: 'metade do XP da missão (a outra metade vai para Maestria)' });
  if (id === 'espirito') list.push({ what: 'Lazer', how: `+${restedPerLeisure(useGame.getState().level)} (5% da barra do nível) a cada lazer registrado, mesmo sem dar XP de nível` });
  return list;
}

function AttrRow({ id, value, top, xp, focus }: { id: AttrId; value: number; top: number; xp: number; focus: boolean }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const a = ATTR[id];
  const nextAt = 4 * (value + 1) ** 2; // inverso de attrValue
  return (
    // passar por cima só vale para mouse; no toque, o próprio toque abre e fecha
    <div className={`stat-wrap${open ? ' open' : ''}`}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(false); }}>
      <button type="button" className={`stat${focus ? ' focus' : ''}`} onClick={() => setPinned(v => !v)} aria-expanded={open} aria-label={`${a.label}: ${value}. Ver de onde vem`}>
        <span>{a.label}{focus && <Icon id="eye" size={12} />}</span>
        <span className="bar"><i style={{ width: `${(value / top) * 100}%`, background: a.color }} /></span>
        <b>{value}</b>
      </button>
      {open && (
        <div className="stat-info" style={{ borderColor: a.color }}>
          <ul>{attrSources(id).map(src => <li key={src.what}><b>{src.what}:</b> {src.how}.</li>)}</ul>
          <p className="q-meta">{fmt(xp)} XP acumulado · próximo ponto com {fmt(nextAt)} XP (faltam {fmt(Math.max(0, nextAt - xp))}). Cada ponto custa mais que o anterior.</p>
          {id === 'fortuna' && (
            <p className="q-meta"><b style={{ color: 'var(--gold)' }}>Sorte:</b> cada ponto de Fortuna soma +0,1% de chance de crítico. Agora: <b>{(critChance(value) * 100).toFixed(1).replace('.', ',')}%</b> (base 5%, máximo 10% com 50 pontos).</p>
          )}
          {focus && <p className="q-meta"><b style={{ color: 'var(--gold)' }}>Em foco:</b> missões que alimentam este atributo rendem +10% de XP.</p>}
        </div>
      )}
    </div>
  );
}

export function HeroScreen() {
  const s = useGame();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'ficha' | 'rep' | 'conq' | 'hist'>('ficha');
  const values = Object.fromEntries(ATTRIBUTES.map(a => [a.id, attrValue(s.attrXp[a.id])])) as Record<AttrId, number>;
  const top = Math.max(1, ...Object.values(values));
  const title = titleText(s.hero.title, s.hero.gender);
  const points = ACHIEVEMENTS.filter(a => s.achievements[a.id]).reduce((t, a) => t + a.points, 0);

  return (
    <>
      <div className="hero-card">
        <PortraitView p={s.hero.portrait} size={84} />
        <div className="hero-info">
          <h3>{s.hero.name}</h3>
          {title && <span className="unit-title">{title}</span>}
          <span className="q-meta">Herói nível {s.level}{s.level < MAX_LEVEL ? ` · ${fmt(need(s.level) - s.xp)} XP para o ${s.level + 1}` : ' · nível máximo'}</span>
          <span className="q-meta">{fmt(s.totalXp)} XP na jornada · {fmt(s.gold)} de ouro · {points} pts de conquista</span>
        </div>
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar ficha"><Icon id="edit" /></button>
      </div>

      <div className="seg small">
        <button className={tab === 'ficha' ? 'on' : ''} onClick={() => setTab('ficha')}>Atributos</button>
        <button className={tab === 'rep' ? 'on' : ''} onClick={() => setTab('rep')}>Reputação</button>
        <button className={tab === 'conq' ? 'on' : ''} onClick={() => setTab('conq')}>Conquistas</button>
        <button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Histórico</button>
      </div>

      {tab === 'ficha' && <>
        <Radar values={values} focus={s.hero.focus} />
        <p className="q-meta pad">Toque num atributo (ou passe o mouse) para ver de onde ele vem.</p>
        {ATTRIBUTES.map(a => (
          <AttrRow key={a.id} id={a.id} value={values[a.id]} top={top} xp={s.attrXp[a.id]} focus={s.hero.focus === a.id} />
        ))}
        <p className="q-meta pad">
          {s.hero.focus
            ? <>Em foco: <b style={{ color: 'var(--gold)' }}>{ATTR[s.hero.focus].label}</b>. Missões desse atributo rendem +10% de XP.</>
            : 'Escolha um atributo em foco na ficha para ganhar +10% de XP nele.'}
        </p>
      </>}

      {tab === 'rep' && <>
        <PanelHeader>Facções</PanelHeader>
        {FACTIONS.map(f => {
          const r = repLevel(s.rep[f.id]);
          return (
            <div key={f.id} className="rep">
              <div className="row"><span>{f.label}</span><span style={{ color: r.color }}>{r.label}</span></div>
              <div className="bar"><i style={{ width: `${r.progress * 100}%`, background: r.color }} />
                <span>{r.span ? `${fmt(r.into)} / ${fmt(r.span)}` : fmt(s.rep[f.id])}</span></div>
              <span className="q-meta">{f.desc}</span>
            </div>
          );
        })}
        <p className="q-meta pad">Reputação sobe com cada missão da facção e cai quando você perde diárias ou semanais dela. Exaltado libera um título.</p>
      </>}

      {tab === 'conq' && <>
        <PanelHeader right={`${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length}`}>Conquistas</PanelHeader>
        {[...ACHIEVEMENTS].sort((a, b) => Number(!!s.achievements[b.id]) - Number(!!s.achievements[a.id])).map(a => {
          const got = s.achievements[a.id];
          return (
            <div key={a.id} className={`ach${got ? '' : ' locked'}`}>
              <QIcon icon={a.icon} quality={got ? a.quality : 'poor'} />
              <span className="q-main">
                <span className={`q-name c-${got ? a.quality : 'poor'}`}>{a.name}</span>
                <span className="q-meta">{a.desc}{a.title && ` · título: ${titleText(a.title, s.hero.gender)}`}</span>
              </span>
              <span className="ach-pts">{a.points}</span>
            </div>
          );
        })}
      </>}

      {tab === 'hist' && <XpHistory />}

      {editing && <HeroEditor onClose={() => setEditing(false)} />}
    </>
  );
}

const KIND: Record<CompletionEvent['kind'], string> = { quest: 'Missão', habit: 'Hábito', habitExtra: 'Extra de hábito', objective: 'Objetivo', workout: 'Treino', project: 'Mesa' };

function dayLabel(day: string) {
  const today = dayKey();
  if (day === today) return 'Hoje';
  const y = new Date(parseDay(today)); y.setDate(y.getDate() - 1);
  if (day === dayKey(y)) return 'Ontem';
  return parseDay(day).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** Lista o XP ganho (últimos 100 dias) e deixa tirar o que foi marcado por engano. */
function XpHistory() {
  const s = useGame();
  const [limit, setLimit] = useState(40);
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = s.events.filter(e => (e.got ?? e.raw) > 0).sort((a, b) => b.at - a.at);
  const shown = list.slice(0, limit);
  const days = [...new Set(shown.map(e => e.day))];
  if (!list.length) return <p className="q-meta pad">Nenhum XP registrado ainda.</p>;
  return (
    <>
      <p className="q-meta pad">Marcou algo por engano? Toque no X para tirar o XP. A missão, o hábito ou a etapa voltam a ficar sem marcar.</p>
      {days.map(day => (
        <div key={day} className="hist-day">
          <div className="panel-h">{dayLabel(day)}<span>+{fmt(shown.filter(e => e.day === day).reduce((t, e) => t + (e.got ?? e.raw), 0))} XP</span></div>
          {shown.filter(e => e.day === day).map(e => (
            <div key={e.id} className="hist-row">
              <Icon id={CAT[e.cat].icon} size={16} className={`c-${CAT[e.cat].quality}`} />
              <span className="q-main">
                <span className="q-name">{e.name}</span>
                <span className="q-meta">{KIND[e.kind]} · {CAT[e.cat].label} · {new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{e.crit ? ' · crítico' : ''}</span>
              </span>
              <b className={e.crit ? 'c-legend' : 'c-uncommon'}>+{fmt(e.got ?? e.raw)}</b>
              {confirm === e.id
                ? <button type="button" className="btn small red" onClick={() => { s.revokeXp(e.id); setConfirm(null); }}>Tirar</button>
                : <button type="button" className="icon-btn" onClick={() => setConfirm(e.id)} aria-label={`Tirar o XP de ${e.name}`}><Icon id="x" size={14} /></button>}
            </div>
          ))}
        </div>
      ))}
      {list.length > limit && <button type="button" className="btn ghost wide" onClick={() => setLimit(l => l + 40)}>Ver mais</button>}
    </>
  );
}

/** Corta a imagem no centro em quadrado de 256 px e devolve um data URL leve. */
function toSquare(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const k = Math.min(img.width, img.height);
      c.getContext('2d')!.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export function unlockedTitles(achievements: Record<string, string>) {
  return ACHIEVEMENTS.filter(a => a.title && achievements[a.id]).map(a => a.title!);
}

export function HeroForm({ value, onChange, achievements }: { value: Hero; onChange: (h: Hero) => void; achievements: Record<string, string> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const titles = unlockedTitles(achievements);
  const set = (p: Partial<Hero>) => onChange({ ...value, ...p });
  const isOn = (p: Portrait) => value.portrait.kind === p.kind && (p.kind === 'photo' || (value.portrait.kind === 'preset' && value.portrait.id === p.id));

  return (
    <>
      <label className="field">
        <span>Nome do herói</span>
        <input id="hero-name" value={value.name} onChange={e => set({ name: e.target.value })} placeholder="Seu nome" maxLength={24} />
      </label>

      <div className="field"><span>Retrato</span>
        <div className="portrait-grid">
          {PORTRAITS.map(p => (
            <button key={p.id} type="button" className={isOn({ kind: 'preset', id: p.id }) ? 'on' : ''} onClick={() => set({ portrait: { kind: 'preset', id: p.id } })} aria-label={`Retrato ${p.id}`}>
              <PortraitView p={{ kind: 'preset', id: p.id }} size={56} />
            </button>
          ))}
          {value.portrait.kind === 'photo' && (
            <button type="button" className="on" aria-label="Sua foto"><PortraitView p={value.portrait} size={56} /></button>
          )}
          <button type="button" className="upload" onClick={() => fileRef.current?.click()}>
            <Icon id="plus" size={20} /><span>Foto</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
            const f = e.target.files?.[0];
            if (f) set({ portrait: { kind: 'photo', data: await toSquare(f) } });
            e.target.value = '';
          }} />
        </div>
      </div>

      <div className="field"><span>Atributo em foco (+10% de XP)</span>
        <div className="focus-grid">
          {ATTRIBUTES.map(a => (
            <button key={a.id} type="button" className={value.focus === a.id ? 'on' : ''} onClick={() => set({ focus: value.focus === a.id ? null : a.id })}>
              <b style={{ color: a.color }}>{a.label}</b><small>{a.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field"><span>Forma dos títulos</span>
        <div className="seg">
          <button type="button" className={value.gender === 'm' ? 'on' : ''} onClick={() => set({ gender: 'm' })}>o Aventureiro</button>
          <button type="button" className={value.gender === 'f' ? 'on' : ''} onClick={() => set({ gender: 'f' })}>a Aventureira</button>
        </div>
      </div>

      <div className="field"><span>Título equipado</span>
        {titles.length === 0
          ? <p className="q-meta">Nenhum título ainda. Eles são liberados por conquistas e por chegar a Exaltado numa facção.</p>
          : <div className="title-list">
              <button type="button" className={!value.title ? 'on' : ''} onClick={() => set({ title: null })}>Sem título</button>
              {titles.map(t => TITLE[t] && (
                <button key={t} type="button" className={value.title === t ? 'on' : ''} onClick={() => set({ title: t })}>{titleText(t, value.gender)}</button>
              ))}
            </div>}
      </div>
    </>
  );
}

function HeroEditor({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const [draft, setDraft] = useState<Hero>(s.hero);
  return (
    <Sheet title="Ficha do herói" onClose={onClose}
      footer={<button className="btn gold" disabled={!draft.name.trim()} onClick={() => { s.updateHero({ ...draft, name: draft.name.trim() }); onClose(); }}>Salvar ficha</button>}>
      <HeroForm value={draft} onChange={setDraft} achievements={s.achievements} />
    </Sheet>
  );
}
