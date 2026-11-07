import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROJ_STAGES, clientMonthMinutes, fixedShare, isFixedClient, projectDueInfo, projectMinutes, projectStageXp, usdGoalStatus, useGame,
  type Client, type ClientLink, type ClientPrice, type GameData, type Project, type ProjStatus,
} from '../game/store';
import { dayKey, parseDay } from '../game/rules';
import { fetchYoutubeAvatar, isYoutubeUrl, AvatarError } from '../fx/youtube';
import { Icon } from './Icon';
import { Empty, PanelHeader, Sheet } from './parts';
import { LeadSheet, LeadsTab, MessagesSheet, leadsAvailable } from './Leads';

// ---------- utilidades ----------
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const fmtUsd = (cents: number) => usd.format(cents / 100);
const uid = () => Math.random().toString(36).slice(2, 10);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "250" ou "1.250,50" → centavos. */
function parseCents(text: string) {
  const clean = text.replace(/[^\d,.]/g, '');
  if (!clean) return 0;
  const lastSep = Math.max(clean.lastIndexOf(','), clean.lastIndexOf('.'));
  const value = lastSep >= 0 && clean.length - lastSep - 1 <= 2
    ? Number(clean.slice(0, lastSep).replace(/[,.]/g, '') + '.' + clean.slice(lastSep + 1))
    : Number(clean.replace(/[,.]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
const toInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');
function fmtHours(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}min` : ''}`;
}
/** Valor por hora (centavos/hora) ou null se não há horas. */
const hourly = (cents: number, min: number) => (min >= 1 ? Math.round(cents / (min / 60)) : null);

function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function linkLabel(url: string) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (/youtube\.com|youtu\.be/.test(h)) return 'YouTube';
    if (/instagram\.com/.test(h)) return 'Instagram';
    if (/tiktok\.com/.test(h)) return 'TikTok';
    if (/(x|twitter)\.com/.test(h)) return 'X';
    if (/drive\.google\.com/.test(h)) return 'Drive';
    if (/frame\.io/.test(h)) return 'Frame.io';
    if (/wa\.me|whatsapp/.test(h)) return 'WhatsApp';
    return h;
  } catch { return url.includes('@') ? 'E-mail' : 'Link'; }
}

function Avatar({ client, size = 40 }: { client: Client | null | undefined; size?: number }) {
  if (client?.avatar) return <img className="cl-avatar" src={client.avatar} width={size} height={size} alt="" />;
  const letter = (client?.name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return <span className="cl-avatar cl-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>{letter}</span>;
}

const STAGE_INDEX = Object.fromEntries(PROJ_STAGES.map((s, i) => [s.id, i])) as Record<ProjStatus, number>;
/** Cliente com fixo mensal não tem a etapa Pago: o pagamento é do mês, na ficha do cliente. */
const stagesFor = (c: Client | null | undefined) => (isFixedClient(c) ? PROJ_STAGES.filter(st => st.id !== 'paid') : PROJ_STAGES);
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
/** Valor do projeto: o combinado, ou a parte do fixo pelas horas do mês. */
const projectValue = (s: GameData, p: Project) => (isFixedClient(s.clients.find(c => c.id === p.clientId)) ? fixedShare(s, p) : p.usdCents);

function clientStats(s: GameData, clientId: string) {
  const ps = s.projects.filter(p => p.clientId === clientId);
  const min = ps.reduce((t, p) => t + projectMinutes(p), 0);
  const c = s.clients.find(x => x.id === clientId);
  if (isFixedClient(c)) {
    // fixo: cada mês com horas vale o fixo; o valor por hora é fixo ÷ horas
    const month = dayKey().slice(0, 7);
    const months = [...clientMonthMinutes(s, clientId).entries()].filter(([, m]) => m > 0);
    const workedMin = months.reduce((t, [, m]) => t + m, 0);
    const paidMonths = c.fixedPaid ?? [];
    return {
      count: ps.length, min, paid: c.fixedCents * paidMonths.length, pending: paidMonths.includes(month) ? 0 : c.fixedCents,
      rate: hourly(c.fixedCents * months.length, workedMin), monthMin: clientMonthMinutes(s, clientId).get(month) ?? 0,
    };
  }
  const paid = ps.filter(p => p.status === 'paid').reduce((t, p) => t + p.usdCents, 0);
  const pending = ps.filter(p => p.status !== 'paid').reduce((t, p) => t + p.usdCents, 0);
  // $/h médio só conta projetos já pagos ou entregues, que têm valor definido
  const doneP = ps.filter(p => p.status === 'paid' || p.status === 'delivered');
  const doneMin = doneP.reduce((t, p) => t + projectMinutes(p), 0);
  const doneCents = doneP.reduce((t, p) => t + p.usdCents, 0);
  return { count: ps.length, min, paid, pending, rate: hourly(doneCents, doneMin), monthMin: null as number | null };
}

// ---------- tela ----------
export function MesaScreen() {
  const [tab, setTab] = useState<'projects' | 'clients' | 'leads'>('projects');
  const [openProject, setOpenProject] = useState<string | 'new' | null>(null);
  const [openClient, setOpenClient] = useState<string | 'new' | null>(null);
  const [openLead, setOpenLead] = useState<string | 'new' | null>(null);
  const [messages, setMessages] = useState(false);
  const leads = leadsAvailable();
  const add = () => (tab === 'projects' ? setOpenProject('new') : tab === 'clients' ? setOpenClient('new') : setOpenLead('new'));
  return (
    <>
      {tab !== 'leads' && <UsdGoalCard />}
      <div className="seg small fin-tabs">
        <button className={tab === 'projects' ? 'on' : ''} onClick={() => setTab('projects')}>Projetos</button>
        <button className={tab === 'clients' ? 'on' : ''} onClick={() => setTab('clients')}>Clientes</button>
        {leads && <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leads</button>}
      </div>
      {tab === 'projects' && <Projects onOpen={setOpenProject} />}
      {tab === 'clients' && <Clients onOpen={setOpenClient} />}
      {tab === 'leads' && <LeadsTab onOpen={setOpenLead} onMessages={() => setMessages(true)} />}
      <div className="fab-space" />
      <button className="fab" onClick={add} aria-label={tab === 'projects' ? 'Novo projeto' : tab === 'clients' ? 'Novo cliente' : 'Novo lead'}><Icon id="plus" size={26} /></button>
      {openProject && <ProjectSheet id={openProject === 'new' ? null : openProject} onClose={() => setOpenProject(null)} onOpenClient={id => { setOpenProject(null); setOpenClient(id); }} />}
      {openClient && <ClientSheet id={openClient === 'new' ? null : openClient} onClose={() => setOpenClient(null)} onOpenProject={id => { setOpenClient(null); setOpenProject(id); }} />}
      {openLead && <LeadSheet id={openLead === 'new' ? null : openLead} onClose={() => setOpenLead(null)} />}
      {messages && <MessagesSheet onClose={() => setMessages(false)} />}
    </>
  );
}

// ---------- meta em US$ ----------
function UsdGoalCard() {
  const s = useGame();
  const [editing, setEditing] = useState(false);
  const today = dayKey();
  const month = today.slice(0, 7);
  const st = usdGoalStatus(s, month);
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const dayNow = Number(today.slice(8));
  const daysLeft = daysInMonth - dayNow + 1;
  if (!st.goal) {
    return (
      <>
        <button className="goal-empty usd" onClick={() => setEditing(true)}>
          <Icon id="trophy" size={20} />
          <span><b>Definir meta mensal em US$</b><small>Acompanhe quanto já recebeu, quanto falta e o ritmo do mês.</small></span>
        </button>
        {editing && <UsdGoalEditor month={month} current={0} onClose={() => setEditing(false)} />}
      </>
    );
  }
  const pct = Math.min(1, st.paid / st.goal);
  const remaining = Math.max(0, st.goal - st.paid);
  const projection = Math.round((st.paid / dayNow) * daysInMonth);
  return (
    <div className={`goal-card usd${st.reached ? ' reached' : ''}`}>
      <div className="goal-h">
        <span><small>Meta de {MONTHS[mo - 1]}</small><b>{fmtUsd(st.goal)}</b></span>
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Editar meta"><Icon id="edit" size={16} /></button>
      </div>
      <div className="goal-bar">
        <i style={{ width: `${pct * 100}%` }} />
        <em style={{ left: `${pct * 100}%`, width: `${Math.min(1 - pct, st.toReceive / st.goal) * 100}%` }} />
        <span>{fmtUsd(st.paid)} · {Math.round((st.paid / st.goal) * 100)}%</span>
      </div>
      {st.reached
        ? <p className="goal-done">Meta batida{st.paid > st.goal ? `, com ${fmtUsd(st.paid - st.goal)} a mais` : ''}!</p>
        : <p className="q-meta">Faltam <b>{fmtUsd(remaining)}</b> em {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} ({fmtUsd(Math.ceil(remaining / daysLeft))} por dia). No ritmo atual, fecha em <b>{fmtUsd(projection)}</b>.</p>}
      {st.toReceive > 0 && <p className="q-meta"><span className="to-receive" /> A receber (entregue, ainda não pago): <b>{fmtUsd(st.toReceive)}</b></p>}
      {editing && <UsdGoalEditor month={month} current={st.goal} onClose={() => setEditing(false)} />}
    </div>
  );
}

function UsdGoalEditor({ month, current, onClose }: { month: string; current: number; onClose: () => void }) {
  const setGoal = useGame(s => s.setUsdGoal);
  const [amount, setAmount] = useState(toInput(current));
  const cents = parseCents(amount);
  return (
    <Sheet title="Meta mensal" onClose={onClose}
      footer={<>
        {current > 0 && <button className="btn ghost" onClick={() => { setGoal(month, 0); onClose(); }}>Tirar meta</button>}
        <button className="btn gold" disabled={cents <= 0} onClick={() => { setGoal(month, cents); onClose(); }}>Salvar meta</button>
      </>}>
      <label className="field">
        <span>Quanto quer receber por mês</span>
        <div className="money-input"><em className="usd-em">US$</em><input id="usd-goal" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" autoFocus /></div>
      </label>
      <p className="q-meta">Conta como recebido o valor dos projetos marcados como Pago no mês e os fixos mensais marcados como pagos. A meta vale a partir deste mês e segue nos próximos até você mudar.</p>
    </Sheet>
  );
}

// ---------- projetos ----------
type Filter = 'active' | 'receive' | 'paid';

function Projects({ onOpen }: { onOpen: (id: string) => void }) {
  const s = useGame();
  const [filter, setFilter] = useState<Filter>('active');
  const fixedIds = new Set(s.clients.filter(isFixedClient).map(c => c.id));
  // entregue de cliente com fixo já conta como concluído (o pagamento é do mês)
  const groupOf = (p: Project): Filter => (p.status === 'paid' || (p.status === 'delivered' && p.clientId && fixedIds.has(p.clientId)) ? 'paid' : p.status === 'delivered' ? 'receive' : 'active');
  const list = useMemo(() => s.projects
    .filter(p => groupOf(p) === filter)
    .sort((a, b) => (filter === 'paid'
      ? (b.paidAt ?? b.deliveredAt ?? '').localeCompare(a.paidAt ?? a.deliveredAt ?? '')
      : `${a.due ?? '9999'} ${a.dueTime ?? ''}`.localeCompare(`${b.due ?? '9999'} ${b.dueTime ?? ''}`))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [s.projects, s.clients, filter]);
  const count = (f: Filter) => s.projects.filter(p => groupOf(p) === f).length;

  return (
    <>
      <div className="seg small">
        <button className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>Em andamento ({count('active')})</button>
        <button className={filter === 'receive' ? 'on' : ''} onClick={() => setFilter('receive')}>A receber ({count('receive')})</button>
        <button className={filter === 'paid' ? 'on' : ''} onClick={() => setFilter('paid')}>Concluídos ({count('paid')})</button>
      </div>
      {s.projects.length === 0 && (
        <Empty icon="shield" title="Nenhuma missão na mesa" text="Crie um projeto com cliente, prazo e valor. Cada etapa concluída dá XP e a entrega é a recompensa grande." />
      )}
      {s.projects.length > 0 && list.length === 0 && <p className="q-meta pad">Nada aqui por enquanto.</p>}
      {list.map(p => <ProjectCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />)}
    </>
  );
}

function dueText(p: Project) {
  const d = projectDueInfo(p);
  if (!d) return null;
  if (d.late) return { text: `atrasado ${d.lateDays} ${d.lateDays === 1 ? 'dia' : 'dias'}`, tone: 'late' };
  if (d.days === 0) return { text: `entrega hoje${p.dueTime ? ` às ${p.dueTime}` : ''}`, tone: 'today' };
  if (d.days === 1) return { text: 'entrega amanhã', tone: 'soon' };
  return { text: `entrega em ${d.days} dias (${parseDay(p.due!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`, tone: d.days <= 2 ? 'soon' : 'ok' };
}

function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const s = useGame();
  useNow(60_000);
  const client = s.clients.find(c => c.id === p.clientId);
  const min = projectMinutes(p);
  const fixed = isFixedClient(client);
  const rate = hourly(projectValue(s, p), min);
  const due = dueText(p);
  const stages = stagesFor(client);
  return (
    <button className={`proj-card${due?.tone === 'late' ? ' overdue' : ''}`} onClick={onOpen}>
      <Avatar client={client} size={42} />
      <span className="q-main">
        <span className="q-name">{p.name}</span>
        <span className="q-meta">{client?.name ?? 'Sem cliente'}{min ? ` · ${fmtHours(min)}` : ''}{rate ? ` · ${fmtUsd(rate)}/h` : ''}</span>
        <span className="stage-dots" aria-label={`Etapa: ${PROJ_STAGES[STAGE_INDEX[p.status]].label}`}>
          {stages.map((st, i) => <i key={st.id} className={i <= STAGE_INDEX[p.status] ? 'on' : ''} />)}
          <b>{PROJ_STAGES[STAGE_INDEX[p.status]].label}</b>
        </span>
        {due && <span className={`due ${due.tone}`}><Icon id="clock" size={11} /> {due.text}</span>}
      </span>
      <span className="proj-value">{fixed ? <small className="fixed-tag">Fixo</small> : p.usdCents ? fmtUsd(p.usdCents) : '—'}</span>
    </button>
  );
}

function ProjectSheet({ id, onClose, onOpenClient }: { id: string | null; onClose: () => void; onOpenClient: (id: string) => void }) {
  const s = useGame();
  const now = useNow(1000 * 15);
  const [pid, setPid] = useState<string | null>(id);
  const p = pid ? s.projects.find(x => x.id === pid) : null;
  const [name, setName] = useState(p?.name ?? '');
  const [clientId, setClientId] = useState<string | null>(p?.clientId ?? null);
  const [amount, setAmount] = useState(toInput(p?.usdCents ?? 0));
  const [due, setDue] = useState(p?.due ?? '');
  const [dueTime, setDueTime] = useState(p?.dueTime ?? '');
  const [notes, setNotes] = useState(p?.notes ?? '');
  const [newClient, setNewClient] = useState('');
  const [manH, setManH] = useState('');
  const [manM, setManM] = useState('');
  const [manDay, setManDay] = useState(dayKey());
  const [confirmDel, setConfirmDel] = useState(false);
  // projeto feito antes de usar o app: entra já entregue/pago, sem XP
  const [past, setPast] = useState(false);
  const [pastStage, setPastStage] = useState<'delivered' | 'paid'>('paid');
  const [pastDay, setPastDay] = useState(dayKey());
  const client = s.clients.find(c => c.id === clientId);
  const fixed = isFixedClient(client);
  const cents = parseCents(amount);

  const fields = () => ({ name: name.trim() || 'Projeto sem nome', clientId, usdCents: fixed ? 0 : cents, due: due || undefined, dueTime: due && dueTime ? dueTime : undefined, notes });
  const persist = () => { if (pid) s.saveProject({ id: pid, ...fields() }); };
  const create = () => {
    if (past) {
      const stage = isFixedClient(client) ? 'delivered' : pastStage;
      const upTo = PROJ_STAGES.slice(0, STAGE_INDEX[stage] + 1).map(x => x.id);
      s.saveProject({ ...fields(), status: stage, rewarded: upTo, deliveredAt: pastDay, paidAt: stage === 'paid' ? pastDay : undefined, createdAt: pastDay });
      onClose();
      return;
    }
    const nid = s.saveProject(fields()); setPid(nid);
  };
  const close = () => { persist(); onClose(); };
  const addClient = () => { if (!newClient.trim()) return; setClientId(s.saveClient({ name: newClient, links: [], notes: '', prices: [] })); setNewClient(''); };

  const min = p ? projectMinutes(p, now) : 0;
  const rate = hourly(fixed && p ? fixedShare(s, p) : cents, min);

  return (
    <Sheet title={p ? 'Projeto' : 'Novo projeto'} onClose={close}
      footer={p
        ? <>
            {confirmDel
              ? <button className="btn red" onClick={() => { s.deleteProject(p.id); onClose(); }}>Confirmar exclusão</button>
              : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>}
            <button className="btn gold" onClick={close}>Salvar</button>
          </>
        : <button className="btn gold" disabled={!name.trim()} onClick={create}>{past ? 'Adicionar sem XP' : 'Criar projeto'}</button>}>
      <label className="field">
        <span>Projeto</span>
        <input id="pj-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Vídeo semanal #42" maxLength={60} autoFocus={!p} />
      </label>

      <div className="field"><span>Cliente</span>
        <div className="cl-pick">
          {s.clients.map(c => (
            <button key={c.id} type="button" className={clientId === c.id ? 'on' : ''} onClick={() => setClientId(clientId === c.id ? null : c.id)}>
              <Avatar client={c} size={26} /><span>{c.name}</span>
            </button>
          ))}
        </div>
        <div className="obj-edit">
          <input id="pj-new-client" value={newClient} placeholder={s.clients.length ? 'Outro cliente' : 'Nome do cliente'} maxLength={40}
            onChange={e => setNewClient(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addClient(); } }} />
          <button type="button" className="btn small" disabled={!newClient.trim()} onClick={addClient}>Adicionar</button>
        </div>
        {client && <button type="button" className="link-btn left" onClick={() => { persist(); onOpenClient(client.id); }}>Abrir ficha de {client.name}</button>}
      </div>

      {fixed ? (
        <div className="field"><span>Valor</span>
          <p className="fixed-note">Incluso no fixo de <b>{client.name}</b> ({fmtUsd(client.fixedCents)}/mês). O valor por hora sai do fixo dividido pelas horas do mês.</p>
        </div>
      ) : <div className="field"><span>Valor</span>
        <div className="money-input"><em className="usd-em">US$</em><input id="pj-value" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div>
        {client && client.prices.length > 0 && (
          <div className="exp-filter">
            {client.prices.map(pr => <button key={pr.id} type="button" onClick={() => setAmount(toInput(pr.usdCents))}>{pr.label}: {fmtUsd(pr.usdCents)}</button>)}
          </div>
        )}
      </div>}

      {!p && (
        <div className="field"><span>Já feito antes?</span>
          <div className="seg small">
            <button type="button" className={!past ? 'on' : ''} onClick={() => setPast(false)}>Projeto novo</button>
            <button type="button" className={past ? 'on' : ''} onClick={() => setPast(true)}>Antigo, sem XP</button>
          </div>
          {past && <>
            <div className="past-row">
              {!isFixedClient(client) && (
                <div className="seg small">
                  <button type="button" className={pastStage === 'delivered' ? 'on' : ''} onClick={() => setPastStage('delivered')}>Entregue</button>
                  <button type="button" className={pastStage === 'paid' ? 'on' : ''} onClick={() => setPastStage('paid')}>Pago</button>
                </div>
              )}
              <input id="pj-past-day" type="date" value={pastDay} max={dayKey()} onChange={e => setPastDay(e.target.value || dayKey())} aria-label="Quando foi entregue" />
            </div>
            <p className="q-meta">Entra direto como {isFixedClient(client) || pastStage === 'delivered' ? 'entregue' : 'pago'} em {parseDay(pastDay).toLocaleDateString('pt-BR')}, sem dar XP. Pago conta na meta do mês dessa data. Depois dá para lançar as horas na ficha.</p>
          </>}
        </div>
      )}

      {!past && <div className="field"><span>Prazo</span>
        <div className="due-edit">
          <input id="pj-due" type="date" value={due} onChange={e => setDue(e.target.value)} />
          <input id="pj-due-time" type="time" value={dueTime} disabled={!due} onChange={e => setDueTime(e.target.value)} aria-label="Hora da entrega" />
          {due && <button type="button" className="icon-btn" onClick={() => { setDue(''); setDueTime(''); }} aria-label="Tirar prazo"><Icon id="x" size={16} /></button>}
        </div>
      </div>}

      {p && <>
        <div className="field"><span>Etapa · toque para avançar</span>
          <div className="stage-pick" style={{ gridTemplateColumns: `repeat(${stagesFor(client).length}, minmax(0, 1fr))` }}>
            {stagesFor(client).map((st, i) => {
              const done = i <= STAGE_INDEX[p.status];
              const xp = projectStageXp(st.id);
              const pending = !p.rewarded.includes(st.id);
              return (
                <button key={st.id} type="button" className={`${done ? 'done' : ''}${p.status === st.id ? ' on' : ''}`}
                  onClick={() => { persist(); s.setProjectStatus(p.id, st.id); }}>
                  <i>{done ? <Icon id="check" size={12} /> : i + 1}</i>
                  <b>{st.label}</b>
                  {pending && st.id !== 'briefing' && <small>+{xp.min}–{xp.max} XP</small>}
                </button>
              );
            })}
          </div>
          {(() => {
            // etapas à frente da atual que já deram XP (ex.: avançou por engano e voltou)
            const ahead = stagesFor(client).filter(st => st.id !== 'briefing' && STAGE_INDEX[st.id] > STAGE_INDEX[p.status] && p.rewarded.includes(st.id));
            return ahead.length > 0 && (
              <div className="stage-revoke">
                <span className="q-meta">Já deu XP e ficou à frente:</span>
                {ahead.map(st => (
                  <button key={st.id} type="button" className="btn small" onClick={() => { persist(); s.revokeProjectStage(p.id, st.id); }}>
                    <Icon id="undo" size={13} /> Devolver XP de {st.label}
                  </button>
                ))}
              </div>
            );
          })()}
          <p className="q-meta">Cada etapa dá XP de Trabalho na primeira vez; a entrega é a recompensa grande (e segue as regras de prazo). Metade vai para Fortuna.{fixed && ' O pagamento do fixo é marcado na ficha do cliente.'}</p>
        </div>

        <div className="field"><span>Horas</span>
          <div className="hours-box">
            <div><small>Trabalhado</small><b>{fmtHours(min)}</b></div>
            <div><small>Valor por hora</small><b>{rate ? `${fmtUsd(rate)}/h` : '—'}</b></div>
          </div>
          <div className="man-time">
            <input id="pj-man-h" inputMode="numeric" value={manH} onChange={e => setManH(e.target.value.replace(/\D/g, ''))} placeholder="h" aria-label="Horas" />
            <span>h</span>
            <input id="pj-man-m" inputMode="numeric" value={manM} onChange={e => setManM(e.target.value.replace(/\D/g, ''))} placeholder="min" aria-label="Minutos" />
            <input id="pj-man-day" type="date" value={manDay} max={dayKey()} onChange={e => setManDay(e.target.value)} aria-label="Dia" />
            <button type="button" className="btn small" disabled={!(Number(manH) || Number(manM))}
              onClick={() => { s.addTime(p.id, Number(manH || 0) * 60 + Number(manM || 0), manDay); setManH(''); setManM(''); }}>Lançar</button>
          </div>
          {p.time.length > 0 && (
            <div className="time-log">
              {[...p.time].reverse().map(e => (
                <div key={e.id} className="time-row">
                  <span>{parseDay(e.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                  <span className="q-meta">{e.minutes ? 'lançado à mão' : e.end === null ? 'cronômetro (agora)' : `${new Date(e.start!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}–${new Date(e.end!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
                  <b>{fmtHours(e.minutes ?? (((e.end ?? now) - (e.start ?? now)) / 60000))}</b>
                  <button type="button" className="icon-btn" onClick={() => s.removeTime(p.id, e.id)} aria-label="Apagar trecho"><Icon id="x" size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>Anotações</span>
          <textarea id="pj-notes" className="backup notes-area" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Briefing, referências, pedidos de revisão..." />
        </label>
      </>}
    </Sheet>
  );
}

// ---------- clientes ----------
function Clients({ onOpen }: { onOpen: (id: string) => void }) {
  const s = useGame();
  const sorted = [...s.clients].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return (
    <>
      {s.clients.length === 0 && <Empty icon="people" title="Nenhum cliente ainda" text="Cadastre seus clientes com links, anotações e tabela de preços. Colando o link do YouTube, a foto do canal vem sozinha." />}
      {sorted.map(c => {
        const st = clientStats(s, c.id);
        return (
          <button key={c.id} className="cl-card" onClick={() => onOpen(c.id)}>
            <Avatar client={c} size={48} />
            <span className="q-main">
              <span className="q-name">{c.name}</span>
              <span className="q-meta">{isFixedClient(c) ? `Fixo ${fmtUsd(c.fixedCents)}/mês · ` : ''}{st.count} {st.count === 1 ? 'projeto' : 'projetos'} · {fmtHours(st.min)}</span>
              <span className="cl-nums">
                <span><small>Pago</small><b className="pos">{fmtUsd(st.paid)}</b></span>
                <span><small>{isFixedClient(c) ? 'Falta do mês' : 'Pendente'}</small><b>{fmtUsd(st.pending)}</b></span>
                <span><small>Por hora</small><b className="gold-t">{st.rate ? fmtUsd(st.rate) : '—'}</b></span>
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function ClientSheet({ id, onClose, onOpenProject }: { id: string | null; onClose: () => void; onOpenProject: (id: string) => void }) {
  const s = useGame();
  const existing = id ? s.clients.find(c => c.id === id) : null;
  const [cid, setCid] = useState<string | null>(id);
  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(existing?.avatar);
  const [links, setLinks] = useState<ClientLink[]>(existing?.links ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [prices, setPrices] = useState<ClientPrice[]>(existing?.prices ?? []);
  const [newLink, setNewLink] = useState('');
  const [priceLabel, setPriceLabel] = useState('');
  const [priceAmt, setPriceAmt] = useState('');
  const [billing, setBilling] = useState<'project' | 'fixed'>(isFixedClient(existing) ? 'fixed' : 'project');
  const [fixedAmt, setFixedAmt] = useState(toInput(existing?.fixedCents ?? 0));
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const yt = links.find(l => isYoutubeUrl(l.url));

  const live = cid ? s.clients.find(c => c.id === cid) : null; // fixedPaid muda direto na store
  const fixedCents = billing === 'fixed' ? parseCents(fixedAmt) : 0;
  const data = () => ({ name: name.trim() || 'Cliente', avatar, links, notes, prices, fixedCents: fixedCents || undefined, fixedPaid: live?.fixedPaid });
  const month = dayKey().slice(0, 7);
  const toggleMonth = (m: string) => { const nid = save(); s.setFixedPaid(nid, m, !live?.fixedPaid?.includes(m)); };
  const save = () => { const nid = s.saveClient({ id: cid ?? undefined, ...data() }); setCid(nid); return nid; };
  const close = () => { if (cid || name.trim()) save(); onClose(); };

  const addLink = () => {
    let url = newLink.trim();
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = url.includes('@') && !url.includes('/') ? `mailto:${url}` : `https://${url}`;
    setLinks(v => [...v, { id: uid(), label: linkLabel(url), url }]);
    setNewLink('');
  };
  const pullYoutube = async () => {
    if (!yt) return;
    setFetching(true); setMsg('');
    try { setAvatar(await fetchYoutubeAvatar(yt.url)); setMsg('Foto do canal atualizada.'); }
    catch (e) { setMsg(e instanceof AvatarError ? e.message : 'Não deu para buscar a foto.'); }
    finally { setFetching(false); }
  };
  const onPhoto = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256, k = Math.min(img.width, img.height);
        const c = document.createElement('canvas'); c.width = c.height = size;
        c.getContext('2d')!.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, size, size);
        setAvatar(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(f);
  };
  const st = cid ? clientStats(s, cid) : null;
  const projects = cid ? s.projects.filter(p => p.clientId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  return (
    <Sheet title={existing ? 'Ficha do cliente' : 'Novo cliente'} onClose={close}
      footer={<>
        {cid && (confirmDel
          ? <button className="btn red" onClick={() => { s.deleteClient(cid); onClose(); }}>Confirmar exclusão</button>
          : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Excluir</button>)}
        <button className="btn gold" disabled={!name.trim()} onClick={() => { save(); onClose(); }}>Salvar</button>
      </>}>
      <div className="cl-head">
        <button type="button" className="cl-photo" onClick={() => fileRef.current?.click()} aria-label="Trocar foto">
          <Avatar client={{ name: name || '?', avatar } as Client} size={84} />
          <small>Trocar</small>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
        <div className="cl-head-main">
          <input id="cl-name" className="ws-title cl-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente" maxLength={40} autoFocus={!existing} />
          {yt && <button type="button" className="btn small" disabled={fetching} onClick={pullYoutube}><Icon id="undo" size={13} /> {fetching ? 'Buscando…' : 'Puxar foto do YouTube'}</button>}
          {avatar && <button type="button" className="link-btn left" onClick={() => setAvatar(undefined)}>Tirar foto</button>}
          {msg && <p className="q-meta">{msg}</p>}
        </div>
      </div>

      {st && (
        <div className="fin-summary">
          <div><small>Pago</small><b className="pos">{fmtUsd(st.paid)}</b></div>
          <div><small>{st.monthMin !== null ? 'Falta do mês' : 'Pendente'}</small><b>{fmtUsd(st.pending)}</b></div>
          <div><small>Por hora</small><b className="gold-t">{st.rate ? fmtUsd(st.rate) : '—'}</b></div>
        </div>
      )}

      <div className="field"><span>Como paga</span>
        <div className="seg small">
          <button type="button" className={billing === 'project' ? 'on' : ''} onClick={() => setBilling('project')}>Por projeto</button>
          <button type="button" className={billing === 'fixed' ? 'on' : ''} onClick={() => setBilling('fixed')}>Fixo mensal</button>
        </div>
        {billing === 'fixed' && <>
          <div className="money-input"><em className="usd-em">US$</em><input id="cl-fixed" inputMode="decimal" value={fixedAmt} onChange={e => setFixedAmt(e.target.value)} placeholder="0,00 por mês" /></div>
          {fixedCents > 0 && (
            <div className="fixed-months">
              {[month, prevMonth(month)].map(m => {
                const paid = !!live?.fixedPaid?.includes(m);
                return (
                  <button key={m} type="button" className={paid ? 'on' : ''} onClick={() => toggleMonth(m)}>
                    <Icon id={paid ? 'check' : 'clock'} size={14} />
                    <span><b>{monthName(m)}</b><small>{paid ? 'pago' : 'marcar como pago'}</small></span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="q-meta">
            Os projetos desse cliente não têm valor próprio. O fixo pago entra na meta do mês, e o valor por hora é o fixo dividido pelas horas lançadas no mês
            {st?.monthMin ? ` (${monthName(month)}: ${fmtHours(st.monthMin)} → ${fmtUsd(hourly(fixedCents, st.monthMin) ?? 0)}/h)` : ''}.
          </p>
        </>}
      </div>

      <div className="field"><span>Links</span>
        {links.map(l => (
          <div key={l.id} className="link-row">
            <a href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
            <span className="q-meta">{l.url.replace(/^https?:\/\/(www\.)?/, '').replace(/^mailto:/, '')}</span>
            <button type="button" className="icon-btn" onClick={() => setLinks(v => v.filter(x => x.id !== l.id))} aria-label={`Tirar ${l.label}`}><Icon id="x" size={12} /></button>
          </div>
        ))}
        <div className="obj-edit">
          <input id="cl-new-link" value={newLink} placeholder="youtube.com/@canal, instagram, e-mail..." onChange={e => setNewLink(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
          <button type="button" className="btn small" disabled={!newLink.trim()} onClick={addLink}>Adicionar</button>
        </div>
        {yt && !avatar && <p className="q-meta">Tem link do YouTube: toque em “Puxar foto do YouTube” lá em cima.</p>}
      </div>

      {billing === 'project' && <div className="field"><span>Preços</span>
        {prices.map(pr => (
          <div key={pr.id} className="link-row">
            <b>{pr.label}</b><span className="gold-t">{fmtUsd(pr.usdCents)}</span>
            <button type="button" className="icon-btn" onClick={() => setPrices(v => v.filter(x => x.id !== pr.id))} aria-label={`Tirar ${pr.label}`}><Icon id="x" size={12} /></button>
          </div>
        ))}
        <div className="price-add">
          <input id="cl-price-label" value={priceLabel} placeholder="Ex.: Vídeo longo" maxLength={30} onChange={e => setPriceLabel(e.target.value)} />
          <div className="money-input"><em className="usd-em">US$</em><input id="cl-price-amt" inputMode="decimal" value={priceAmt} placeholder="0,00" onChange={e => setPriceAmt(e.target.value)} /></div>
          <button type="button" className="btn small" disabled={!priceLabel.trim() || parseCents(priceAmt) <= 0}
            onClick={() => { setPrices(v => [...v, { id: uid(), label: priceLabel.trim(), usdCents: parseCents(priceAmt) }]); setPriceLabel(''); setPriceAmt(''); }}>Adicionar</button>
        </div>
        <p className="q-meta">Esses preços aparecem como atalho ao criar um projeto para este cliente.</p>
      </div>}

      <label className="field">
        <span>Anotações</span>
        <textarea id="cl-notes" className="backup notes-area" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Estilo de edição, preferências, como paga, contatos..." />
      </label>

      {projects.length > 0 && (
        <div className="field"><span>Projetos ({projects.length})</span>
          {projects.map(p => (
            <button key={p.id} type="button" className="exp-item" onClick={() => { save(); onOpenProject(p.id); }}>
              <span className="q-main"><span className="q-name">{p.name}</span><span className="q-meta">{PROJ_STAGES[STAGE_INDEX[p.status]].label} · {fmtHours(projectMinutes(p))}</span></span>
              <b>{fmtUsd(projectValue(s, p))}</b>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
