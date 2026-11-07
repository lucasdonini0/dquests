import { useState } from 'react';
import { CAT, catTone, type CatId } from '../game/data';
import { habitExtrasDone, useGame, HABIT_EXTRA_FACTOR, type Habit } from '../game/store';
import { dayKey, streakBonus, xpRange, HABIT_FACTOR, restedPerLeisure, STREAK_MAX_DAYS } from '../game/rules';
import { Icon } from './Icon';
import { Empty, PanelHeader, QIcon, Sheet } from './parts';
import { CategoryPicker, QuestEditor } from './Quests';
import { AddFab } from './AddFab';

export function HabitsScreen({ fab = true }: { fab?: boolean }) {
  const s = useGame();
  const today = dayKey();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [newQuest, setNewQuest] = useState(false);
  const done = s.habits.filter(h => h.lastDone === today).length;

  return (
    <>
      {s.habits.length === 0 ? (
        <Empty icon="flame" title="Nenhum hábito ainda"
          text="Hábitos são coisas pequenas de todo dia. Cada dia seguido soma +2% de XP, até +40%."
          action={<button className="btn gold" onClick={() => setEditing('new')}><Icon id="plus" size={16} /> Criar hábito</button>} />
      ) : (
        <>
          <PanelHeader right={`${done}/${s.habits.length} hoje · +2%/dia até +40%`}>Hábitos</PanelHeader>
          {s.habits.map(h => {
            const c = CAT[h.cat];
            const isDone = h.lastDone === today;
            const failed = !isDone && h.failed === today;
            const r = xpRange(h.cat, 'normal', HABIT_FACTOR);
            const b = streakBonus(h.streak);
            const extras = h.extras ?? [];
            const xDone = habitExtrasDone(s, h.id, today);
            const xr = xpRange(h.cat, 'normal', HABIT_EXTRA_FACTOR);
            return (
              <div key={h.id} className="quest-wrap habit-wrap">
              <div className={`quest${isDone ? ' done' : ''}${failed ? ' failed' : ''}${extras.length ? ' has-extras' : ''}`} data-anchor={h.id}>
                <button className="quest-hit" disabled={isDone || failed} onClick={() => s.completeHabit(h.id)} aria-label={`Marcar ${h.name}`}>
                  <QIcon icon={c.icon} quality={catTone(c)} />
                  <span className="q-main">
                    <span className={`q-name c-${catTone(c)}`}>{h.name}{failed && <span className="elite red">FALHOU</span>}</span>
                    <span className="q-meta">
                      {c.label} · {h.cat === 'lazer' ? `+${restedPerLeisure(s.level)} descanso` : `${Math.round(r.min * (1 + b))}–${Math.round(r.max * (1 + b))} XP`}
                      {b > 0 && ` · bônus +${Math.round(b * 100)}%`}
                      {h.scrolls > 0 && ` · ${h.scrolls} pergaminho${h.scrolls > 1 ? 's' : ''}`}
                    </span>
                  </span>
                  <span className={`flames${h.streak >= STREAK_MAX_DAYS ? ' max' : ''}${h.streak === 0 ? ' out' : ''}`}>
                    <Icon id="flame" size={14} />{h.streak}
                  </span>
                </button>
                {!isDone && (
                  <button className={`q-edit q-fail${failed ? ' on' : ''}`} onClick={() => s.failHabit(h.id)}
                    aria-label={failed ? `Desmarcar falha de ${h.name}` : `Marcar ${h.name} como não cumprido`} title={failed ? 'Desmarcar falha' : 'Não cumpri hoje'}>
                    <Icon id={failed ? 'undo' : 'x'} size={16} />
                  </button>
                )}
                <button className="q-edit" onClick={() => setEditing(h)} aria-label={`Editar ${h.name}`}><Icon id="edit" size={16} /></button>
              </div>
              {extras.length > 0 && (
                <div className="objectives habit-extras" data-anchor={`${h.id}-x`}>
                  {extras.map(x => {
                    const on = xDone.has(x.id);
                    return (
                      <button key={x.id} className={`obj extra${on ? ' on' : ''}`} disabled={on || !isDone} onClick={() => s.completeHabitExtra(h.id, x.id)}>
                        <span className="box">{on && <Icon id="check" size={14} />}</span>
                        <span className="obj-text"><span className="obj-tag">BÔNUS</span>{x.text}</span>
                        {!on && <small className="c-gold">{h.cat === 'lazer' ? `+${restedPerLeisure(s.level)} descanso` : `+${Math.round(xr.min * (1 + b))}–${Math.round(xr.max * (1 + b))} XP`}</small>}
                      </button>
                    );
                  })}
                  {!isDone && !failed && <p className="q-meta habit-extras-hint">Marque o hábito de hoje para liberar os bônus.</p>}
                </div>
              )}
              </div>
            );
          })}
          <PanelHeader>Proteção</PanelHeader>
          <p className="q-meta pad">A cada 7 dias seguidos você ganha um Pergaminho de Proteção (máx. 3 por hábito). Se esquecer um dia, ele é gasto sozinho e o streak continua. Marcar como não cumprido (o X) zera o streak na virada do dia, sem gastar pergaminho.</p>
        </>
      )}
      {fab && <AddFab own="habit" onPick={k => (k === 'habit' ? setEditing('new') : setNewQuest(true))} />}
      {editing && <HabitEditor habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {newQuest && <QuestEditor quest={null} onClose={() => setNewQuest(false)} />}
    </>
  );
}

export function HabitEditor({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const save = useGame(s => s.saveHabit);
  const del = useGame(s => s.deleteHabit);
  const [name, setName] = useState(habit?.name ?? '');
  const [cat, setCat] = useState<CatId>(habit?.cat ?? 'autocuidado');
  const [extras, setExtras] = useState(habit?.extras ?? []);
  const [newExtra, setNewExtra] = useState('');
  const addExtra = () => { const t = newExtra.trim(); if (!t) return; setExtras([...extras, { id: Math.random().toString(36).slice(2, 10), text: t }]); setNewExtra(''); };
  const xr = xpRange(cat, 'normal', HABIT_EXTRA_FACTOR);
  const [confirmDel, setConfirmDel] = useState(false);
  const valid = name.trim().length > 0;
  const r = xpRange(cat, 'normal', HABIT_FACTOR);

  return (
    <Sheet title={habit ? 'Editar hábito' : 'Novo hábito'} onClose={onClose}
      footer={<>
        {habit && (confirmDel
          ? <button className="btn red" onClick={() => { del(habit.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!valid} onClick={() => { save({ id: habit?.id, name: name.trim(), cat, extras: extras.filter(x => x.text.trim()) }); onClose(); }}>{habit ? 'Salvar' : 'Criar hábito'}</button>
      </>}>
      <label className="field">
        <span>Nome</span>
        <input id="habit-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Ler 20 páginas" maxLength={60} autoFocus={!habit} />
      </label>
      <div className="field"><span>Categoria</span><CategoryPicker value={cat} onChange={setCat} /></div>
      <div className="field"><span>Bônus extras (opcional)</span>
        {extras.map((x, i) => (
          <div key={x.id} className="obj-edit">
            <span className="q-meta">{i + 1}</span>
            <input id={`habit-extra-${i}`} value={x.text} maxLength={80} onChange={e => setExtras(extras.map(y => (y.id === x.id ? { ...y, text: e.target.value } : y)))} />
            <button type="button" className="icon-btn" onClick={() => setExtras(extras.filter(y => y.id !== x.id))} aria-label={`Remover ${x.text}`}><Icon id="x" size={16} /></button>
          </div>
        ))}
        <div className="obj-edit">
          <span className="q-meta">+</span>
          <input id="habit-extra-new" value={newExtra} maxLength={80} onChange={e => setNewExtra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} placeholder="Ex.: Ler 50 páginas em vez de 20" />
          <button type="button" className="btn small" disabled={!newExtra.trim()} onClick={addExtra}>Adicionar</button>
        </div>
        <small className="q-meta">Coisas a mais, por cima do hábito. Depois de marcar o hábito no dia, cada bônus feito dá XP de uma missão e meia.</small>
      </div>
      <div className="reward">
        <span className="eyebrow">Recompensa</span>
        {cat === 'lazer'
          ? <p><b className="c-rested">+{restedPerLeisure(useGame.getState().level)} de XP descansado</b> (5% da barra do nível) para amanhã.</p>
          : <p><b className={`c-${catTone(CAT[cat])}`}>{r.min}–{r.max} XP</b> por dia, mais +2% por dia seguido (até +40% com 20 dias).</p>}
        {extras.length > 0 && cat !== 'lazer' && <p>Cada bônus: <b className="c-epic">+{xr.min}–{xr.max} XP</b>, também com o bônus de streak.</p>}
        {habit && habit.best > 0 && <p className="q-meta">Recorde: {habit.best} dias seguidos.</p>}
      </div>
    </Sheet>
  );
}
