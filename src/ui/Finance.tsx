import { useMemo, useState } from 'react';
import { finCat, finCats, type FinCatId, type FinKind } from '../game/data';
import { catCents, entryParts, useGame, type Expense } from '../game/store';
import { dayKey, parseDay, WEEKDAY_SHORT } from '../game/rules';
import { Icon } from './Icon';
import { Empty, PanelHeader, Sheet } from './parts';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (cents: number) => money.format(cents / 100);
const signed = (cents: number) => (cents < 0 ? '−' : '+') + money.format(Math.abs(cents) / 100);

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthOf = (day: string) => day.slice(0, 7);
function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const monthLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const kindOf = (e: Expense): FinKind => e.kind ?? 'out';
const sum = (list: Expense[]) => list.reduce((t, e) => t + e.cents, 0);
const balance = (list: Expense[]) => list.reduce((t, e) => t + (kindOf(e) === 'in' ? e.cents : -e.cents), 0);

/** "12,50" → 1250 centavos. Aceita vírgula ou ponto. */
function parseCents(text: string) {
  const clean = text.replace(/[^\d,.]/g, '');
  if (!clean) return 0;
  const lastSep = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'));
  const value = lastSep >= 0 && clean.length - lastSep - 1 <= 2
    ? Number(clean.slice(0, lastSep).replace(/[,.]/g, '') + '.' + clean.slice(lastSep + 1))
    : Number(clean.replace(/[,.]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function MonthNav({ month, setMonth, isCurrent }: { month: string; setMonth: (f: (m: string) => string) => void; isCurrent: boolean }) {
  return (
    <div className="month-nav">
      <button className="icon-btn" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mês anterior"><span aria-hidden="true">‹</span></button>
      <b>{monthLabel(month)}</b>
      <button className="icon-btn" disabled={isCurrent} onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Próximo mês"><span aria-hidden="true">›</span></button>
    </div>
  );
}

/** Para gastos, subir é ruim; para ganhos e saldo, subir é bom. */
function Delta({ now, before, goodWhenUp }: { now: number; before: number; goodWhenUp: boolean }) {
  if (!before) return <span className="delta">{now ? 'sem lançamentos no período anterior' : '—'}</span>;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return <span className="delta">igual ao período anterior</span>;
  const good = (pct > 0) === goodWhenUp;
  return <span className={`delta ${good ? 'down' : 'up'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% ({now - before > 0 ? '+' : '−'}{brl(Math.abs(now - before))})</span>;
}

export function FinanceScreen() {
  const [view, setView] = useState<FinKind | 'compare'>('out');
  return (
    <>
      <div className="seg small fin-tabs">
        <button className={view === 'out' ? 'on' : ''} onClick={() => setView('out')}>Gastos</button>
        <button className={view === 'in' ? 'on' : ''} onClick={() => setView('in')}>Ganhos</button>
        <button className={view === 'compare' ? 'on' : ''} onClick={() => setView('compare')}>Comparação</button>
      </div>
      {view === 'compare' ? <Compare /> : <Entries key={view} kind={view} />}
    </>
  );
}

/** Lançamentos agrupados por dia, mais recentes primeiro. */
function EntryList({ items, onOpen, focusCat }: { items: Expense[]; onOpen: (e: Expense) => void; focusCat?: FinCatId | null }) {
  // com uma categoria em foco, cada lançamento conta só a parte dela
  const amount = (e: Expense) => (focusCat ? catCents(e, focusCat) : e.cents);
  const signedAmount = (e: Expense) => (kindOf(e) === 'in' ? amount(e) : -amount(e));
  const sorted = [...items].sort((a, b) => b.day.localeCompare(a.day) || b.updatedAt - a.updatedAt);
  const days = [...new Set(sorted.map(e => e.day))];
  return (
    <>
      {days.map(d => {
        const dayItems = sorted.filter(e => e.day === d);
        const date = parseDay(d);
        const net = dayItems.reduce((t, e) => t + signedAmount(e), 0);
        return (
          <div key={d} className="exp-day">
            <div className="exp-day-h"><span>{WEEKDAY_SHORT[(date.getDay() + 6) % 7]}, {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span><b className={net >= 0 ? 'pos' : 'neg'}>{signed(net)}</b></div>
            {dayItems.map(e => {
              const k = kindOf(e);
              const parts = entryParts(e);
              const c = finCat(k, (focusCat && parts.some(p => p.cat === focusCat) ? focusCat : e.cat));
              const labels = parts.map(p => finCat(k, p.cat).label).join(' + ');
              const split = parts.length > 1;
              return (
                <button key={e.id} className="exp-item" onClick={() => onOpen(e)}>
                  <span className={`exp-ico${split ? ' split' : ''}`} style={{ color: c.color, borderColor: c.color }}>
                    <Icon id={c.icon} size={16} />{split && <i>{parts.length}</i>}
                  </span>
                  <span className="q-main">
                    <span className="q-name">{e.note || labels}</span>
                    {(e.note || split) && <span className="q-meta">{split ? parts.map(p => `${brl(p.cents)} ${finCat(k, p.cat).label}`).join(' · ') : labels}</span>}
                    {focusCat && split && <span className="q-meta">parte de {brl(e.cents)} no total</span>}
                  </span>
                  <b className={k === 'in' ? 'pos' : 'neg'}>{k === 'in' ? '+' : '−'}{brl(amount(e))}</b>
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ---------- gastos e ganhos ----------
function Entries({ kind }: { kind: FinKind }) {
  const entries = useGame(s => s.expenses);
  const thisMonth = monthOf(dayKey());
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState<Expense | FinKind | null>(null);
  const isIn = kind === 'in';

  const inMonth = useMemo(
    () => entries.filter(e => kindOf(e) === kind && monthOf(e.day) === month).sort((a, b) => b.day.localeCompare(a.day) || b.updatedAt - a.updatedAt),
    [entries, month, kind],
  );
  const total = sum(inMonth);
  const noun = isIn ? 'ganho' : 'gasto';

  return (
    <>
      <MonthNav month={month} setMonth={setMonth} isCurrent={month === thisMonth} />
      <div className="exp-total">
        <small>{isIn ? 'Ganhos do mês' : 'Gastos do mês'}</small>
        <b className={isIn ? 'pos' : ''}>{brl(total)}</b>
      </div>
      <button className="btn fin-add-one" onClick={() => setEditing(kind)}><span className={isIn ? 'pos' : 'neg'}>{isIn ? '+' : '−'}</span> Anotar {noun}</button>

      <PanelHeader right={`${inMonth.length} ${inMonth.length === 1 ? 'anotação' : 'anotações'}`}>{isIn ? 'Ganhos' : 'Gastos'}</PanelHeader>
      {inMonth.length === 0 && (
        entries.every(e => kindOf(e) !== kind)
          ? <Empty icon="coin" title={`Nenhum ${noun} anotado`}
              text={isIn ? 'Anote o que entra: salário, freelas, rendimentos. O app soma o mês e acompanha a meta.' : 'Anote cada gasto com valor e categoria. O app soma o mês e compara com o anterior.'}
              action={<button className="btn gold" onClick={() => setEditing(kind)}><Icon id="plus" size={16} /> Anotar primeiro {noun}</button>} />
          : <p className="q-meta pad">Nenhum {noun} em {monthLabel(month)}.</p>
      )}
      <EntryList items={inMonth} onOpen={setEditing} />

      <div className="fab-space" />
      <button className="fab" onClick={() => setEditing(kind)} aria-label={`Anotar ${noun}`}><Icon id="plus" size={26} /></button>
      {editing && <EntryEditor item={typeof editing === 'string' ? null : editing} kind={typeof editing === 'string' ? editing : kindOf(editing)} onClose={() => setEditing(null)} />}
    </>
  );
}

function EntryEditor({ item, kind: initialKind, onClose }: { item: Expense | null; kind: FinKind; onClose: () => void }) {
  const save = useGame(s => s.saveExpense);
  const del = useGame(s => s.deleteExpense);
  const [kind, setKind] = useState<FinKind>(initialKind);
  const money2 = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  const [amount, setAmount] = useState(item ? money2(item.cents) : '');
  const [sel, setSel] = useState<FinCatId[]>(item ? entryParts(item).map(p => p.cat) : [initialKind === 'in' ? 'salario' : 'comida']);
  const [partAmt, setPartAmt] = useState<Record<string, string>>(
    item?.parts?.length ? Object.fromEntries(item.parts.map(p => [p.cat, money2(p.cents)])) : {},
  );
  const [note, setNote] = useState(item?.note ?? '');
  const [day, setDay] = useState(item?.day ?? dayKey());
  const [confirmDel, setConfirmDel] = useState(false);
  const cats = finCats(kind);
  const split = sel.length > 1;
  const partCents = sel.map(c => parseCents(partAmt[c] ?? ''));
  const cents = split ? partCents.reduce((t, v) => t + v, 0) : parseCents(amount);
  const valid = !!day && cents > 0 && (!split || partCents.every(v => v > 0));
  const toggle = (id: FinCatId) => {
    if (sel.includes(id)) {
      if (sel.length === 1) return; // pelo menos uma categoria
      const next = sel.filter(x => x !== id);
      if (next.length === 1) setAmount(money2(parseCents(partAmt[next[0]] ?? '') || cents));
      setSel(next);
    } else {
      // virando divisão: o valor que já estava digitado vai para a primeira categoria
      if (!split && amount) setPartAmt(p => ({ ...p, [sel[0]]: p[sel[0]] ?? amount }));
      setSel([...sel, id]);
    }
  };
  const switchKind = (k: FinKind) => {
    setKind(k);
    const keep = sel.filter(c => finCats(k).some(x => x.id === c));
    setSel(keep.length ? keep : [k === 'in' ? 'salario' : 'comida']);
  };
  const submit = () => {
    const parts = split ? sel.map((c, i) => ({ cat: c, cents: partCents[i] })) : undefined;
    save({ id: item?.id, kind, cents, cat: sel[0], parts, note: note.trim(), day });
    onClose();
  };

  return (
    <Sheet title={item ? 'Editar lançamento' : kind === 'in' ? 'Anotar ganho' : 'Anotar gasto'} onClose={onClose}
      footer={<>
        {item && (confirmDel
          ? <button className="btn red" onClick={() => { del(item.id); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!valid} onClick={submit}>
          {item ? 'Salvar' : 'Anotar'}
        </button>
      </>}>
      <div className="seg kind-seg">
        <button type="button" className={kind === 'out' ? 'on out' : ''} onClick={() => switchKind('out')}>− Gasto</button>
        <button type="button" className={kind === 'in' ? 'on in' : ''} onClick={() => switchKind('in')}>+ Ganho</button>
      </div>
      {!split && (
        <label className="field">
          <span>Valor</span>
          <div className="money-input"><em className={kind === 'in' ? 'pos' : 'neg'}>{kind === 'in' ? '+' : '−'} R$</em><input id="fin-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" autoFocus={!item} /></div>
        </label>
      )}
      <div className="field"><span>Categoria · toque em mais de uma para dividir</span>
        <div className="cat-grid">
          {cats.map(c => (
            <button key={c.id} type="button" className={`cat-chip${sel.includes(c.id) ? ' on' : ''}`} style={{ color: c.color }} onClick={() => toggle(c.id)} aria-pressed={sel.includes(c.id)}>
              {sel.includes(c.id) && split && <i className="chip-n">{sel.indexOf(c.id) + 1}</i>}
              <Icon id={c.icon} size={18} /><span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      {split && (
        <div className="field"><span>Quanto foi de cada</span>
          {sel.map(id => {
            const c = finCat(kind, id);
            return (
              <div key={id} className="split-row">
                <span className="split-cat" style={{ color: c.color }}><Icon id={c.icon} size={16} /> {c.label}</span>
                <div className="money-input"><em className={kind === 'in' ? 'pos' : 'neg'}>R$</em>
                  <input id={`fin-part-${id}`} inputMode="decimal" value={partAmt[id] ?? ''} placeholder="0,00" onChange={e => setPartAmt(p => ({ ...p, [id]: e.target.value }))} />
                </div>
              </div>
            );
          })}
          <div className="split-total"><span>Total</span><b className={kind === 'in' ? 'pos' : 'neg'}>{kind === 'in' ? '+' : '−'}{brl(cents)}</b></div>
        </div>
      )}
      <label className="field">
        <span>Descrição (opcional)</span>
        <input id="fin-note" value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'in' ? 'Ex.: Freela do site' : 'Ex.: Mercado do mês'} maxLength={60} />
      </label>
      <label className="field">
        <span>Data</span>
        <input id="fin-day" type="date" value={day} max={dayKey()} onChange={e => setDay(e.target.value)} className="date-input" />
      </label>
    </Sheet>
  );
}

// ---------- comparação ----------
type Mode = 'out' | 'in' | 'net';
function Compare() {
  const entries = useGame(st => st.expenses);
  const today = dayKey();
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [mode, setMode] = useState<Mode>('out');
  const [filter, setFilter] = useState<FinCatId | null>(null);

  const isCurrent = month === thisMonth;
  const prev = shiftMonth(month, -1);
  // No mês atual, compara com o mesmo pedaço do mês passado (dia 1 até o dia de hoje)
  const cutDay = isCurrent ? Number(today.slice(8)) : 31;

  const data = useMemo(() => {
    const ofKind = (list: Expense[]) => (mode === 'net' ? list : list.filter(e => kindOf(e) === mode));
    const inMonth = ofKind(entries.filter(e => monthOf(e.day) === month));
    const inPrev = ofKind(entries.filter(e => monthOf(e.day) === prev && Number(e.day.slice(8)) <= cutDay));
    const total = (list: Expense[]) => (mode === 'net' ? balance(list) : sum(list));
    const byCat = mode === 'net' ? [] : finCats(mode).map(c => ({
      cat: c,
      now: inMonth.reduce((t, e) => t + catCents(e, c.id), 0),
      before: inPrev.reduce((t, e) => t + catCents(e, c.id), 0),
    })).filter(r => r.now || r.before).sort((a, b) => b.now - a.now);
    const pick = (list: Expense[]) => (filter ? list.filter(e => catCents(e, filter) > 0) : list);
    // com filtro, o total é só a parte daquela categoria em cada lançamento
    const totalOf = (list: Expense[]) => (filter ? list.reduce((t, e) => t + catCents(e, filter), 0) : total(list));
    return { total: totalOf(pick(inMonth)), totalPrev: totalOf(pick(inPrev)), byCat, listNow: pick(inMonth), listPrev: pick(inPrev) };
  }, [entries, month, prev, cutDay, mode, filter]);
  const [period, setPeriod] = useState<'now' | 'prev'>('now');
  const [editing, setEditing] = useState<Expense | null>(null);
  const shown = period === 'now' ? data.listNow : data.listPrev;
  const prevLabel = isCurrent ? `1 a ${cutDay} de ${MONTHS[Number(prev.slice(5)) - 1]}` : monthLabel(prev);

  const top = Math.max(1, ...data.byCat.map(r => Math.max(r.now, r.before)));
  const label = mode === 'out' ? 'Gastos' : mode === 'in' ? 'Ganhos' : 'Saldo';
  const fmtTotal = (v: number) => (mode === 'net' ? signed(v) : brl(v));

  return (
    <>
      <MonthNav month={month} setMonth={setMonth} isCurrent={isCurrent} />
      <div className="seg small">
        {(['out', 'in', 'net'] as Mode[]).map(m => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setFilter(null); }}>{m === 'out' ? 'Gastos' : m === 'in' ? 'Ganhos' : 'Saldo'}</button>
        ))}
      </div>

      <div className="exp-total">
        <small>{filter ? finCat(mode === 'in' ? 'in' : 'out', filter).label : `${label} do mês`}</small>
        <b className={mode === 'net' ? (data.total >= 0 ? 'pos' : 'neg') : ''}>{fmtTotal(data.total)}</b>
        <span className="q-meta">
          {isCurrent ? `vs. 1 a ${cutDay} de ${MONTHS[Number(prev.slice(5)) - 1]}` : `vs. ${monthLabel(prev)}`}: {fmtTotal(data.totalPrev)}
        </span>
        <Delta now={data.total} before={data.totalPrev} goodWhenUp={mode !== 'out'} />
      </div>

      {mode !== 'net' && (
        <div className="exp-filter">
          <button className={!filter ? 'on' : ''} onClick={() => setFilter(null)}>Todas</button>
          {finCats(mode).map(c => (
            <button key={c.id} className={filter === c.id ? 'on' : ''} style={{ ['--c' as string]: c.color }} onClick={() => setFilter(f => f === c.id ? null : c.id)}>{c.label}</button>
          ))}
        </div>
      )}

      {data.byCat.length > 0 && !filter && <>
        <PanelHeader right="este mês × anterior">Por categoria</PanelHeader>
        {data.byCat.map(r => (
          <button key={r.cat.id} className="exp-cat" onClick={() => setFilter(r.cat.id)}>
            <span className="exp-cat-h"><span style={{ color: r.cat.color }}><Icon id={r.cat.icon} size={14} /> {r.cat.label}</span><b>{brl(r.now)}</b></span>
            <span className="exp-bars">
              <i style={{ width: `${(r.now / top) * 100}%`, background: r.cat.color }} />
              <i className="prev" style={{ width: `${(r.before / top) * 100}%` }} />
            </span>
            <Delta now={r.now} before={r.before} goodWhenUp={mode !== 'out'} />
          </button>
        ))}
      </>}
      {mode === 'net' && <p className="q-meta pad">Saldo = ganhos − gastos no período. Use Gastos ou Ganhos para ver por categoria.</p>}

      <PanelHeader right={`${shown.length} ${shown.length === 1 ? 'anotação' : 'anotações'} · ${fmtTotal(period === 'now' ? data.total : data.totalPrev)}`}>De onde veio</PanelHeader>
      <div className="seg small">
        <button className={period === 'now' ? 'on' : ''} onClick={() => setPeriod('now')}>Este mês</button>
        <button className={period === 'prev' ? 'on' : ''} onClick={() => setPeriod('prev')}>{prevLabel}</button>
      </div>
      {shown.length === 0
        ? <p className="q-meta pad">Nenhuma anotação {filter ? `de ${finCat(mode === 'in' ? 'in' : 'out', filter).label} ` : ''}nesse período.</p>
        : <EntryList items={shown} onOpen={setEditing} focusCat={filter} />}
      {editing && <EntryEditor item={editing} kind={kindOf(editing)} onClose={() => setEditing(null)} />}
    </>
  );
}
