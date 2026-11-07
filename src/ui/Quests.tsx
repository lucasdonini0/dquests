import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CAT, CATEGORIES, DIFF, DIFFS, catTone, type CatId, type Diff } from '../game/data';
import { dailyDue, isFailed, questMult, PUBLIC_BONUS, doneCount, perDayOf, weeklyDays, COUNT_WEEK_DAYS, dueInfo, dueQuests, dueSlot, dueMult, extraBonus, hearthReadyIn, lateHeat, luck, notYourDay, objectiveXp, objProgress, questQuality, useGame, weeklyProgress, type Objective, type Quest, type QuestType } from '../game/store';
import { addDays, dayKey, objectiveShare, parseDay, xpRange, EARLY_MAX, EARLY_STEP, LATE_MAX, LATE_STEP, restedPerLeisure, WEEKDAY_SHORT, WEEKLY_FACTOR, XP_MULT } from '../game/rules';
import { Icon } from './Icon';
import { play } from '../fx/sound';
import { DungeonMark, Empty, PanelHeader, QIcon, Sheet } from './parts';
import { Hearthstone } from './Hearthstone';
import { buzz } from '../fx/haptics';
import { AddFab } from './AddFab';
import { HabitEditor } from './Habits';

const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.0', '').replace('.', ',')}%`;

const TYPE_LABEL: Record<QuestType, string> = { daily: 'Diária', weekly: 'Semanal', once: 'Avulsa' };

function rewardText(cat: CatId, diff: Diff, type: QuestType, mult = 1, reps = 1): string {
  if (cat === 'lazer') return `+${restedPerLeisure(useGame.getState().level) * reps} descanso${reps > 1 ? ' no fim' : ''}`;
  if (reps > 1) return `${rewardText(cat, diff, type, mult * reps)} no fim`;
  const r = xpRange(cat, diff, type === 'weekly' ? WEEKLY_FACTOR : 1);
  return `${Math.round(r.min * mult)}–${Math.round(r.max * mult)} XP`;
}

const fmtDue = (q: Quest) => {
  const d = parseDay(q.due!);
  return `${WEEKDAY_SHORT[(d.getDay() + 6) % 7].toLowerCase()} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${q.dueTime ? ` ${q.dueTime}` : ''}`;
};

/** Texto e tom do prazo: folga, perto, hoje ou atrasada. */
export function dueLabel(q: Quest) {
  if (q.type === 'once' && q.onlyDay && q.due && !q.doneOn) {
    return q.due === dayKey()
      ? { text: `só hoje${q.dueTime ? ` · até ${q.dueTime}` : ''}`, tone: 'today' }
      : { text: `só no dia ${fmtDue(q)} · antes disso fica travada`, tone: 'ok' };
  }
  const d = dueInfo(q);
  if (!d) return null;
  if (d.late) return { text: `atrasada ${d.lateDays} ${d.lateDays === 1 ? 'dia' : 'dias'} · −${Math.round(Math.min(LATE_MAX, LATE_STEP * d.lateDays) * 100)}% XP`, tone: 'late' };
  if (d.days === 0) return { text: `vence hoje${q.dueTime ? ` às ${q.dueTime}` : ''}`, tone: 'today' };
  const bonus = Math.round(Math.min(EARLY_MAX, EARLY_STEP * d.days) * 100);
  const when = d.days === 1 ? `vence amanhã${q.dueTime ? ` às ${q.dueTime}` : ''}` : `vence em ${d.days} dias (${fmtDue(q)})`;
  return { text: `${when} · +${bonus}% se entregar hoje`, tone: d.days <= 2 ? 'soon' : 'ok' };
}

// acima disso as bolinhas não cabem na linha: vira barra
const MAX_PIPS = 10;

function QuestRow({ q, onEdit }: { q: Quest; onEdit: (q: Quest) => void }) {
  const today = dayKey();
  const s = useGame();
  const c = CAT[q.cat];
  const [open, setOpen] = useState(false);
  const prog = q.type === 'weekly' ? weeklyProgress(s, q, today) : 0;
  const times = doneCount(s, q.id, today);
  const perDay = perDayOf(q);
  const doneToday = times > 0;
  const byCount = q.type === 'weekly' && !!q.count; // semanal por quantidade: soma quanto fez, várias vezes no dia
  const done = q.type === 'weekly' ? prog >= q.quota : times >= perDay;
  const restToday = q.type === 'weekly' && !byCount && doneToday && !done; // semanal: uma vez por dia
  const [amount, setAmount] = useState(1);
  const failed = isFailed(q, today);
  const locked = done || restToday || failed;
  const waiting = !locked && notYourDay(q, today); // "só neste dia": ainda não é o dia
  const cursed = s.debuffs.some(d => d.kind === 'maldicao' && d.questId === q.id && d.from <= today);
  const p = objProgress(s, q, today);
  const hasObj = p.total + p.extraTotal > 0;
  const ready = hasObj && p.ready && !locked;
  const objXp = Math.round(objectiveXp(q) * questMult(q));
  const quality = questQuality(q);
  const due = dueLabel(q);

  const meta = [c.label, DIFF[q.diff].label];
  if (q.type === 'daily' && q.days.length < 7) meta.push(q.days.map(d => WEEKDAY_SHORT[d]).join(' '));
  if (perDay > 1) meta.push(`${perDay}× por dia`);
  if (q.type === 'weekly') meta.push(restToday ? 'feito hoje, volta amanhã' : byCount ? `meta de ${q.quota} · fecha dom` : 'fecha dom');
  if (q.cat === 'trabalho' && q.paid) meta.push('dá dinheiro');

  const tap = () => {
    // com extras por fazer, o toque abre a lista para dar chance de pegar o bônus antes de entregar
    // por quantidade, o toque abre o campo para dizer quantos fez
    if (byCount || (hasObj && !p.ready) || (p.extraTotal > 0 && p.extrasPending && !open)) {
      if (hasObj) void play(open ? 'objClose' : 'objOpen');
      setOpen(v => !v);
    }
    else s.completeQuest(q.id);
  };

  return (
    <div className="quest-wrap">
      <div className={`quest${done ? ' done' : ''}${failed ? ' failed' : ''}${restToday ? ' resting' : ''}${cursed ? ' cursed' : ''}${ready ? ' ready' : ''}${due?.tone === 'late' ? ' overdue' : ''}${waiting ? ' waiting' : ''}`} data-anchor={q.id}
        style={due?.tone === 'late' ? { ['--late' as string]: lateHeat(dueInfo(q)!.lateDays) } : undefined}>
        <button className="quest-hit" disabled={locked || waiting} onClick={tap} aria-label={byCount ? `Somar em ${q.name}` : ready ? `Entregar ${q.name}` : hasObj ? `Ver objetivos de ${q.name}` : `Concluir ${q.name}`} aria-expanded={hasObj || byCount ? open : undefined}>
          <QIcon icon={c.icon} quality={quality} />
          <span className="q-main">
            <span className={`q-name c-${quality} con-${q.diff}`}>
              {q.name}
              {failed && <span className="elite red">FALHOU</span>}
              {due?.tone === 'late' && <span className="elite red">ATRASADA</span>}
              {q.type === 'weekly' && <span className="elite">ELITE</span>}
              {cursed && <span className="elite red">REDENÇÃO</span>}
            </span>
            <span className="q-meta">{meta.join(' · ')}</span>
            {q.note && <span className="q-note"><Icon id="edit" size={11} /> {q.note}</span>}
            {due && !locked && <span className={`due ${due.tone}`}><Icon id="clock" size={11} /> {due.text}</span>}
            {perDay > 1 && (perDay > MAX_PIPS
              ? <span className="pips count"><span className="count-bar"><i style={{ width: `${Math.min(100, (times / perDay) * 100)}%` }} /></span><b>{times}/{perDay} hoje</b></span>
              : <span className="pips">{Array.from({ length: perDay }, (_, i) => <i key={i} className={i < times ? 'on' : ''} />)}<b>{times}/{perDay} hoje</b></span>
            )}
            {byCount && (
              <span className="pips count"><span className="count-bar"><i style={{ width: `${Math.min(100, (prog / q.quota) * 100)}%` }} /></span><b>{prog}/{q.quota}</b></span>
            )}
            {q.type === 'weekly' && !byCount && q.quota > 1 && (
              <span className="pips">{Array.from({ length: q.quota }, (_, i) => <i key={i} className={i < prog ? 'on' : ''} />)}<b>{prog}/{q.quota}</b></span>
            )}
            {hasObj && !locked && (
              <span className="pips obj">
                {Array.from({ length: p.total }, (_, i) => <i key={i} className={i < p.count ? 'on' : ''} />)}
                {Array.from({ length: p.extraTotal }, (_, i) => <i key={`x${i}`} className={`extra${i < p.extraDone ? ' on' : ''}`} />)}
                <b>{p.total > 0 && `${p.count}/${p.total} objetivos`}{p.total > 0 && p.extraTotal > 0 && ' · '}{p.extraTotal > 0 && `${p.extraDone}/${p.extraTotal} extras`}</b>
              </span>
            )}
          </span>
          {q.cat === 'social' && <DungeonMark green={q.inPublic} />}
          <span className={`q-xp${q.cat === 'lazer' ? ' c-rested' : ''}`}>{failed ? <Icon id="x" size={18} /> : locked ? <Icon id="check" size={18} /> : byCount ? `${rewardText(q.cat, q.diff, q.type, COUNT_WEEK_DAYS)} na meta` : rewardText(q.cat, q.diff, q.type, questMult(q) * (1 + extraBonus(p.extraDone)), perDay)}</span>
          {ready && <span className="turnin" aria-hidden="true">?</span>}
        </button>
        {q.type !== 'once' && (failed || !(done || restToday)) && (
          <button className={`q-edit q-fail${failed ? ' on' : ''}`} onClick={() => s.failQuest(q.id)}
            aria-label={failed ? `Desmarcar falha de ${q.name}` : `Marcar ${q.name} como falhou`} title={failed ? 'Desmarcar falha' : q.type === 'weekly' ? 'Falhou nesta semana' : 'Falhou hoje'}>
            <Icon id={failed ? 'undo' : 'x'} size={16} />
          </button>
        )}
        <button className="q-edit" onClick={() => onEdit(q)} aria-label={`Editar ${q.name}`}><Icon id="edit" size={16} /></button>
      </div>
      {(hasObj || byCount) && open && !locked && (
        <div className="objectives">
          {(q.objectives ?? []).map(o => {
            const checked = p.done.has(o.id);
            return (
              <button key={o.id} className={`obj${checked ? ' on' : ''}${o.extra ? ' extra' : ''}`} disabled={checked} onClick={() => s.completeObjective(q.id, o.id)}>
                <span className="box">{checked && <Icon id="check" size={14} />}</span>
                <span className="obj-text">{o.extra && <span className="obj-tag">EXTRA</span>}{o.text}</span>
                {!checked && (o.extra ? <small className="c-gold">+10% na entrega</small> : objXp > 0 && <small>+{objXp} XP</small>)}
              </button>
            );
          })}
          {byCount
            ? (
              <div className="count-add">
                <CountInput id={`count-${q.id}`} value={amount} min={1} max={Math.max(1, q.quota - prog)} onChange={setAmount} suffix={`de ${q.quota - prog} que faltam`} digits={4} />
                <button className="btn gold small" disabled={hasObj && !p.ready} onClick={() => { s.completeQuest(q.id, amount); setAmount(1); }}>Somar</button>
              </div>
            )
            : p.ready && <button className="btn gold small turnin-btn" onClick={() => s.completeQuest(q.id)}>Entregar missão</button>}
        </div>
      )}
    </div>
  );
}

const HOLD_MS = 220; // toque: segurar isso para levantar (mexer antes é rolagem)
const MOUSE_START = 4; // mouse: arrastar alguns pixels já levanta

/** Lista que dá para reordenar arrastando (no celular, segure antes). Só troca de lugar dentro do mesmo grupo
 *  (prazos: mesmo dia e hora; diárias e semanais: a seção toda). */
function SortList({ quests, onEdit, groupOf, onOrder }: { quests: Quest[]; onEdit: (q: Quest) => void; groupOf: (q: Quest) => string; onOrder: (ids: string[]) => void }) {
  const [drag, setDrag] = useState<{ id: string; slot: string; order: string[] } | null>(null);
  const hold = useRef<{ q: Quest; x: number; y: number; mouse: boolean; el: HTMLElement; pid: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const grab = useRef({ offset: 0, y: 0 }); // onde o dedo pegou na linha e onde ele está, relativo à lista
  const tops = useRef(new Map<string, number>());
  const eatClick = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  // no celular, enquanto arrasta a tela não rola
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const block = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  // durante o arraste, o grupo daquele dia aparece na ordem nova
  let list = quests;
  if (drag) {
    const byId = new Map(quests.map(q => [q.id, q]));
    const group = drag.order.map(id => byId.get(id)!).filter(Boolean);
    const start = quests.findIndex(q => groupOf(q) === drag.slot);
    list = [...quests.slice(0, start), ...group, ...quests.slice(start + group.length)];
  }

  const rowsOf = () => [...(box.current?.querySelectorAll<HTMLElement>('[data-due-id]') ?? [])];
  const rowOf = (id: string) => box.current?.querySelector<HTMLElement>(`[data-due-id="${id}"]`) ?? null;

  /** A linha levantada segue o dedo, presa entre a primeira e a última do mesmo dia. */
  const follow = () => {
    const d = dragRef.current;
    const el = d && rowOf(d.id);
    if (!d || !el) return;
    const group = rowsOf().filter(r => r.dataset.dueSlot === d.slot);
    const min = Math.min(...group.map(r => r.offsetTop)), max = Math.max(...group.map(r => r.offsetTop));
    const want = Math.max(min, Math.min(max, grab.current.y - grab.current.offset));
    el.style.transform = `translateY(${want - el.offsetTop}px)`;
  };

  // as outras linhas deslizam para o lugar novo em vez de pular
  useLayoutEffect(() => {
    for (const el of rowsOf()) {
      const id = el.dataset.dueId!;
      const before = tops.current.get(id);
      if (before !== undefined && before !== el.offsetTop && id !== dragRef.current?.id) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${before - el.offsetTop}px)`;
        void el.offsetHeight;
        el.style.transition = 'transform .16s ease';
        el.style.transform = '';
      }
      tops.current.set(id, el.offsetTop);
    }
    follow();
  });

  const cancelHold = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };

  const lift = () => {
    const h = hold.current;
    if (!h) return;
    clearTimeout(h.timer);
    hold.current = null;
    const slot = groupOf(h.q);
    try { h.el.setPointerCapture(h.pid); } catch { /* o dedo já saiu */ }
    const top = box.current!.getBoundingClientRect().top;
    grab.current = { offset: h.y - top - h.el.offsetTop, y: h.y - top };
    h.el.style.transition = 'none';
    setDrag({ id: h.q.id, slot, order: quests.filter(x => groupOf(x) === slot).map(x => x.id) });
    if (!h.mouse) buzz('light');
  };

  const down = (e: React.PointerEvent<HTMLDivElement>, q: Quest) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input, .objectives, .q-edit')) return; // campo, objetivos e lápis não arrastam
    if (quests.filter(x => groupOf(x) === groupOf(q)).length < 2) return;
    const mouse = e.pointerType === 'mouse';
    hold.current = { q, x: e.clientX, y: e.clientY, mouse, el: e.currentTarget, pid: e.pointerId, timer: setTimeout(lift, mouse ? 350 : HOLD_MS) };
  };

  const move = (e: React.PointerEvent) => {
    const h = hold.current;
    if (h) {
      const dist = Math.hypot(e.clientX - h.x, e.clientY - h.y);
      if (h.mouse && dist > MOUSE_START) lift();
      else if (!h.mouse && dist > 8) cancelHold(); // mexeu antes da hora: é rolagem
    }
    const d = dragRef.current;
    if (!d) return;
    grab.current.y = e.clientY - box.current!.getBoundingClientRect().top;
    follow();
    // a posição nova é quantas das outras linhas do dia têm o meio acima do meio da levantada
    const el = rowOf(d.id)!;
    const center = grab.current.y - grab.current.offset + el.offsetHeight / 2;
    const others = d.order.filter(id => id !== d.id);
    const to = others.filter(id => { const r = rowOf(id)!; return r.offsetTop + r.offsetHeight / 2 < center; }).length;
    if (to === d.order.indexOf(d.id)) return;
    setDrag({ ...d, order: [...others.slice(0, to), d.id, ...others.slice(to)] });
  };

  const up = () => {
    cancelHold();
    const d = dragRef.current;
    if (!d) return;
    // a linha desliza até o lugar dela
    const el = rowOf(d.id);
    if (el) { el.style.transition = 'transform .16s ease'; el.style.transform = ''; }
    setDrag(null);
    onOrder(d.order);
    // soltar não conta como concluir a missão
    eatClick.current = true;
    setTimeout(() => { eatClick.current = false; }, 80);
  };

  return (
    <div ref={box} className="due-list">
      {list.map(q => (
        <div key={q.id} className={`due-item${drag?.id === q.id ? ' lifted' : ''}`} data-due-slot={groupOf(q)} data-due-id={q.id}
          onPointerDown={e => down(e, q)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onContextMenu={e => { if (hold.current || dragRef.current) e.preventDefault(); }}
          onClickCapture={e => { if (eatClick.current) { e.stopPropagation(); e.preventDefault(); eatClick.current = false; } }}>
          <QuestRow q={q} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
}

export function QuestsScreen() {
  const s = useGame();
  const today = dayKey();
  const [editing, setEditing] = useState<Quest | 'new' | null>(null);
  const [newHabit, setNewHabit] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // diárias e semanais na ordem que você arrumou (sem ordem: a de criação)
  const byRank = (a: Quest, b: Quest) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || 0;
  const daily = s.quests.filter(q => dailyDue(q, today)).sort(byRank);
  const notToday = s.quests.filter(q => q.type === 'daily' && !dailyDue(q, today));
  const withDue = dueQuests(s.quests);
  // concluídas de outro dia não aparecem, mesmo antes da virada rodar
  const once = s.quests.filter(q => q.type === 'once' && !withDue.includes(q) && (!q.doneOn || q.doneOn >= today));
  const lateCount = withDue.filter(q => dueInfo(q)?.late).length;
  const weekly = s.quests.filter(q => q.type === 'weekly').sort(byRank);
  const dDone = daily.filter(q => doneCount(s, q.id, today) >= perDayOf(q)).length;
  const wDone = weekly.filter(q => weeklyProgress(s, q, today) >= q.quota).length;
  const readyIn = hearthReadyIn(s, today);
  const protectedToday = s.hearth.protectedDays.includes(today);

  return (
    <>
      {s.quests.length === 0 ? (
        <Empty icon="scroll" title="Seu diário de missões está vazio"
          text="Crie uma missão, escolha a categoria e a dificuldade. O XP é sorteado dentro da faixa delas."
          action={<button className="btn gold" onClick={() => setEditing('new')}><Icon id="plus" size={16} /> Criar primeira missão</button>} />
      ) : (
        <>
          {withDue.length > 0 && <>
            <PanelHeader right={lateCount ? `${lateCount} atrasada${lateCount > 1 ? 's' : ''}` : 'por data de entrega'}>Prazos</PanelHeader>
            <SortList quests={withDue} onEdit={setEditing} groupOf={dueSlot} onOrder={s.setDueOrder} />
          </>}

          <PanelHeader right={`${dDone}/${daily.length} · renova 00:00`}>Diárias</PanelHeader>
          {daily.length === 0 && <p className="q-meta pad">Nenhuma diária para hoje.</p>}
          <SortList quests={daily} onEdit={setEditing} groupOf={() => 'daily'} onOrder={s.setQuestOrder} />

          {once.length > 0 && <>
            <PanelHeader right="uma vez só">Avulsas</PanelHeader>
            {once.map(q => <QuestRow key={q.id} q={q} onEdit={setEditing} />)}
          </>}

          {weekly.length > 0 && <>
            <PanelHeader right={`${wDone}/${weekly.length} · fecha dom`}>Semanais</PanelHeader>
            <SortList quests={weekly} onEdit={setEditing} groupOf={() => 'weekly'} onOrder={s.setQuestOrder} />
          </>}

          {notToday.length > 0 && (
            <button className="link-btn" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Esconder' : 'Mostrar'} diárias de outros dias ({notToday.length})
            </button>
          )}
          {showAll && notToday.map(q => (
            <div key={q.id} className="quest off">
              <span className="quest-hit">
                <QIcon icon={CAT[q.cat].icon} quality={catTone(CAT[q.cat])} />
                <span className="q-main"><span className="q-name">{q.name}</span><span className="q-meta">{q.days.map(d => WEEKDAY_SHORT[d]).join(' ')}</span></span>
              </span>
              <button className="q-edit" onClick={() => setEditing(q)} aria-label={`Editar ${q.name}`}><Icon id="edit" size={16} /></button>
            </div>
          ))}
        </>
      )}

      <PanelHeader right={readyIn > 0 ? `recarga: ${readyIn} ${readyIn === 1 ? 'dia' : 'dias'}` : 'pronta'}>Imprevisto</PanelHeader>
      <Hearthstone readyIn={readyIn} protectedToday={protectedToday} onUse={s.useHearth} />

      <AddFab own="quest" onPick={k => (k === 'quest' ? setEditing('new') : setNewHabit(true))} />

      {editing && <QuestEditor quest={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {newHabit && <HabitEditor habit={null} onClose={() => setNewHabit(false)} />}
    </>
  );
}

export function CategoryPicker({ value, onChange }: { value: CatId; onChange: (c: CatId) => void }) {
  return (
    <div className="cat-grid">
      {CATEGORIES.map(c => (
        <button key={c.id} className={`cat-chip c-${catTone(c)}${value === c.id ? ' on' : ''}`} onClick={() => onChange(c.id)} type="button">
          <Icon id={c.icon} size={18} />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Número digitado (aceita apagar para escrever outro); fora da faixa, volta para o limite ao sair do campo. */
function CountInput({ id, value, min, max, onChange, suffix, digits = 2 }: { id: string; value: number; min: number; max: number; onChange: (n: number) => void; suffix: string; digits?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value && text !== '') setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <span className="count-input">
      <input id={id} type="text" inputMode="numeric" value={text}
        onChange={e => { const t = e.target.value.replace(/\D/g, '').slice(0, digits); setText(t); if (t) onChange(clamp(Number(t))); }}
        onBlur={() => { const n = clamp(Number(text) || min); setText(String(n)); onChange(n); }} />
      <span>{suffix}</span>
    </span>
  );
}

export function QuestEditor({ quest, onClose }: { quest: Quest | null; onClose: () => void }) {
  const save = useGame(s => s.saveQuest);
  const del = useGame(s => s.deleteQuest);
  const [name, setName] = useState(quest?.name ?? '');
  const [cat, setCat] = useState<CatId>(quest?.cat ?? 'casa');
  const [diff, setDiff] = useState<Diff>(quest?.diff ?? 'normal');
  const [type, setType] = useState<QuestType>(quest?.type ?? 'daily');
  const [days, setDays] = useState<number[]>(quest?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [quota, setQuota] = useState(quest?.quota ?? 1);
  const [multi, setMulti] = useState((quest?.perDay ?? 1) > 1);
  const [byCount, setByCount] = useState(!!quest?.count);
  const [inPublic, setInPublic] = useState(!!quest?.inPublic);
  const [perDay, setPerDay] = useState(Math.max(2, quest?.perDay ?? 2));
  const [paid, setPaid] = useState(quest?.paid ?? false);
  const [objs, setObjs] = useState<Objective[]>(quest?.objectives ?? []);
  const [due, setDue] = useState(quest?.due ?? '');
  const [dueTime, setDueTime] = useState(quest?.dueTime ?? '');
  const [onlyDay, setOnlyDay] = useState(quest?.onlyDay ?? false);
  const [note, setNote] = useState(quest?.note ?? '');
  const [newObj, setNewObj] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const valid = name.trim().length > 0 && (type !== 'daily' || days.length > 0);
  const r = xpRange(cat, diff, type === 'weekly' ? WEEKLY_FACTOR : 1);
  const elite = Math.round(CAT[cat].base * DIFF[diff].mult * WEEKLY_FACTOR * (byCount ? COUNT_WEEK_DAYS : quota) * XP_MULT);
  const cleanObjs = objs.map(o => ({ ...o, text: o.text.trim() })).filter(o => o.text);
  const reqObjs = cleanObjs.filter(o => !o.extra);
  const extraObjs = cleanObjs.filter(o => o.extra);
  const share = objectiveShare(reqObjs.length);
  const perObj = reqObjs.length ? Math.max(1, Math.round(((r.min + r.max) / 2) * share / reqObjs.length)) : 0;

  // reordenar: arrasta pelo número (mouse ou dedo) ou usa as setas do teclado nele
  const [dragId, setDragId] = useState<string | null>(null);
  const moveObj = (id: string, to: number) => setObjs(v => {
    const from = v.findIndex(x => x.id === id);
    const dest = Math.max(0, Math.min(v.length - 1, to));
    if (from < 0 || from === dest) return v;
    const next = [...v];
    const [item] = next.splice(from, 1);
    next.splice(dest, 0, item);
    return next;
  });
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const rows = [...(e.currentTarget.closest('.field')?.querySelectorAll<HTMLElement>('[data-obj]') ?? [])];
    let to = rows.findIndex(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (to < 0) to = rows.length; // abaixo de todas: vai para o fim
    const from = rows.findIndex(r => r.dataset.obj === dragId);
    if (to > from) to--; // a própria linha ainda está na lista
    moveObj(dragId, to);
  };

  const addObj = () => {
    const text = newObj.trim();
    if (!text) return;
    setObjs(v => [...v, { id: Math.random().toString(36).slice(2, 10), text }]);
    setNewObj('');
  };

  const submit = () => {
    if (!valid) return;
    save({ id: quest?.id, name: name.trim(), cat, diff, type, days: [...days].sort(), quota: type === 'weekly' && !byCount ? Math.min(7, quota) : quota, count: type === 'weekly' && byCount ? true : undefined, inPublic: cat === 'social' && inPublic ? true : undefined, perDay: type === 'daily' && multi && perDay > 1 ? perDay : undefined, paid: cat === 'trabalho' && paid, objectives: cleanObjs,
      due: type === 'once' && due ? due : undefined, dueTime: type === 'once' && due && dueTime ? dueTime : undefined,
      onlyDay: type === 'once' && !!due && onlyDay ? true : undefined, note: note.trim() || undefined });
    if (!quest) void play('questNew');
    onClose();
  };

  return (
    <Sheet title={quest ? 'Editar missão' : 'Nova missão'} onClose={onClose}
      footer={<>
        {quest && (confirmDel
          ? <button className="btn red" onClick={() => { del(quest.id); void play('questDelete'); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!valid} onClick={submit}>{quest ? 'Salvar' : 'Criar missão'}</button>
      </>}>
      <label className="field">
        <span>Nome</span>
        <input id="quest-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Arrumar o quarto" maxLength={60} autoFocus={!quest} />
      </label>

      <div className="field"><span>Categoria</span><CategoryPicker value={cat} onChange={setCat} /></div>

      {cat !== 'lazer' && (
        <div className="field"><span>Dificuldade</span>
          <div className="seg">{DIFFS.map(d => <button key={d.id} type="button" className={diff === d.id ? 'on' : ''} onClick={() => setDiff(d.id)}>{d.label}</button>)}</div>
        </div>
      )}

      <div className="field"><span>Tipo</span>
        <div className="seg">{(['daily', 'weekly', 'once'] as QuestType[]).map(t => <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}</div>
      </div>

      {cat === 'trabalho' && (
        <label className="toggle paid">
          <input id="quest-paid" type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />
          <span><b>Me dá dinheiro</b><small>O XP do atributo é dividido entre Maestria e Fortuna.</small></span>
        </label>
      )}

      {type === 'daily' && (
        <div className="field"><span>Dias da semana</span>
          <div className="days">{WEEKDAY_SHORT.map((d, i) => (
            <button key={d} type="button" className={days.includes(i) ? 'on' : ''}
              onClick={() => setDays(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i])}>{d}</button>
          ))}</div>
        </div>
      )}
      {cat === 'social' && (
        <label className="toggle paid">
          <input id="quest-public" type="checkbox" checked={inPublic} onChange={e => setInPublic(e.target.checked)} />
          <span><b>Em público</b><small>+{Math.round(PUBLIC_BONUS * 100)}% de XP. O ícone de masmorra fica verde.</small></span>
        </label>
      )}

      {type === 'daily' && (
        <>
          <label className="toggle">
            <input id="quest-multi" type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} /> Várias vezes por dia
          </label>
          {multi && (
            <label className="field"><span>Vezes por dia</span>
              <CountInput id="quest-per-day" value={perDay} min={2} max={50} onChange={setPerDay} suffix="× por dia" />
              <small className="q-meta">O XP vem todo na última vez do dia: {perDay}× o XP da missão. As vezes antes só marcam o progresso. Se tiver objetivos, eles voltam a cada vez.</small>
            </label>
          )}
        </>
      )}
      {type === 'weekly' && (
        <div className="field"><span>Como contar</span>
          <div className="seg">
            <button type="button" className={!byCount ? 'on' : ''} onClick={() => { setByCount(false); setQuota(q => Math.min(7, q)); }}>Dias na semana</button>
            <button type="button" className={byCount ? 'on' : ''} onClick={() => setByCount(true)}>Quantidade</button>
          </div>
          {byCount
            ? <>
                <CountInput key="qty" id="quest-quota" value={quota} min={1} max={9999} onChange={setQuota} suffix="na semana (ex.: 140 clientes)" digits={4} />
                <small className="q-meta">Cada vez que tocar na missão, você diz quantos fez (pode somar várias vezes no dia). Completar a meta vale o XP de {COUNT_WEEK_DAYS} dias de semanal, dividido pelo que você soma, mais o bônus Elite.</small>
              </>
            : <>
                <CountInput key="days" id="quest-quota" value={quota} min={1} max={7} onChange={setQuota} suffix="dias na semana" />
                <small className="q-meta">Uma vez por dia, em dias diferentes.</small>
              </>}
        </div>
      )}

      {type === 'once' && (
        <div className="field"><span>Prazo (opcional)</span>
          <div className="due-edit">
            <input id="quest-due" type="date" value={due} min={quest?.due && quest.due < dayKey() ? quest.due : dayKey()} onChange={e => setDue(e.target.value)} />
            <input id="quest-due-time" type="time" value={dueTime} disabled={!due} onChange={e => setDueTime(e.target.value)} aria-label="Hora do prazo" />
            {due && <button type="button" className="icon-btn" onClick={() => { setDue(''); setDueTime(''); }} aria-label="Tirar prazo"><Icon id="x" size={16} /></button>}
          </div>
          <div className="due-quick">
            {[['Hoje', 0], ['Amanhã', 1], ['3 dias', 3], ['1 semana', 7]].map(([label, n]) => (
              <button key={label as string} type="button" className="btn small" onClick={() => setDue(addDays(dayKey(), n as number))}>{label}</button>
            ))}
          </div>
          <label className="toggle paid">
            <input id="quest-only-day" type="checkbox" checked={onlyDay} onChange={e => { setOnlyDay(e.target.checked); if (e.target.checked && !due) setDue(dayKey()); }} />
            <span><b>Só neste dia</b><small>Não dá para fazer antes nem depois. Se o dia passar sem fazer, ela some da lista, sem atraso nem penalidade (e sem o XP).</small></span>
          </label>
          {due && !onlyDay && <p className="q-meta">Entregar antes dá +5% de XP por dia de folga (até +25%). Atrasada, ela perde 10% por dia (até a metade), pisca em vermelho e você fica com −10% de XP até entregar.</p>}
        </div>
      )}

      <div className="field"><span>Objetivos (opcional)</span>
        {objs.map((o, i) => (
          <div key={o.id} className={`obj-edit${dragId === o.id ? ' dragging' : ''}`} data-obj={o.id}>
            <button type="button" className="obj-n obj-grip" aria-label={`Mover objetivo ${i + 1} (${o.text})`} title="Arraste para reordenar"
              onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragId(o.id); }}
              onPointerMove={onDragMove}
              onPointerUp={() => setDragId(null)} onPointerCancel={() => setDragId(null)}
              onKeyDown={e => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveObj(o.id, i + (e.key === 'ArrowUp' ? -1 : 1));
                  const btn = e.currentTarget;
                  requestAnimationFrame(() => btn.focus());
                }
              }}>
              {i + 1}
            </button>
            <input id={`quest-obj-${o.id}`} value={o.text} maxLength={60} onChange={e => setObjs(v => v.map(x => x.id === o.id ? { ...x, text: e.target.value } : x))} />
            <button type="button" className={`obj-kind${o.extra ? ' extra' : ''}`} role="switch" aria-checked={!!o.extra}
              onClick={() => setObjs(v => v.map(x => x.id === o.id ? { ...x, extra: !x.extra } : x))}
              aria-label={`${o.text}: ${o.extra ? 'extra' : 'essencial'}`}>{o.extra ? 'Extra' : 'Essencial'}</button>
            <button type="button" className="icon-btn" onClick={() => setObjs(v => v.filter(x => x.id !== o.id))} aria-label={`Remover objetivo ${o.text}`}><Icon id="x" size={16} /></button>
          </div>
        ))}
        <div className="obj-edit">
          <span className="obj-n">+</span>
          <input id="quest-obj-new" value={newObj} maxLength={60} placeholder={objs.length ? 'Outro objetivo' : 'Ex.: Levantar os dados'}
            onChange={e => setNewObj(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addObj(); } }} />
          <button type="button" className="btn small" disabled={!newObj.trim()} onClick={addObj}>Adicionar</button>
        </div>
        <p className="q-meta">
          {type === 'once' ? 'O progresso fica salvo até você entregar.' : type === 'daily' ? 'Os objetivos zeram todo dia.' : 'Os objetivos zeram a cada vez que você conclui.'}
          {' '}Toque em Essencial/Extra para alternar. Com todos os essenciais marcados, a missão ganha um <b style={{ color: 'var(--gold)' }}>?</b> para entregar.
        </p>
      </div>

      <label className="field">
        <span>Notas (opcional)</span>
        <textarea id="quest-note" className="backup" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: link, detalhes, onde parei..." maxLength={500} rows={3} />
      </label>

      <div className="reward">
        <span className="eyebrow">Recompensa</span>
        {cat === 'lazer'
          ? <p><b className="c-rested">+{restedPerLeisure(useGame.getState().level)} de XP descansado</b> (5% da barra do nível) para amanhã. Lazer não dá XP na hora: ele dobra o XP das primeiras missões do dia seguinte.</p>
          : <p><b className={`c-${catTone(CAT[cat])}`}>{r.min}–{r.max} XP</b> sorteados {type === 'weekly' ? 'a cada vez' : 'ao concluir'}, com {fmtPct(luck(useGame.getState()))} de chance de crítico (XP em dobro).
              {type === 'weekly' && <> Ao fechar a cota: <b style={{ color: 'var(--gold)' }}>+{elite} XP de bônus Elite</b>.</>}</p>}
        {cat !== 'lazer' && cleanObjs.length > 0 && (
          <>
            {reqObjs.length > 0 && <p>Cada objetivo essencial dá <b className="c-uncommon">+{perObj} XP</b> na hora ({Math.round(share * 100)}% da missão no total). A entrega dá o resto.</p>}
            {extraObjs.length > 0 && <p>Cada extra feito antes da entrega soma <b style={{ color: 'var(--gold)' }}>+10% de XP</b> na entrega (até +50%). Extras não são obrigatórios.</p>}
          </>
        )}
        {type === 'weekly' && <p className="q-meta">Dá para marcar uma vez por dia.</p>}
        {type !== 'once' && cat !== 'lazer' && <p className="q-meta">{type === 'daily' ? 'Fazer menos da metade das diárias do dia gera Exaustão (−10% XP) no dia seguinte.' : 'Não fechar a cota até domingo gera a Maldição da Procrastinação (−20% XP).'}</p>}
      </div>
    </Sheet>
  );
}
