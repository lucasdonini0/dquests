import { useEffect, useMemo, useState } from 'react';
import { CAT } from '../game/data';
import { WORKOUT_PLAN_BONUS } from '../game/rules';
import { isWork, lastSetsFor, useGame, MAX_PREP, MAX_WARM, MUSCLES, SET_DEFAULTS, type Exercise, type SetKind, type GameData, type Routine, type RoutineItem, type Session, type WorkSet } from '../game/store';
import { addDays, dayKey, parseDay, weekday, weekKey, xpRange, WEEKDAY_SHORT } from '../game/rules';
import { Icon } from './Icon';
import { Empty, PanelHeader, Sheet } from './parts';

// ---------- utilidades ----------
const kgFmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')} kg`;
const parseNum = (t: string) => { const n = Number(t.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };
const dayShort = (d: string) => parseDay(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
// aquecimento e preparatórias não entram nas contas de progresso
const bestKg = (sets: WorkSet[]) => sets.filter(isWork).reduce((m, x) => Math.max(m, x.kg), 0);
const totalReps = (sets: WorkSet[]) => sets.filter(isWork).reduce((t, x) => t + x.reps, 0);
const volume = (sets: WorkSet[]) => sets.filter(isWork).reduce((t, x) => t + x.kg * x.reps, 0);
const KIND_RANK = { warm: 0, prep: 1, work: 2 } as const;
const rankOf = (x: WorkSet) => KIND_RANK[x.kind ?? 'work'];
/** Põe a série no fim do seu grupo: aquecimento, depois preparatórias, depois as válidas. */
const insertSet = (sets: WorkSet[], set: WorkSet) => {
  const at = sets.findIndex(x => rankOf(x) > rankOf(set));
  return at < 0 ? [...sets, set] : [...sets.slice(0, at), set, ...sets.slice(at)];
};
const SET_LABEL = { warm: 'Aquecimento', prep: 'Preparatória' } as const;
const exName = (s: GameData, id: string) => s.exercises.find(e => e.id === id)?.name ?? 'Exercício';
const gymName = (s: GameData, id: string | null) => (id ? s.gyms.find(g => g.id === id)?.name ?? '' : '');

/** Campo numérico que guarda o texto digitado (permite "37," enquanto você digita "37,5"). */
function NumInput({ id, value, onChange, decimal, placeholder, label }: { id: string; value: number; onChange: (n: number) => void; decimal?: boolean; placeholder?: string; label?: string }) {
  const show = (v: number) => (v ? String(v).replace('.', ',') : '');
  const [text, setText] = useState(show(value));
  useEffect(() => { if (parseNum(text) !== value) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input id={id} inputMode={decimal ? 'decimal' : 'numeric'} value={text} placeholder={placeholder ?? '0'} aria-label={label}
      onChange={e => { const t = e.target.value.replace(/[^\d,.]/g, ''); setText(t); onChange(decimal ? parseNum(t) : Math.round(parseNum(t))); }} />
  );
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function WorkoutScreen() {
  const [tab, setTab] = useState<'week' | 'routines' | 'exercises' | 'progress'>('week');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="seg small fin-tabs">
        <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>Semana</button>
        <button className={tab === 'routines' ? 'on' : ''} onClick={() => setTab('routines')}>Treinos</button>
        <button className={tab === 'exercises' ? 'on' : ''} onClick={() => setTab('exercises')}>Exercícios</button>
        <button className={tab === 'progress' ? 'on' : ''} onClick={() => setTab('progress')}>Progresso</button>
      </div>
      {tab === 'week' && <Week onOpen={setOpen} />}
      {tab === 'routines' && <Routines />}
      {tab === 'exercises' && <Exercises />}
      {tab === 'progress' && <Progress />}
      {open && <SessionSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------- semana ----------
function Week({ onOpen }: { onOpen: (id: string) => void }) {
  const s = useGame();
  const now = useNow();
  const today = dayKey();
  const wk = weekKey(today);
  const active = s.sessions.find(x => !x.done);
  const todays = s.routines.filter(r => r.days.includes(weekday(today)));
  const doneToday = (r: Routine) => s.sessions.some(x => x.done && x.day === today && x.routineId === r.id);
  const recent = [...s.sessions].filter(x => x.done).sort((a, b) => b.day.localeCompare(a.day) || b.updatedAt - a.updatedAt).slice(0, 8);
  const start = (routineId: string | null) => onOpen(s.startSession(routineId));
  const [choosing, setChoosing] = useState(false);
  const r = xpRange('saude', 'normal');

  return (
    <>
      {active && (
        <button className="active-session" onClick={() => onOpen(active.id)}>
          <span className="pulse-dot" />
          <span><b>{active.name}</b><small>em andamento{active.startedAt ? ` · ${Math.max(1, Math.round((now - active.startedAt) / 60000))} min` : ''}</small></span>
          <em>Continuar</em>
        </button>
      )}

      <PanelHeader right={WEEKDAY_SHORT[weekday(today)]}>Hoje</PanelHeader>
      {todays.length === 0 && <p className="q-meta pad">Nenhum treino fixo para hoje.</p>}
      {todays.map(rt => (
        <div key={rt.id} className={`routine-card${doneToday(rt) ? ' done' : ''}`}>
          <span className="q-main">
            <span className="q-name c-cat-red">{rt.name}</span>
            <span className="q-meta">{rt.items.length} exercícios{rt.gymId ? ` · ${gymName(s, rt.gymId)}` : ''}</span>
          </span>
          {doneToday(rt)
            ? <span className="q-xp"><Icon id="check" size={18} /></span>
            : <button className="btn gold small" disabled={!!active} onClick={() => start(rt.id)}>Começar</button>}
        </div>
      ))}
      <button className="btn fin-add-one" disabled={!!active} onClick={() => (s.routines.length ? setChoosing(true) : start(null))}><Icon id="plus" size={14} /> Treino avulso</button>
      {choosing && (
        <Sheet title="Treino avulso" onClose={() => setChoosing(false)}>
          <button className="routine-item" onClick={() => { setChoosing(false); start(null); }}>
            <span className="q-main"><span className="q-name">Começar do zero</span><span className="q-meta">Você escolhe os exercícios na hora</span></span>
            <Icon id="plus" size={16} />
          </button>
          <PanelHeader>Ou use um treino pronto</PanelHeader>
          {s.routines.map(rt => (
            <button key={rt.id} className="routine-item" onClick={() => { setChoosing(false); start(rt.id); }}>
              <span className="q-main">
                <span className="q-name">{rt.name}</span>
                <span className="q-meta">{rt.items.length} exercícios{rt.days.length ? ` · ${rt.days.map(d => WEEKDAY_SHORT[d]).join(' · ')}` : ''}</span>
                <span className="routine-ex">{rt.items.map(i => exName(s, i.exId)).join('  ·  ')}</span>
              </span>
              <Icon id="heart" size={16} />
            </button>
          ))}
        </Sheet>
      )}
      <p className="q-meta pad">
        Cada treino terminado dá {r.min}–{r.max} XP de Saúde. Treino fixo feito no dia planejado: +{Math.round((WORKOUT_PLAN_BONUS - 1) * 100)}%.
      </p>

      <PanelHeader right="seg a dom">Minha semana</PanelHeader>
      <div className="week-strip">
        {WEEKDAY_SHORT.map((d, i) => {
          const day = addDays(wk, i);
          const planned = s.routines.filter(rt => rt.days.includes(i));
          const done = s.sessions.filter(x => x.done && x.day === day);
          return (
            <div key={d} className={`wday${day === today ? ' today' : ''}${done.length ? ' done' : ''}`}>
              <b>{d}</b>
              {done.length > 0
                ? <Icon id="check" size={16} />
                : planned.length > 0 ? <span className="dot" title={planned.map(p => p.name).join(', ')} /> : <span className="rest">·</span>}
              <small>{planned[0]?.name.split(/[—-]/)[0].trim().slice(0, 8) ?? (done[0] ? 'avulso' : '')}</small>
            </div>
          );
        })}
      </div>

      <PanelHeader right={`${s.sessions.filter(x => x.done).length} no total`}>Últimos treinos</PanelHeader>
      {recent.length === 0 && <Empty icon="heart" title="Nenhum treino ainda" text="Cadastre seus exercícios em Exercícios, monte o treino em Treinos, ou comece um treino avulso." />}
      {recent.map(x => (
        <button key={x.id} className="exp-item" onClick={() => onOpen(x.id)}>
          <span className="exp-ico c-cat-red" style={{ borderColor: 'currentColor' }}><Icon id="heart" size={16} /></span>
          <span className="q-main">
            <span className="q-name">{x.name}</span>
            <span className="q-meta">{WEEKDAY_SHORT[weekday(x.day)]}, {dayShort(x.day)}{gymName(s, x.gymId) ? ` · ${gymName(s, x.gymId)}` : ''} · {x.items.length} exercícios</span>
          </span>
          <b>{x.minutes} min</b>
        </button>
      ))}
    </>
  );
}

// ---------- ficha do treino ----------
const KIND_LABEL = { machine: 'Máquina', free: 'Livre' } as const;
const kindOf = (s: GameData, exId: string) => s.exercises.find(e => e.id === exId)?.kind;

function KindChip({ kind }: { kind?: 'machine' | 'free' }) {
  if (!kind) return null;
  return <span className={`kind-chip ${kind}`}>{KIND_LABEL[kind]}</span>;
}

function SessionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useGame();
  const stored = s.sessions.find(x => x.id === id);
  const [draft, setDraft] = useState<Session | null>(stored ? JSON.parse(JSON.stringify(stored)) : null);
  const [openEx, setOpenEx] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [newGym, setNewGym] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const now = useNow(15_000);
  if (!draft) return null;

  const routine = draft.routineId ? s.routines.find(r => r.id === draft.routineId) : null;
  const targetFor = (exId: string) => routine?.items.find(i => i.exId === exId) ?? null;
  const set = (p: Partial<Session>) => setDraft(d => (d ? { ...d, ...p } : d));
  const setItem = (i: number, sets: WorkSet[]) => setDraft(d => (d ? { ...d, items: d.items.map((it, k) => (k === i ? { ...it, sets } : it)) } : d));
  const close = () => { s.saveSession(draft); onClose(); };
  const elapsed = draft.startedAt ? Math.max(1, Math.round((now - draft.startedAt) / 60000)) : 0;
  const addGym = () => {
    if (!newGym.trim()) return;
    set({ gymId: s.saveGym(newGym) });
    setNewGym('');
  };
  const addExercise = (exId: string) => {
    const last = lastSetsFor(useGame.getState(), exId, draft.day, draft.id);
    // sem histórico: o padrão (aquecimento, preparatória e as válidas)
    const sets: WorkSet[] = last?.length ? last.map(x => ({ ...x, reps: 0 })) : [
      ...Array.from({ length: SET_DEFAULTS.warmSets }, (): WorkSet => ({ kg: 0, reps: 0, kind: 'warm' })),
      ...Array.from({ length: SET_DEFAULTS.prepSets }, (): WorkSet => ({ kg: 0, reps: 0, kind: 'prep' })),
      ...Array.from({ length: SET_DEFAULTS.sets }, (): WorkSet => ({ kg: 0, reps: 0 })),
    ];
    set({ items: [...draft.items, { exId, sets }] });
    setOpenEx(draft.items.length);
    setPicking(false);
  };
  const doneSets = (sets: WorkSet[]) => sets.filter(x => isWork(x) && x.reps > 0).length;
  const workCount = (sets: WorkSet[]) => sets.filter(isWork).length;

  return (
    <Sheet title={draft.done ? 'Treino' : 'Treino em andamento'} onClose={close}
      footer={<>
        {confirmDel
          ? <button className="btn red" onClick={() => { s.deleteSession(draft.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>}
        {draft.done
          ? <button className="btn gold" onClick={close}>Salvar</button>
          : <>
              <button className="btn" onClick={close}>Pausar</button>
              <button className="btn gold" disabled={!draft.items.some(it => doneSets(it.sets))} onClick={() => { s.saveSession(draft); s.finishSession(draft.id); onClose(); }}>Terminar treino</button>
            </>}
      </>}>
      <div className="ws-head">
        <input id="ws-name" className="ws-title" value={draft.name} onChange={e => set({ name: e.target.value })} maxLength={50} aria-label="Nome do treino" />
        <div className="dur-row">
          <Icon id="clock" size={16} />
          <NumInput id="ws-minutes" value={draft.minutes} placeholder={draft.done ? '0' : String(elapsed)} label="Duração em minutos" onChange={n => set({ minutes: n })} />
          <span className="q-meta">min{!draft.done && draft.startedAt ? ` · cronômetro desde ${new Date(draft.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (deixe vazio para usar)` : ''}</span>
        </div>
      </div>

      <div className="field"><span>Academia</span>
        <div className="exp-filter">
          {s.gyms.map(g => (
            <button key={g.id} type="button" className={draft.gymId === g.id ? 'on' : ''} onClick={() => set({ gymId: draft.gymId === g.id ? null : g.id })}>{g.name}</button>
          ))}
        </div>
        <div className="obj-edit">
          <input id="ws-new-gym" value={newGym} placeholder={s.gyms.length ? 'Outra academia' : 'Ex.: Smart Fit Centro'} maxLength={40}
            onChange={e => setNewGym(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGym(); } }} />
          <button type="button" className="btn small" disabled={!newGym.trim()} onClick={addGym}>Salvar</button>
        </div>
      </div>

      <div className="field"><span>Exercícios · toque para anotar</span>
        {draft.items.map((it, i) => {
          const last = lastSetsFor(s, it.exId, draft.day, draft.id);
          const target = targetFor(it.exId);
          const open = openEx === i;
          const done = doneSets(it.sets);
          const total = workCount(it.sets);
          const work = it.sets.filter(isWork);
          const lastWork = last?.filter(isWork) ?? [];
          const topped = !!target && work.length >= target.sets && work.every(x => x.reps >= target.repsMax);
          const prepCount = it.sets.filter(x => x.kind === 'prep').length;
          // faixa de reps de cada tipo de série, pelo treino fixo
          const rangeOf = (kind?: SetKind) => {
            if (!target) return null;
            if (kind === 'warm') return target.warmMin ? { min: target.warmMin, max: target.warmMax ?? target.warmMin } : null;
            if (kind === 'prep') return target.prepMin ? { min: target.prepMin, max: target.prepMax ?? target.prepMin } : null;
            return { min: target.repsMin, max: target.repsMax };
          };
          const extras = target ? [target.warmSets ? `${target.warmSets} aquec.` : '', target.prepSets ? `${target.prepSets} prep.` : ''].filter(Boolean).join(' + ') : '';
          return (
            <div key={`${it.exId}-${i}`} className={`ex-card${open ? ' open' : ''}${done >= total && done ? ' complete' : ''}`}>
              <button type="button" className="ex-card-h" onClick={() => setOpenEx(open ? null : i)} aria-expanded={open}>
                <span className="ex-check">{done >= total && done ? <Icon id="check" size={14} /> : `${done}/${total}`}</span>
                <span className="q-main">
                  <span className="ex-name">{exName(s, it.exId)} <KindChip kind={kindOf(s, it.exId)} /></span>
                  <span className="q-meta">
                    {target ? `${target.sets} séries · ${target.repsMin === target.repsMax ? target.repsMin : `${target.repsMin}–${target.repsMax}`} reps` : `${total} séries`}
                    {extras && ` · ${extras}`}
                    {lastWork.length > 0 && ` · última: ${lastWork.map(x => `${kgFmt(x.kg)}×${x.reps}`).join(' ')}`}
                  </span>
                </span>
                <span className="ex-caret" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              {open && (
                <div className="ex-body">
                  <div className="set-head"><span>Série</span><span>Peso (kg)</span><span>Reps</span><span /></div>
                  {it.sets.map((st, k) => {
                    // compara com a série do mesmo tipo e posição da última vez
                    const nth = it.sets.slice(0, k).filter(x => x.kind === st.kind).length;
                    const prev = last?.filter(x => x.kind === st.kind)[nth];
                    const dKg = prev ? st.kg - prev.kg : 0;
                    const dReps = prev && st.reps ? st.reps - prev.reps : 0;
                    const range = rangeOf(st.kind);
                    const inRange = range && st.reps ? (st.reps < range.min ? 'low' : st.reps > range.max ? 'high' : 'ok') : '';
                    const label = st.kind === 'warm' ? `A${nth + 1}` : st.kind === 'prep' ? `P${nth + 1}` : String(nth + 1);
                    const name = st.kind ? `${SET_LABEL[st.kind]} ${nth + 1}` : `série ${nth + 1}`;
                    return (
                      <div key={k} className={`set-row${st.kind ? ` ${st.kind}` : ''}`}>
                        <span className="set-n" title={st.kind ? SET_LABEL[st.kind] : 'Série válida'}>{label}</span>
                        <NumInput id={`ws-kg-${i}-${k}`} decimal value={st.kg} label={`Peso: ${name}`}
                          onChange={n => setItem(i, it.sets.map((x, j) => (j === k ? { ...x, kg: n } : x)))} />
                        <span className={`reps-wrap ${inRange}`}>
                          <NumInput id={`ws-reps-${i}-${k}`} value={st.reps} label={`Reps: ${name}`}
                            placeholder={prev ? String(prev.reps) : range ? `${range.min}–${range.max}` : '0'}
                            onChange={n => setItem(i, it.sets.map((x, j) => (j === k ? { ...x, reps: n } : x)))} />
                        </span>
                        <span className="set-delta">
                          {dKg !== 0 && <em className={dKg > 0 ? 'pos' : 'neg'}>{dKg > 0 ? '▲' : '▼'}{kgFmt(Math.abs(dKg))}</em>}
                          {dKg === 0 && dReps !== 0 && <em className={dReps > 0 ? 'pos' : 'neg'}>{dReps > 0 ? '▲' : '▼'}{Math.abs(dReps)} reps</em>}
                          {st.kind && <button type="button" className="icon-btn set-x" onClick={() => setItem(i, it.sets.filter((_, j) => j !== k))} aria-label={`Tirar ${name}`}><Icon id="x" size={12} /></button>}
                        </span>
                      </div>
                    );
                  })}
                  {topped && <p className="ex-tip"><Icon id="star" size={14} /> Todas as séries no topo da faixa: hora de subir o peso no próximo treino.</p>}
                  <div className="row-btns">
                    <button type="button" className="btn small" onClick={() => setItem(i, [...it.sets, { kg: work.at(-1)?.kg ?? 0, reps: 0 }])}>+ Série</button>
                    {total > 1 && <button type="button" className="btn small" onClick={() => setItem(i, it.sets.filter((_, j) => j !== it.sets.lastIndexOf(work.at(-1)!)))}>− Série</button>}
                    <button type="button" className="btn small" onClick={() => setItem(i, insertSet(it.sets, { kg: 0, reps: 0, kind: 'warm' }))}>+ Aquecimento</button>
                    {prepCount < MAX_PREP && <button type="button" className="btn small" onClick={() => setItem(i, insertSet(it.sets, { kg: work[0]?.kg ?? 0, reps: 0, kind: 'prep' }))}>+ Preparatória</button>}
                    <button type="button" className="btn small ghost" onClick={() => { set({ items: draft.items.filter((_, k) => k !== i) }); setOpenEx(null); }}>Tirar exercício</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="btn add-ex" onClick={() => setPicking(true)}><Icon id="plus" size={16} /> Adicionar exercício</button>
      </div>

      <label className="field">
        <span>Observações</span>
        <input id="ws-notes" value={draft.notes} onChange={e => set({ notes: e.target.value })} placeholder="Ex.: treino com o pessoal, ombro incomodou" maxLength={120} />
      </label>
      {picking && <ExercisePicker exclude={draft.items.map(i => i.exId)} onPick={addExercise} onClose={() => setPicking(false)} />}
    </Sheet>
  );
}

// ---------- músculos ----------
const NO_MUSCLE = 'Sem músculo';

/** Músculos em uso: os sugeridos na ordem padrão e depois os criados pelo usuário. */
function allMuscles(s: GameData) {
  const custom = [...new Set(s.exercises.map(e => e.muscle).filter((m): m is string => !!m && !MUSCLES.includes(m)))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...MUSCLES, ...custom];
}

/** Exercícios agrupados por músculo, na ordem dos músculos; sem músculo por último. */
function byMuscle(s: GameData, list: Exercise[]) {
  const order = [...allMuscles(s), NO_MUSCLE];
  const groups = new Map<string, Exercise[]>();
  for (const e of [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
    const m = e.muscle || NO_MUSCLE;
    groups.set(m, [...(groups.get(m) ?? []), e]);
  }
  return order.filter(m => groups.has(m)).map(m => ({ muscle: m, items: groups.get(m)! }));
}

function MusclePicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const s = useGame();
  const [custom, setCustom] = useState('');
  const options = allMuscles(s);
  const extra = value && !options.includes(value) ? [value] : [];
  const add = () => { if (custom.trim()) { onChange(custom.trim()); setCustom(''); } };
  return (
    <>
      <div className="exp-filter muscle-pick">
        {[...options, ...extra].map(m => (
          <button key={m} type="button" className={value === m ? 'on' : ''} onClick={() => onChange(value === m ? '' : m)}>{m}</button>
        ))}
      </div>
      <div className="obj-edit">
        <input id="muscle-new" value={custom} placeholder="Outro músculo (ex.: Trapézio)" maxLength={30}
          onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn small" disabled={!custom.trim()} onClick={add}>Usar</button>
      </div>
    </>
  );
}

// ---------- seletor de exercício ----------
function ExercisePicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (exId: string) => void; onClose: () => void }) {
  const s = useGame();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'machine' | 'free'>('machine');
  const [muscle, setMuscle] = useState('');
  const term = q.trim().toLowerCase();
  const list = s.exercises.filter(e => !exclude.includes(e.id) && (e.name.toLowerCase().includes(term) || (e.muscle ?? '').toLowerCase().includes(term)));
  const exact = s.exercises.some(e => e.name.toLowerCase() === term);
  return (
    <Sheet title="Escolher exercício" onClose={onClose}>
      <input id="ex-search" className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou músculo, ou criar" autoFocus />
      <div className="ex-pick-list">
        {byMuscle(s, list).map(g => (
          <div key={g.muscle} className="ex-pick-group">
            <p className="ex-group">{g.muscle}</p>
            {g.items.map(e => (
              <button key={e.id} type="button" className="ex-pick" onClick={() => onPick(e.id)}>
                <span>{e.name}</span><KindChip kind={e.kind} />
              </button>
            ))}
          </div>
        ))}
        {!list.length && !q.trim() && <p className="q-meta pad">Nenhum exercício cadastrado ainda. Digite o nome para criar.</p>}
      </div>
      {q.trim() && !exact && (
        <div className="ex-create">
          <span className="q-meta">Criar “{q.trim()}”</span>
          <div className="seg small">
            <button type="button" className={kind === 'machine' ? 'on' : ''} onClick={() => setKind('machine')}>Máquina</button>
            <button type="button" className={kind === 'free' ? 'on' : ''} onClick={() => setKind('free')}>Livre</button>
          </div>
          <MusclePicker value={muscle} onChange={setMuscle} />
          <button type="button" className="btn gold" onClick={() => onPick(s.ensureExercise(q, kind, muscle))}><Icon id="plus" size={14} /> Criar e adicionar</button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- exercícios ----------
type ExDraft = { id: string; name: string; kind: 'machine' | 'free'; muscle: string };

function Exercises() {
  const s = useGame();
  const [editing, setEditing] = useState<ExDraft | 'new' | null>(null);
  const used = (id: string) => s.routines.filter(r => r.items.some(i => i.exId === id)).map(r => r.name);
  const timesDone = (id: string) => s.sessions.filter(x => x.done && x.items.some(i => i.exId === id)).length;
  return (
    <>
      <PanelHeader right={`${s.exercises.length}`}>Meus exercícios</PanelHeader>
      {s.exercises.length === 0 && (
        <Empty icon="heart" title="Nenhum exercício cadastrado" text="Cadastre os exercícios que você faz, com o músculo e se é em máquina ou com peso livre. Depois é só escolher na hora de montar o treino."
          action={<button className="btn gold" onClick={() => setEditing('new')}><Icon id="plus" size={16} /> Cadastrar exercício</button>} />
      )}
      {byMuscle(s, s.exercises).map(g => (
        <div key={g.muscle}>
          <p className="ex-group">{g.muscle} <span>{g.items.length}</span></p>
          {g.items.map(e => (
            <button key={e.id} className="exp-item" onClick={() => setEditing({ id: e.id, name: e.name, kind: e.kind ?? 'machine', muscle: e.muscle ?? '' })}>
              <span className={`exp-ico kind-ico ${e.kind ?? ''}`}><Icon id={e.kind === 'free' ? 'sword' : 'gear'} size={16} /></span>
              <span className="q-main">
                <span className="q-name">{e.name} <KindChip kind={e.kind} /></span>
                <span className="q-meta">{timesDone(e.id)} treinos{used(e.id).length ? ` · em ${used(e.id).join(', ')}` : ''}</span>
              </span>
              <Icon id="edit" size={16} />
            </button>
          ))}
        </div>
      ))}
      <div className="fab-space" />
      <button className="fab" onClick={() => setEditing('new')} aria-label="Novo exercício"><Icon id="plus" size={26} /></button>
      {editing && <ExerciseEditor ex={editing === 'new' ? null : editing} usedIn={editing === 'new' ? [] : used(editing.id)} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExerciseEditor({ ex, usedIn, onClose }: { ex: ExDraft | null; usedIn: string[]; onClose: () => void }) {
  const s = useGame();
  const [name, setName] = useState(ex?.name ?? '');
  const [kind, setKind] = useState<'machine' | 'free'>(ex?.kind ?? 'machine');
  const [muscle, setMuscle] = useState(ex?.muscle ?? '');
  const [confirmDel, setConfirmDel] = useState(false);
  const dup = s.exercises.some(e => e.id !== ex?.id && e.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Sheet title={ex ? 'Editar exercício' : 'Novo exercício'} onClose={onClose}
      footer={<>
        {ex && (confirmDel
          ? <button className="btn red" onClick={() => { s.deleteExercise(ex.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!name.trim() || dup}
          onClick={() => { if (ex) s.saveExercise({ id: ex.id, name, kind, muscle }); else s.ensureExercise(name, kind, muscle); onClose(); }}>Salvar</button>
      </>}>
      <label className="field">
        <span>Nome</span>
        <input id="ex-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Supino reto" maxLength={50} autoFocus={!ex} />
      </label>
      {dup && <p className="err">Já existe um exercício com esse nome.</p>}
      <div className="field"><span>Músculo</span>
        <MusclePicker value={muscle} onChange={setMuscle} />
      </div>
      <div className="field"><span>Tipo</span>
        <div className="kind-pick">
          <button type="button" className={kind === 'machine' ? 'on' : ''} onClick={() => setKind('machine')}><Icon id="gear" size={22} /><b>Máquina</b><small>Aparelho, polia, cabo</small></button>
          <button type="button" className={kind === 'free' ? 'on' : ''} onClick={() => setKind('free')}><Icon id="sword" size={22} /><b>Livre</b><small>Barra, halter, peso do corpo</small></button>
        </div>
      </div>
      {confirmDel && usedIn.length > 0 && <p className="q-meta">Ele sai de: {usedIn.join(', ')}. Os treinos já feitos continuam no histórico.</p>}
    </Sheet>
  );
}

// ---------- treinos fixos ----------
function Routines() {
  const s = useGame();
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);
  return (
    <>
      <PanelHeader right={`${s.routines.length}`}>Treinos fixos</PanelHeader>
      {s.routines.length === 0 && (
        <Empty icon="heart" title="Nenhum treino fixo" text="Monte seu treino: nome, dias da semana e, para cada exercício, as séries válidas e a faixa de reps."
          action={<button className="btn gold" onClick={() => setEditing('new')}><Icon id="plus" size={16} /> Montar treino</button>} />
      )}
      {s.routines.map(r => (
        <button key={r.id} className="routine-item" onClick={() => setEditing(r)}>
          <span className="q-main">
            <span className="q-name">{r.name}</span>
            <span className="q-meta">{r.days.length ? r.days.map(d => WEEKDAY_SHORT[d]).join(' · ') : 'sem dia fixo'}{r.gymId ? ` · ${gymName(s, r.gymId)}` : ''}</span>
            <span className="routine-ex">{r.items.map(i => `${exName(s, i.exId)} ${i.sets}×${range(i.repsMin, i.repsMax)}${i.warmSets ? ` +${i.warmSets}A` : ''}${i.prepSets ? ` +${i.prepSets}P` : ''}`).join('  ·  ')}</span>
          </span>
          <Icon id="edit" size={16} />
        </button>
      ))}
      <div className="fab-space" />
      <button className="fab" onClick={() => setEditing('new')} aria-label="Novo treino fixo"><Icon id="plus" size={26} /></button>
      {editing && <RoutineEditor routine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RoutineEditor({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const s = useGame();
  const [name, setName] = useState(routine?.name ?? '');
  const [days, setDays] = useState<number[]>(routine?.days ?? []);
  const [gymId, setGymId] = useState<string | null>(routine?.gymId ?? null);
  const [questId, setQuestId] = useState<string | null>(routine?.questId ?? null);
  const [items, setItems] = useState<RoutineItem[]>(routine?.items ?? []);
  const [picking, setPicking] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const healthQuests = s.quests.filter(q => q.cat === 'saude' && q.type !== 'once');
  const upd = (i: number, p: Partial<RoutineItem>) => setItems(v => v.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setItems(v => { const n = [...v]; const j = i + d; if (j < 0 || j >= n.length) return v; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const okRange = (n = 0, min = 0, max = 0) => !n || (min > 0 && max >= min);
  const valid = name.trim() && items.length && items.every(i => i.sets > 0 && i.repsMin > 0 && i.repsMax >= i.repsMin
    && okRange(i.warmSets, i.warmMin, i.warmMax) && okRange(i.prepSets, i.prepMin, i.prepMax));
  const [extraOpen, setExtraOpen] = useState<Set<string>>(() => new Set((routine?.items ?? []).filter(i => i.warmSets || i.prepSets).map(i => i.exId)));
  const toggleExtra = (i: number, it: RoutineItem) => {
    const open = extraOpen.has(it.exId);
    setExtraOpen(v => { const n = new Set(v); if (open) n.delete(it.exId); else n.add(it.exId); return n; });
    // abrir já sugere o padrão (1 aquecimento e 1 preparatória); fechar tira os dois
    const D = SET_DEFAULTS;
    upd(i, open
      ? { warmSets: 0, prepSets: 0 }
      : { warmSets: it.warmSets || D.warmSets, warmMin: it.warmMin || D.warmMin, warmMax: it.warmMax || D.warmMax, prepSets: it.prepSets || D.prepSets, prepMin: it.prepMin || D.prepMin, prepMax: it.prepMax || D.prepMax });
  };
  // zero séries de um tipo: some com os campos dele
  const clean = (it: RoutineItem): RoutineItem => {
    const out = { ...it };
    if (!out.warmSets) { delete out.warmSets; delete out.warmMin; delete out.warmMax; }
    if (!out.prepSets) { delete out.prepSets; delete out.prepMin; delete out.prepMax; }
    return out;
  };

  return (
    <Sheet title={routine ? 'Editar treino fixo' : 'Novo treino fixo'} onClose={onClose}
      footer={<>
        {routine && (confirmDel
          ? <button className="btn red" onClick={() => { s.deleteRoutine(routine.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!valid}
          onClick={() => { s.saveRoutine({ id: routine?.id, name: name.trim(), days: [...days].sort(), gymId, questId, items: items.map(clean) }); onClose(); }}>Salvar</button>
      </>}>
      <label className="field">
        <span>Nome</span>
        <input id="rt-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Treino A — Peito e tríceps" maxLength={50} autoFocus={!routine} />
      </label>
      <div className="field"><span>Dias da semana</span>
        <div className="days">{WEEKDAY_SHORT.map((d, i) => (
          <button key={d} type="button" className={days.includes(i) ? 'on' : ''} onClick={() => setDays(v => (v.includes(i) ? v.filter(x => x !== i) : [...v, i]))}>{d}</button>
        ))}</div>
      </div>

      <div className="field"><span>Exercícios</span>
        {items.length > 0 && <div className="rt-head"><span>Exercício</span><span>Séries</span><span>Reps</span></div>}
        {items.map((it, i) => (
          <div key={`${it.exId}-${i}`} className="rt-row">
            <div className="rt-name">
              <b>{exName(s, it.exId)}</b>
              <KindChip kind={kindOf(s, it.exId)} />
            </div>
            <NumInput id={`rt-sets-${i}`} value={it.sets} label="Séries válidas" onChange={n => upd(i, { sets: n })} />
            <div className="rt-range">
              <NumInput id={`rt-min-${i}`} value={it.repsMin} label="Reps mínimas" onChange={n => upd(i, { repsMin: n })} />
              <span>–</span>
              <NumInput id={`rt-max-${i}`} value={it.repsMax} label="Reps máximas" onChange={n => upd(i, { repsMax: n })} />
            </div>
            {extraOpen.has(it.exId) && <>
              <span className="rt-sub">Aquecimento</span>
              <NumInput id={`rt-wsets-${i}`} value={it.warmSets ?? 0} label="Séries de aquecimento" onChange={n => upd(i, { warmSets: Math.min(MAX_WARM, n) })} />
              <div className="rt-range">
                <NumInput id={`rt-wmin-${i}`} value={it.warmMin ?? 0} label="Reps mínimas do aquecimento" onChange={n => upd(i, { warmMin: n })} />
                <span>–</span>
                <NumInput id={`rt-wmax-${i}`} value={it.warmMax ?? 0} label="Reps máximas do aquecimento" onChange={n => upd(i, { warmMax: n })} />
              </div>
              <span className="rt-sub">Preparatórias <small>até {MAX_PREP}</small></span>
              <NumInput id={`rt-psets-${i}`} value={it.prepSets ?? 0} label="Séries preparatórias" onChange={n => upd(i, { prepSets: Math.min(MAX_PREP, n) })} />
              <div className="rt-range">
                <NumInput id={`rt-pmin-${i}`} value={it.prepMin ?? 0} label="Reps mínimas das preparatórias" onChange={n => upd(i, { prepMin: n })} />
                <span>–</span>
                <NumInput id={`rt-pmax-${i}`} value={it.prepMax ?? 0} label="Reps máximas das preparatórias" onChange={n => upd(i, { prepMax: n })} />
              </div>
              {(!okRange(it.warmSets, it.warmMin, it.warmMax) || !okRange(it.prepSets, it.prepMin, it.prepMax)) && <p className="err rt-err">Preencha a faixa de reps do aquecimento e das preparatórias (máxima maior ou igual à mínima).</p>}
            </>}
            <div className="rt-actions">
              <button type="button" className="btn small ghost rt-extra-btn" onClick={() => toggleExtra(i, it)}>{extraOpen.has(it.exId) ? 'Tirar aquecimento' : '+ Aquecimento e preparatórias'}</button>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><span aria-hidden="true">↑</span></button>
              <button type="button" className="icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><span aria-hidden="true">↓</span></button>
              <button type="button" className="icon-btn" onClick={() => setItems(v => v.filter((_, k) => k !== i))} aria-label={`Tirar ${exName(s, it.exId)}`}><Icon id="x" size={14} /></button>
            </div>
            {it.repsMax < it.repsMin && <p className="err rt-err">A reps máxima precisa ser maior ou igual à mínima.</p>}
          </div>
        ))}
        <button type="button" className="btn add-ex" onClick={() => setPicking(true)}><Icon id="plus" size={16} /> Adicionar exercício</button>
        <p className="q-meta">No dia, cada exercício já vem com as séries válidas e o peso e as reps da última vez. Bateu o topo da faixa em todas as séries? O app avisa para subir o peso. Aquecimento e preparatórias são opcionais e não contam no progresso.</p>
      </div>

      {s.gyms.length > 0 && (
        <div className="field"><span>Academia padrão</span>
          <div className="exp-filter">
            {s.gyms.map(g => <button key={g.id} type="button" className={gymId === g.id ? 'on' : ''} onClick={() => setGymId(gymId === g.id ? null : g.id)}>{g.name}</button>)}
          </div>
        </div>
      )}
      {healthQuests.length > 0 && (
        <div className="field"><span>Missão vinculada (opcional)</span>
          <div className="exp-filter">
            {healthQuests.map(q => (
              <button key={q.id} type="button" className={questId === q.id ? 'on' : ''} style={{ ['--c' as string]: '#ff5b4a' }} onClick={() => setQuestId(questId === q.id ? null : q.id)}>{q.name}</button>
            ))}
          </div>
          <p className="q-meta">Ao terminar este treino, a missão é concluída sozinha e o XP vem dela, sem contar dobrado.</p>
        </div>
      )}
      {picking && <ExercisePicker exclude={items.map(i => i.exId)} onPick={exId => { setItems(v => [...v, { exId, ...SET_DEFAULTS }]); setExtraOpen(v => new Set(v).add(exId)); setPicking(false); }} onClose={() => setPicking(false)} />}
    </Sheet>
  );
}

// ---------- progresso ----------
type Metric = 'kg' | 'volume' | 'reps';

function Progress() {
  const s = useGame();
  const today = dayKey();
  const thisWeek = weekKey(today);
  const lastWeek = addDays(thisWeek, -7);
  const span = weekday(today); // compara o mesmo pedaço da semana passada
  const done = s.sessions.filter(x => x.done);
  const inThis = done.filter(x => x.day >= thisWeek && x.day <= today);
  const inLast = done.filter(x => x.day >= lastWeek && x.day <= addDays(lastWeek, span));
  const exIds = [...new Set(done.flatMap(x => x.items.map(i => i.exId)))];
  const [exId, setExId] = useState<string | null>(exIds[0] ?? null);
  const [metric, setMetric] = useState<Metric>('kg');

  const perEx = (list: Session[], id: string) => {
    const sets = list.flatMap(x => x.items.filter(i => i.exId === id).flatMap(i => i.sets));
    return sets.length ? { kg: bestKg(sets), reps: totalReps(sets), vol: volume(sets) } : null;
  };
  const rows = [...new Set([...inThis, ...inLast].flatMap(x => x.items.map(i => i.exId)))]
    .map(id => ({ id, now: perEx(inThis, id), before: perEx(inLast, id) }));
  const minutes = (l: Session[]) => l.reduce((t, x) => t + x.minutes, 0);

  const series = useMemo(() => {
    if (!exId) return [];
    return done
      .filter(x => x.items.some(i => i.exId === exId && i.sets.length))
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(x => {
        const sets = x.items.filter(i => i.exId === exId).flatMap(i => i.sets);
        const value = metric === 'kg' ? bestKg(sets) : metric === 'volume' ? volume(sets) : totalReps(sets);
        return { day: x.day, value };
      })
      .slice(-16);
  }, [done, exId, metric]);

  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i))).map(w => ({
    week: w, value: minutes(done.filter(x => x.day >= w && x.day <= addDays(w, 6))),
  }));

  if (!done.length) return <Empty icon="heart" title="Sem dados ainda" text="Termine alguns treinos para ver a comparação com a semana passada e os gráficos de progressão." />;

  return (
    <>
      <PanelHeader right={`seg a ${WEEKDAY_SHORT[span].toLowerCase()}`}>Esta semana × semana passada</PanelHeader>
      <div className="fin-summary">
        <div><small>Treinos</small><b>{inThis.length}</b><Diff now={inThis.length} before={inLast.length} /></div>
        <div><small>Tempo</small><b>{minutes(inThis)} min</b><Diff now={minutes(inThis)} before={minutes(inLast)} unit=" min" /></div>
        <div><small>Volume</small><b>{Math.round(volume(inThis.flatMap(x => x.items.flatMap(i => i.sets)))).toLocaleString('pt-BR')} kg</b>
          <Diff now={volume(inThis.flatMap(x => x.items.flatMap(i => i.sets)))} before={volume(inLast.flatMap(x => x.items.flatMap(i => i.sets)))} unit=" kg" /></div>
      </div>
      {rows.length > 0 && (
        <div className="cmp-table" role="table" aria-label="Comparação por exercício">
          <div className="cmp-row head" role="row"><span>Exercício</span><span>Carga máx.</span><span>Reps</span></div>
          {rows.map(r => (
            <div key={r.id} className="cmp-row" role="row">
              <span>{exName(s, r.id)}</span>
              <span>{r.now ? kgFmt(r.now.kg) : '—'}<Diff now={r.now?.kg ?? 0} before={r.before?.kg ?? 0} unit=" kg" hideIfMissing={!r.before || !r.now} /></span>
              <span>{r.now?.reps ?? '—'}<Diff now={r.now?.reps ?? 0} before={r.before?.reps ?? 0} hideIfMissing={!r.before || !r.now} /></span>
            </div>
          ))}
        </div>
      )}

      <PanelHeader>Progressão por exercício</PanelHeader>
      <div className="exp-filter">
        {exIds.map(id => <button key={id} className={exId === id ? 'on' : ''} style={{ ['--c' as string]: '#ff5b4a' }} onClick={() => setExId(id)}>{exName(s, id)}</button>)}
      </div>
      <div className="seg small">
        <button className={metric === 'kg' ? 'on' : ''} onClick={() => setMetric('kg')}>Carga máx.</button>
        <button className={metric === 'volume' ? 'on' : ''} onClick={() => setMetric('volume')}>Volume</button>
        <button className={metric === 'reps' ? 'on' : ''} onClick={() => setMetric('reps')}>Reps</button>
      </div>
      {exId && <LineChart title={`${exName(s, exId)}: ${metric === 'kg' ? 'carga máxima (kg)' : metric === 'volume' ? 'volume (kg × reps)' : 'reps totais'}`}
        points={series} fmt={v => (metric === 'kg' ? kgFmt(v) : metric === 'volume' ? `${Math.round(v).toLocaleString('pt-BR')} kg` : `${v} reps`)} />}

      <PanelHeader right="últimas 8 semanas">Tempo de treino por semana</PanelHeader>
      <BarChart points={weeks.map(w => ({ label: dayShort(w.week), value: w.value }))} fmt={v => `${v} min`} />
      <p className="q-meta pad">Os treinos dão XP de {CAT.saude.label}, que sobe Força e a Ordem do Corpo.</p>
    </>
  );
}

function Diff({ now, before, unit = '', hideIfMissing }: { now: number; before: number; unit?: string; hideIfMissing?: boolean }) {
  if (hideIfMissing || (!now && !before)) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return <em className="diff">=</em>;
  return <em className={`diff ${d > 0 ? 'pos' : 'neg'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toLocaleString('pt-BR')}{unit}</em>;
}

// ---------- gráficos (SVG, uma série, um eixo) ----------
const W = 320, H = 170, PAD = { l: 40, r: 12, t: 14, b: 26 };
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v) ?? v;
}

function LineChart({ title, points, fmt }: { title: string; points: { day: string; value: number }[]; fmt: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="q-meta pad">Faça este exercício em pelo menos 2 treinos para ver a linha de progressão.</p>;
  const max = niceMax(Math.max(...points.map(p => p.value)) * 1.1);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
  const shown = hover ?? points.length - 1;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1)))));
  };
  const first = points[0].value, last = points[points.length - 1].value;
  return (
    <figure className="chart">
      <figcaption><span>{title}</span><b>{fmt(points[shown].value)} <small>em {dayShort(points[shown].day)}</small></b></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: de ${fmt(first)} para ${fmt(last)}`}
        onPointerMove={e => pick(e.clientX, e.currentTarget)} onPointerDown={e => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={PAD.l - 6} y={y(max * f) + 3} className="tick" textAnchor="end">{Math.round(max * f).toLocaleString('pt-BR')}</text>
          </g>
        ))}
        <path d={area} className="area" />
        <path d={path} className="line" />
        <line x1={x(shown)} x2={x(shown)} y1={PAD.t} y2={H - PAD.b} className="cross" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={i === shown ? 5 : 4} className={`dot${i === shown ? ' on' : ''}`} />)}
        <text x={x(0)} y={H - 8} className="tick" textAnchor="start">{dayShort(points[0].day)}</text>
        <text x={x(points.length - 1)} y={H - 8} className="tick" textAnchor="end">{dayShort(points[points.length - 1].day)}</text>
      </svg>
      <p className="q-meta">De {fmt(first)} para {fmt(last)} em {points.length} treinos{last > first ? ` (+${Math.round(((last - first) / (first || 1)) * 100)}%)` : ''}. Toque no gráfico para ver cada treino.</p>
    </figure>
  );
}

function BarChart({ points, fmt }: { points: { label: string; value: number }[]; fmt: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.map(p => p.value)));
  const slot = (W - PAD.l - PAD.r) / points.length;
  const bw = Math.min(26, slot - 6);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const shown = hover ?? points.length - 1;
  return (
    <figure className="chart">
      <figcaption><span>Semana de {points[shown].label}</span><b>{fmt(points[shown].value)}</b></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutos de treino por semana nas últimas 8 semanas" onPointerLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={PAD.l - 6} y={y(max * f) + 3} className="tick" textAnchor="end">{Math.round(max * f)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const h = Math.max(p.value ? 2 : 0, H - PAD.b - y(p.value));
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              <path className={`bar${i === shown ? ' on' : ''}`} d={h ? `M${cx - bw / 2},${H - PAD.b} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z` : ''} />
              {i % 2 === points.length % 2 && <text x={cx} y={H - 8} className="tick" textAnchor="middle">{p.label}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
