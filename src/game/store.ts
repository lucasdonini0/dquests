import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { Preferences } from '../storage';
import {
  ACHIEVEMENTS, BOSSES, CAT, DIFF, catTone,
  type AttrId, type FinCatId, type FinKind, type IncCatId, type Quality, type CatId, type Counters, type Diff, type FactionId,
} from './data';
import {
  addDays, critChance, dayKey, daysBetween, need, objectiveShare, roll, setDayShift, streakBonus, weekday, weekKey, xpRange,
  DEBUFF_CAP, EARLY_MAX, EARLY_STEP, LATE_DEBUFF, LATE_MAX, LATE_STEP, FOCUS_BONUS, PAID_FORTUNE_SHARE, HABIT_FACTOR, HEARTH_COOLDOWN_DAYS, MAX_LEVEL,
  BOSS_RESTED, restedDailyCap, restedMax, restedPerLeisure, WEEKLY_FACTOR, XP_MULT,
  BOSS_FROM_LAST_WEEK, BOSS_MIN_HP, PROJECT_DELIVERY_FACTOR, PROJECT_STAGE_FACTOR, WORKOUT_PLAN_BONUS,
} from './rules';
import { emit, type FxEvent } from '../fx/bus';

export type QuestType = 'daily' | 'weekly' | 'once';

export interface Quest {
  id: string; name: string; cat: CatId; diff: Diff; type: QuestType;
  days: number[];   // diárias: dias da semana (0 = seg)
  quota: number;    // semanais: vezes por semana
  perDay?: number;  // diárias: vezes por dia (sem o campo = 1)
  rank?: number;    // diárias e semanais: posição na lista (só visual)
  inPublic?: boolean; // social feito em público: bônus de XP e masmorra verde
  count?: boolean;  // semanais: quota é uma quantidade (ex.: 140 clientes), somada aos poucos e sem limite de uma por dia
  createdAt: string;
  doneOn?: string;  // avulsas
  paid?: boolean;   // trabalho que dá dinheiro: divide o atributo entre Maestria e Fortuna
  objectives?: Objective[];
  due?: string;      // avulsas: data de entrega (YYYY-MM-DD)
  dueTime?: string;  // hora opcional (HH:MM)
  dueRank?: number;  // ordem entre avulsas que vencem no mesmo dia e hora
  onlyDay?: boolean; // avulsa só pode ser feita no dia do prazo: antes fica travada, depois some
  objDone?: { key: string; ids: string[] }; // objetivos marcados no período atual
  failed?: string;  // diárias e semanais: dia (YYYY-MM-DD) ou semana marcada como falha
  note?: string;    // anotação livre do jogador
  updatedAt?: number;
}
/** Essencial: obrigatório para entregar e paga XP na hora. Extra: opcional, vira bônus na entrega. */
export interface Objective { id: string; text: string; extra?: boolean }
export interface Habit {
  id: string; name: string; cat: CatId;
  /** Extras opcionais: depois de marcar o hábito no dia, cada extra feito dá um bônus grande de XP. */
  extras?: { id: string; text: string }[];
  streak: number; best: number; scrolls: number; lastDone: string | null; createdAt: string;
  failed?: string;  // dia (YYYY-MM-DD) marcado como não cumprido
  updatedAt?: number;
}
export interface Debuff {
  id: string; kind: 'exaustao' | 'maldicao' | 'prazo'; pct: number; from: string; until: string; questId?: string; label: string;
}
export interface Boss {
  week: string; name: string; quote: string; max: number; hp: number; enraged: boolean; killed: boolean;
  log: { day: string; dmg: number; what: string }[];
}
export type Portrait = { kind: 'preset'; id: string } | { kind: 'photo'; data: string };
export interface Hero {
  name: string; portrait: Portrait; title: string | null; gender: 'm' | 'f'; focus: AttrId | null; created: boolean;
  updatedAt?: number;
}
export interface Settings { sound: boolean; volume: number; haptics: boolean; reminders: boolean; theme?: 'log' | 'dark'; addMode?: 'ask' | 'split';
  /** Modo 24h: minutos depois da meia-noite em que o dia vira (o horário em que o modo foi ligado). Sem o campo = meia-noite. */
  dayStartMin?: number }

/** Um lançamento de finanças: gasto (padrão) ou ganho. Valor em centavos. */
export interface Expense {
  id: string; day: string; cents: number; kind?: FinKind; cat: FinCatId; note: string; updatedAt: number;
  parts?: { cat: FinCatId; cents: number }[]; // dividido entre categorias (cents = soma); cat = a primeira
}
/** Partes de um lançamento: as divididas, ou a categoria única com o valor inteiro. */
export function entryParts(e: Expense) {
  return e.parts?.length ? e.parts : [{ cat: e.cat, cents: e.cents }];
}
/** Quanto de um lançamento cai numa categoria. */
export function catCents(e: Expense, cat: FinCatId) {
  return entryParts(e).filter(p => p.cat === cat).reduce((t, p) => t + p.cents, 0);
}

/** Meta de faturamento a partir de um mês (vale até a próxima mudança). Valor em centavos. */
export interface FinGoal { month: string; cents: number; cats: IncCatId[]; updatedAt: number }

// ---------- treino ----------
export interface Gym { id: string; name: string; updatedAt: number }
/** Exercício cadastrado. kind: máquina ou peso livre. */
export interface Exercise { id: string; name: string; kind?: 'machine' | 'free'; muscle?: string; updatedAt: number }
/** Músculos sugeridos; o usuário pode criar outros. */
export const MUSCLES = ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Antebraço', 'Quadríceps', 'Posterior', 'Glúteos', 'Panturrilha', 'Abdômen', 'Cardio'];
/** Exercício dentro de um treino fixo: séries válidas e faixa de reps, mais aquecimento e preparatórias opcionais. */
export interface RoutineItem {
  exId: string; sets: number; repsMin: number; repsMax: number;
  warmSets?: number; warmMin?: number; warmMax?: number;
  prepSets?: number; prepMin?: number; prepMax?: number;
}
/** Tipo da série: aquecimento, preparatória ou (sem kind) série válida. */
export type SetKind = 'warm' | 'prep';
export interface WorkSet { kg: number; reps: number; kind?: SetKind }
export const MAX_WARM = 5;
/** Padrão de cada exercício novo: 2 séries válidas de 6–8, 1 aquecimento de 10–12 e 1 preparatória de 3–4. */
export const SET_DEFAULTS = { sets: 2, repsMin: 6, repsMax: 8, warmSets: 1, warmMin: 10, warmMax: 12, prepSets: 1, prepMin: 3, prepMax: 4 };
export const MAX_PREP = 2;
/** Só as séries válidas contam para progresso, comparação e "treino completo". */
export const isWork = (x: WorkSet) => !x.kind;
/** Treino fixo: dias da semana, academia padrão e exercícios planejados. */
export interface Routine {
  id: string; name: string; days: number[]; gymId: string | null; questId: string | null;
  items: RoutineItem[]; updatedAt: number;
}
/** Um treino feito (ou em andamento). routineId null = treino avulso. */
export interface Session {
  id: string; day: string; routineId: string | null; name: string; gymId: string | null;
  startedAt: number | null; minutes: number; items: { exId: string; sets: WorkSet[] }[];
  notes: string; done: boolean; updatedAt: number;
}

// ---------- mesa de missões (clientes e projetos) ----------
export interface ClientLink { id: string; label: string; url: string }
export interface ClientPrice { id: string; label: string; usdCents: number }
export interface Client {
  id: string; name: string; avatar?: string; links: ClientLink[]; notes: string; prices: ClientPrice[]; updatedAt: number;
  /** Fixo mensal em centavos de US$ (cliente que paga por mês, não por projeto). */
  fixedCents?: number;
  /** Meses (AAAA-MM) em que o fixo já foi pago. */
  fixedPaid?: string[];
}
export type ProjStatus = 'briefing' | 'editing' | 'review' | 'delivered' | 'paid';
const STAGE_ORDER: Record<ProjStatus, number> = { briefing: 0, editing: 1, review: 2, delivered: 3, paid: 4 };
export const PROJ_STAGES: { id: ProjStatus; label: string }[] = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'editing', label: 'Editando' },
  { id: 'review', label: 'Revisão' },
  { id: 'delivered', label: 'Entregue' },
  { id: 'paid', label: 'Pago' },
];
// ---------- leads (só aparecem no app de PC) ----------
export type LeadStage = 'none' | 'cold' | 'warm' | 'fu1' | 'fu2' | 'fu3' | 'closed' | 'denied' | 'ghosted';
/** Grupo de mensagens prontas: follow up 1 e 2 dividem o mesmo grupo. */
export type MsgKind = 'cold' | 'warm' | 'fu' | 'fu3';
export const LEAD_STAGES: { id: LeadStage; label: string; msg?: MsgKind }[] = [
  { id: 'none', label: 'Nenhum' },
  { id: 'cold', label: 'Cold outreach', msg: 'cold' },
  { id: 'warm', label: 'Warm outreach', msg: 'warm' },
  { id: 'fu1', label: 'Follow up 1', msg: 'fu' },
  { id: 'fu2', label: 'Follow up 2', msg: 'fu' },
  { id: 'fu3', label: 'Follow up 3', msg: 'fu3' },
  { id: 'closed', label: 'Closed' },
  { id: 'denied', label: 'Denied' },
  { id: 'ghosted', label: 'Ghosted' },
];
export const MSG_KINDS: { id: MsgKind; label: string }[] = [
  { id: 'cold', label: 'Cold' },
  { id: 'warm', label: 'Warm' },
  { id: 'fu', label: 'Follow up 1 e 2' },
  { id: 'fu3', label: 'Follow up 3' },
];
/** Cada mudança de estágio, com a mensagem usada (null = nenhuma das prontas). */
export interface LeadStep { stage: LeadStage; at: number; msgId?: string | null }
export interface Lead { id: string; name: string; avatar?: string; contact: string; note: string; stage: LeadStage; history: LeadStep[]; createdAt: number; updatedAt: number }
export interface LeadMsg { id: string; kind: MsgKind; title: string; text: string; updatedAt: number }
/** Quantas vezes uma mensagem pronta foi usada e quando foi a última. */
export function msgUsage(leads: Lead[], msgId: string) {
  let count = 0, last = 0;
  for (const l of leads) for (const h of l.history) if (h.msgId === msgId) { count++; last = Math.max(last, h.at); }
  return { count, last };
}

/** Trecho de trabalho: cronômetro (start/end) ou horas lançadas à mão (minutes). */
export interface TimeEntry { id: string; day: string; start?: number; end?: number | null; minutes?: number }
export interface Project {
  id: string; clientId: string | null; name: string; status: ProjStatus; usdCents: number;
  due?: string; dueTime?: string; createdAt: string; deliveredAt?: string; paidAt?: string;
  time: TimeEntry[]; notes: string; rewarded: ProjStatus[]; updatedAt: number;
}

/** Uma conclusão de missão ou hábito. Guardar o evento permite juntar saves de dois aparelhos sem duplicar. */
export interface CompletionEvent {
  id: string; at: number; day: string;
  kind: 'quest' | 'habit' | 'habitExtra' | 'objective' | 'workout' | 'project';
  ref: string; name: string; cat: CatId; qtype?: QuestType;
  obj?: string; pkey?: string; // objetivo marcado e o período a que ele pertence
  amount?: number; // semanal por quantidade: quanto essa conclusão somou
  partial?: boolean; // diária com "vezes por dia": uma das vezes antes da última, só marca (o XP vem todo na última)
  reps?: number;     // a última dessas vezes: quantas vezes o XP dela já soma
  raw: number; crit: boolean; paid: boolean; elite: boolean;
  /** XP que de fato entrou (com foco, debuff e descanso) e a parte sem descanso; usados para devolver o XP. */
  got?: number; gotBase?: number;
}

export interface GameData {
  version: 1;
  hero: Hero;
  level: number; xp: number; totalXp: number; gold: number;
  /** Escala do XP do save (0.16.0 dobrou tudo). Sem o campo = save de antes, ainda na escala 1. */
  xpScale?: number;
  /** 0.19.6 já pôs o padrão de séries (2 válidas, 1 aquecimento, 1 preparatória) nos treinos fixos. */
  setDefaults?: number;
  rested: number; pendingRested: number; restedToday: number;
  attrXp: Record<AttrId, number>;
  rep: Record<FactionId, number>;
  counters: Counters;
  achievements: Record<string, string>;
  quests: Quest[];
  habits: Habit[];
  dailyDone: Record<string, string[]>;
  habitDone: Record<string, string[]>;
  weeklyCount: Record<string, Record<string, number>>;
  debuffs: Debuff[];
  boss: Boss;
  weekXp: number; lastWeekXp: number;
  hearth: { lastUsed: string | null; protectedDays: string[] };
  xpByDay: Record<string, number>;
  lastProcessed: string;
  report: string[] | null;
  settings: Settings;
  settingsAt: number;
  events: CompletionEvent[];
  expenses: Expense[];
  finGoals: FinGoal[];
  gyms: Gym[];
  exercises: Exercise[];
  routines: Routine[];
  sessions: Session[];
  clients: Client[];
  projects: Project[];
  leads: Lead[];
  leadMsgs: LeadMsg[];
  usdGoals: { month: string; cents: number; updatedAt: number }[];
  deleted: string[];
  rev: number;
}

interface Actions {
  rollover(): void;
  createHero(h: Partial<Hero>): void;
  updateHero(h: Partial<Hero>): void;
  saveQuest(q: Omit<Quest, 'id' | 'createdAt'> & { id?: string }): void;
  deleteQuest(id: string): void;
  setDueOrder(ids: string[]): void;
  setQuestOrder(ids: string[]): void; // ordem das diárias ou das semanais na tela // ordem entre prazos do mesmo dia e hora
  saveHabit(h: { id?: string; name: string; cat: CatId; extras?: { id: string; text: string }[] }): void;
  completeHabitExtra(habitId: string, extraId: string): void;
  deleteHabit(id: string): void;
  failHabit(id: string): void;
  saveExpense(e: Omit<Expense, 'id' | 'updatedAt'> & { id?: string }): void; // gasto ou ganho
  deleteExpense(id: string): void;
  setFinGoal(month: string, cents: number, cats: IncCatId[]): void;
  saveGym(name: string): string;
  ensureExercise(name: string, kind?: Exercise['kind'], muscle?: string): string;
  saveExercise(e: { id: string; name: string; kind: Exercise['kind']; muscle?: string }): void;
  deleteExercise(id: string): void;
  saveRoutine(r: Omit<Routine, 'id' | 'updatedAt'> & { id?: string }): void;
  deleteRoutine(id: string): void;
  startSession(routineId: string | null): string;
  saveSession(s: Session): void;
  finishSession(id: string): void;
  deleteSession(id: string): void;
  saveClient(c: Omit<Client, 'id' | 'updatedAt'> & { id?: string }): string;
  deleteClient(id: string): void;
  saveLead(l: { id?: string; name: string; avatar?: string; contact: string; note: string }): string;
  setLeadStage(id: string, stage: LeadStage, msgId: string | null): void;
  deleteLead(id: string): void;
  saveLeadMsg(m: { id?: string; kind: MsgKind; title: string; text: string }): string;
  deleteLeadMsg(id: string): void;
  saveProject(p: Partial<Project> & { id?: string; name: string }): string;
  deleteProject(id: string): void;
  setProjectStatus(id: string, status: ProjStatus): void;
  /** Devolve o XP de uma etapa já recompensada, para ela poder dar XP de novo. */
  revokeProjectStage(id: string, stage: ProjStatus): void;
  /** Tira o XP de uma conclusão do histórico e desmarca o que ela marcou. */
  revokeXp(eventId: string): void;
  startTimer(projectId: string): void;
  stopTimer(projectId: string): void;
  addTime(projectId: string, minutes: number, day: string): void;
  removeTime(projectId: string, entryId: string): void;
  setUsdGoal(month: string, cents: number): void;
  setFixedPaid(clientId: string, month: string, paid: boolean): void;
  /** Diárias e semanais: marca (ou desmarca) que falhou hoje / nesta semana. */
  failQuest(id: string): void;
  completeQuest(id: string, amount?: number): void; // amount: semanal por quantidade
  completeObjective(questId: string, objId: string): void;
  completeHabit(id: string): void;
  undo(): void;
  canUndo(): boolean;
  /** Refaz nível e XP a partir do XP total (quando a curva de níveis muda pelo config). */
  retune(): void;
  useHearth(): void;
  dismissReport(): void;
  setSettings(s: Partial<Settings>): void;
  /** Modo 24h: ligado, o dia de hoje só termina 24h depois (e os próximos viram nesse horário). */
  setDayMode(on: boolean): void;
  exportJson(): string;
  importJson(json: string): boolean;
  resetAll(): void;
  adoptRemote(d: GameData): void;
  mergeRemote(d: GameData): void;
}

export type Store = GameData & Actions;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const zeroAttr = (): Record<AttrId, number> => ({ forca: 0, intelecto: 0, maestria: 0, fortuna: 0, vigor: 0, espirito: 0, carisma: 0 });
const zeroRep = (): Record<FactionId, number> => ({ carreira: 0, mente: 0, lar: 0, corpo: 0, lacos: 0 });
const EVENT_DAYS = 100;

function newBoss(week: string, hp: number, enraged: boolean, avoid?: string): Boss {
  const pool = BOSSES.filter(b => b.name !== avoid);
  const b = pool[Math.floor(Math.random() * pool.length)];
  const max = Math.round(hp * (enraged ? 1.1 : 1));
  return { week, name: b.name, quote: b.quote, max, hp: max, enraged, killed: false, log: [] };
}

export function freshData(): GameData {
  const today = dayKey();
  return {
    version: 1,
    hero: { name: '', portrait: { kind: 'preset', id: 'paladino' }, title: null, gender: 'm', focus: null, created: false },
    level: 1, xp: 0, totalXp: 0, gold: 0, // sem xpScale: upgrade() marca (num save novo, dobrar zero não muda nada)
    rested: 0, pendingRested: 0, restedToday: 0,
    attrXp: zeroAttr(), rep: zeroRep(),
    counters: { quests: 0, perCat: {}, bossKills: 0, hearthUses: 0, leisure: 0, bestStreak: 0, crits: 0, paid: 0 },
    achievements: {},
    quests: [], habits: [],
    dailyDone: {}, habitDone: {}, weeklyCount: {},
    debuffs: [],
    boss: newBoss(weekKey(today), BOSS_MIN_HP, false),
    weekXp: 0, lastWeekXp: 0,
    hearth: { lastUsed: null, protectedDays: [] },
    xpByDay: {},
    lastProcessed: today,
    report: null,
    settings: { sound: true, volume: 0.7, haptics: true, reminders: true },
    settingsAt: 0,
    events: [],
    expenses: [],
    finGoals: [],
    gyms: [], exercises: [], routines: [], sessions: [],
    clients: [], projects: [], leads: [], leadMsgs: [], usdGoals: [],
    deleted: [],
    rev: 0,
  };
}

// Efeitos visuais ficam desligados enquanto o app junta saves
let silent = false;
const fx = (e: FxEvent) => { if (!silent) emit(e); };

// ---------- prazos ----------
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** Situação do prazo de uma avulsa: dias de folga, ou dias de atraso. Null se não tem prazo ou já foi entregue. */
export function dueInfo(q: Quest, now = new Date(), day = dayKey()) {
  if (q.type !== 'once' || !q.due || q.doneOn || q.onlyDay) return null; // "só neste dia" não atrasa: some
  const days = daysBetween(day, q.due); // positivo = folga, negativo = atraso
  const pastTime = days === 0 && !!q.dueTime && day === dayKey(now) && now.getHours() * 60 + now.getMinutes() > minutes(q.dueTime);
  const late = days < 0 || pastTime;
  return { days, late, lateDays: late ? Math.max(1, -days) : 0, earlyDays: Math.max(0, days) };
}
/** Chave de ordem dos prazos: data e hora (sem hora vai para o fim do dia). */
export const dueSlot = (q: Quest) => `${q.due} ${q.dueTime ?? '99'}`;
/** Avulsas com prazo em aberto, por data de entrega; no mesmo dia e hora vale a ordem que você escolheu. */
export function dueQuests(quests: Quest[]) {
  return quests
    .filter(q => q.type === 'once' && q.due && !q.doneOn)
    .sort((a, b) => dueSlot(a).localeCompare(dueSlot(b)) || (a.dueRank ?? Infinity) - (b.dueRank ?? Infinity));
}
/** Social "em público" ganha XP a mais. */
export const PUBLIC_BONUS = 0.2;
/** Multiplicador de XP da missão: prazo (bônus ou atraso) e social em público. */
export function questMult(q: Quest, now = new Date()) {
  return dueMult(q, now) * (q.cat === 'social' && q.inPublic ? 1 + PUBLIC_BONUS : 1);
}
/** Multiplicador de XP pelo prazo: bônus por antecipar ou desconto por atraso. */
export function dueMult(q: Quest, now = new Date()) {
  const d = dueInfo(q, now);
  if (!d) return 1;
  if (d.late) return 1 - Math.min(LATE_MAX, LATE_STEP * d.lateDays);
  return 1 + Math.min(EARLY_MAX, EARLY_STEP * d.earlyDays);
}
/** Cor mostrada: a da categoria (atrasada continua na cor dela e pisca em vermelho na tela). */
export function questQuality(q: Quest): string {
  return catTone(CAT[q.cat]);
}
/** Quanto a missão atrasada pisca em vermelho: começa leve e chega no máximo no 5º dia. */
export const lateHeat = (lateDays: number) => Math.min(1, 0.2 + 0.16 * lateDays);
/** Prazo de um projeto: vale até ser entregue. */
export function projectDueInfo(p: Project, now = new Date(), day = dayKey()) {
  if (!p.due || p.status === 'delivered' || p.status === 'paid') return null;
  return dueInfo({ type: 'once', due: p.due, dueTime: p.dueTime } as Quest, now, day);
}
export function projectDueMult(p: Project, now = new Date()) {
  const d = projectDueInfo(p, now);
  if (!d) return 1;
  if (d.late) return 1 - Math.min(LATE_MAX, LATE_STEP * d.lateDays);
  return 1 + Math.min(EARLY_MAX, EARLY_STEP * d.earlyDays);
}
export function overdueProjects(s: GameData, day = dayKey(), now = new Date()) {
  return (s.projects ?? []).filter(p => projectDueInfo(p, now, day)?.late);
}
/** Minutos trabalhados num projeto (cronômetro em andamento conta até agora). */
export function projectMinutes(p: Project, now = Date.now()) {
  return p.time.reduce((t, e) => t + (e.minutes ?? (e.start ? ((e.end ?? now) - e.start) / 60000 : 0)), 0);
}
export const runningTimer = (s: GameData) => {
  for (const p of s.projects ?? []) { const e = p.time.find(x => x.start && x.end === null); if (e) return { project: p, entry: e }; }
  return null;
};
export const isFixedClient = (c: Client | null | undefined): c is Client & { fixedCents: number } => !!c && (c.fixedCents ?? 0) > 0;
const entryMinutes = (e: TimeEntry, now = Date.now()) => e.minutes ?? (e.start ? ((e.end ?? now) - e.start) / 60000 : 0);
/** Minutos de cada mês (AAAA-MM) trabalhados nos projetos de um cliente. */
export function clientMonthMinutes(s: GameData, clientId: string) {
  const out = new Map<string, number>();
  for (const p of s.projects ?? []) if (p.clientId === clientId) for (const e of p.time) out.set(e.day.slice(0, 7), (out.get(e.day.slice(0, 7)) ?? 0) + entryMinutes(e));
  return out;
}
/**
 * Quanto do fixo cabe a um projeto: em cada mês, o fixo é dividido entre os projetos
 * do cliente pelas horas trabalhadas. Assim o valor por hora do projeto = fixo / horas do mês.
 */
export function fixedShare(s: GameData, p: Project) {
  const c = s.clients.find(x => x.id === p.clientId);
  if (!isFixedClient(c)) return 0;
  const months = clientMonthMinutes(s, c.id);
  const mine = new Map<string, number>();
  for (const e of p.time) mine.set(e.day.slice(0, 7), (mine.get(e.day.slice(0, 7)) ?? 0) + entryMinutes(e));
  let cents = 0;
  for (const [m, min] of mine) { const all = months.get(m) ?? 0; if (all > 0) cents += c.fixedCents * (min / all); }
  return Math.round(cents);
}
/** Meta mensal em US$: a última definida até o mês. Recebido = projetos pagos no mês + fixos pagos do mês. */
export function usdGoalStatus(s: GameData, month: string) {
  let goal: number | null = null;
  for (const g of [...(s.usdGoals ?? [])].sort((a, b) => a.month.localeCompare(b.month))) if (g.month <= month) goal = g.cents > 0 ? g.cents : null;
  const fixedIds = new Set((s.clients ?? []).filter(isFixedClient).map(c => c.id));
  const perProject = (s.projects ?? []).filter(p => !p.clientId || !fixedIds.has(p.clientId));
  const fixed = (s.clients ?? []).filter(isFixedClient);
  const paid = perProject.filter(p => p.status === 'paid' && p.paidAt?.startsWith(month)).reduce((t, p) => t + p.usdCents, 0)
    + fixed.filter(c => c.fixedPaid?.includes(month)).reduce((t, c) => t + c.fixedCents, 0);
  const toReceive = perProject.filter(p => p.status === 'delivered').reduce((t, p) => t + p.usdCents, 0)
    + fixed.filter(c => !c.fixedPaid?.includes(month)).reduce((t, c) => t + c.fixedCents, 0);
  return { goal, paid, toReceive, reached: goal !== null && paid >= goal };
}
/** XP de cada etapa: avançar dá um pouco; entregar é a recompensa grande da missão principal. */
export function projectStageXp(stage: ProjStatus) {
  return stage === 'delivered' ? xpRange('trabalho', 'heroico', PROJECT_DELIVERY_FACTOR) : xpRange('trabalho', 'normal', PROJECT_STAGE_FACTOR);
}

export function overdueQuests(s: GameData, day = dayKey(), now = new Date()) {
  return s.quests.filter(q => dueInfo(q, now, day)?.late);
}

// ---------- seletores puros ----------
export function activeDebuffs(s: GameData, today = dayKey()) {
  const list = s.debuffs.filter(d => d.from <= today && d.until >= today);
  const late = [...overdueQuests(s, today).map(q => q.name), ...overdueProjects(s, today).map(p => p.name)];
  if (late.length) {
    list.push({
      id: 'prazo', kind: 'prazo', pct: LATE_DEBUFF, from: today, until: today,
      label: `Prazo Estourado: ${late.length === 1 ? `"${late[0]}" está atrasado` : `${late.length} entregas atrasadas`}. −10% de XP até entregar.`,
    });
  }
  return list;
}
export function debuffPct(s: GameData, today = dayKey()) {
  return Math.min(DEBUFF_CAP, activeDebuffs(s, today).reduce((a, d) => a + d.pct, 0));
}
export function dailyDue(q: Quest, day: string) {
  return q.type === 'daily' && q.createdAt <= day && q.days.includes(weekday(day));
}
/** Vezes que a missão foi concluída no dia (diária com "vezes por dia" aparece repetida em dailyDone). */
export function doneCount(s: GameData, id: string, day = dayKey()) {
  return (s.dailyDone[day] ?? []).filter(x => x === id).length;
}
/** Quantas vezes a missão pode ser concluída num dia. */
export const perDayOf = (q?: Quest) => (q?.type === 'daily' ? Math.max(1, q.perDay ?? 1) : 1);
/** Semanal por quantidade: completar a meta toda vale como fazer a missão estes dias (o XP de cada vez é proporcional). */
export const COUNT_WEEK_DAYS = 5;
/** Quantos "dias" de semanal a missão vale na semana: a cota (dias) ou COUNT_WEEK_DAYS (quantidade). */
export const weeklyDays = (q: Quest) => (q.count ? COUNT_WEEK_DAYS : q.quota);
export function weeklyProgress(s: GameData, q: Quest, day = dayKey()) {
  return s.weeklyCount[weekKey(day)]?.[q.id] ?? 0;
}
/** Período dos objetivos: o dia (diária), a vez atual da semana (semanal) ou a missão toda (avulsa). */
/** Período em que uma diária ou semanal pode ser marcada como falha: o dia ou a semana. */
export const failKey = (q: Quest, day = dayKey()) => (q.type === 'weekly' ? weekKey(day) : day);
export const isFailed = (q: Quest, day = dayKey()) => q.type !== 'once' && !!q.failed && q.failed === failKey(q, day);
export function objKey(s: GameData, q: Quest, day = dayKey()) {
  if (q.type === 'daily') return perDayOf(q) > 1 ? `${day}#${doneCount(s, q.id, day)}` : day;
  if (q.type === 'weekly') return `${weekKey(day)}#${weeklyProgress(s, q, day)}`;
  return 'once';
}
export function objProgress(s: GameData, q: Quest, day = dayKey()) {
  const list = q.objectives ?? [];
  const key = objKey(s, q, day);
  const done = new Set(q.objDone?.key === key ? q.objDone.ids : []);
  const required = list.filter(o => !o.extra);
  const extras = list.filter(o => o.extra);
  const count = required.filter(o => done.has(o.id)).length;
  const extraDone = extras.filter(o => done.has(o.id)).length;
  return {
    done, count, total: required.length, extraDone, extraTotal: extras.length,
    ready: count === required.length, extrasPending: extraDone < extras.length,
  };
}
/** Bônus na entrega pelos objetivos extras feitos: +10% cada, até +50%. */
export function extraBonus(extraDone: number) {
  return objectiveShare(extraDone);
}
/** XP de cada objetivo: uma fatia fixa do meio da faixa da missão. */
/** XP de cada objetivo essencial. Extras não pagam na hora. */
export function objectiveXp(q: Quest) {
  const n = q.objectives?.filter(o => !o.extra).length ?? 0;
  if (!n || q.cat === 'lazer') return 0;
  const r = xpRange(q.cat, q.diff, q.type === 'weekly' ? WEEKLY_FACTOR : 1);
  return Math.max(1, Math.round(((r.min + r.max) / 2) * objectiveShare(n) / n));
}

export function hearthReadyIn(s: GameData, today = dayKey()) {
  if (!s.hearth.lastUsed) return 0;
  return Math.max(0, HEARTH_COOLDOWN_DAYS - daysBetween(s.hearth.lastUsed, today));
}
export function attrValue(xp: number) {
  return Math.floor(Math.sqrt(xp / 4));
}
/** Meta de faturamento valendo num mês: a última definida até ele. */
export function goalFor(s: GameData, month: string) {
  let found: FinGoal | null = null;
  for (const g of s.finGoals ?? []) if (g.month <= month && g.cents > 0) found = g;
  return found;
}
/** Quanto do faturamento do mês já entrou, e se a meta foi batida. */
export function goalStatus(s: GameData, month: string) {
  const goal = goalFor(s, month);
  if (!goal) return null;
  const earned = (s.expenses ?? [])
    .filter(e => e.kind === 'in' && e.day.startsWith(month))
    .reduce((t, e) => t + entryParts(e).filter(p => goal.cats.includes(p.cat as IncCatId)).reduce((a, p) => a + p.cents, 0), 0);
  return { goal, earned, reached: earned >= goal.cents };
}

/** Bônus de XP por fazer o treino fixo no dia planejado. */

/** Séries da última vez em que o exercício foi feito (em treinos terminados). */
export function lastSetsFor(s: GameData, exId: string, beforeDay = '9999-12-31', skipId?: string) {
  const done = (s.sessions ?? [])
    .filter(x => x.done && x.id !== skipId && x.day <= beforeDay && x.items.some(i => i.exId === exId && i.sets.length))
    .sort((a, b) => b.day.localeCompare(a.day) || b.updatedAt - a.updatedAt);
  return done[0]?.items.find(i => i.exId === exId)?.sets ?? null;
}

/** Chance de crítico atual, pela Fortuna do herói. */
export function luck(s: GameData) {
  return critChance(attrValue(s.attrXp.fortuna));
}

// ---------- regras de fim de dia e de semana ----------
function endOfDay(s: GameData, prev: string, next: string, report: string[]) {
  const protectedDay = s.hearth.protectedDays.includes(prev);
  const due = s.quests.filter(q => dailyDue(q, prev));
  const done = new Set(s.dailyDone[prev] ?? []);
  const missed = due.filter(q => !done.has(q.id));

  if (!protectedDay && due.length > 0 && (due.length - missed.length) / due.length < 0.5) {
    s.debuffs.push({
      id: uid(), kind: 'exaustao', pct: 0.1, from: next, until: next,
      label: `Exaustão: ${due.length - missed.length} de ${due.length} diárias feitas no dia anterior`,
    });
    if (next === dayKey()) report.push(`Exaustão: você fez ${due.length - missed.length} de ${due.length} diárias ontem. −10% de XP hoje.`);
  } else if (!protectedDay && missed.length > 0 && next === dayKey()) {
    const names = missed.slice(0, 3).map(q => `"${q.name}"`).join(', ') + (missed.length > 3 ? ` e mais ${missed.length - 3}` : '');
    report.push(`Diárias não cumpridas ontem: ${names}.`);
  }
  if (!protectedDay) {
    for (const q of missed) {
      const f = CAT[q.cat].faction;
      if (f) s.rep[f] -= Math.round(CAT[q.cat].base * DIFF[q.diff].mult * 0.5 * XP_MULT);
    }
  }

  for (const q of s.quests) {
    if (q.type !== 'once' || !q.due || q.doneOn || q.due > prev) continue;
    if (q.onlyDay) {
      if (q.due === prev && next === dayKey()) report.push(`Missão perdida: "${q.name}" era só para ontem e saiu da lista.`);
      continue;
    }
    const f = CAT[q.cat].faction;
    if (f) s.rep[f] -= Math.round(CAT[q.cat].base * DIFF[q.diff].mult * 0.5 * XP_MULT);
    if (q.due === prev && next === dayKey()) report.push(`Prazo estourado: "${q.name}" venceu ontem. Ela perde 10% de XP por dia de atraso e você fica com −10% de XP até entregar.`);
  }

  const hDone = new Set(s.habitDone[prev] ?? []);
  for (const h of s.habits) {
    if (h.createdAt > prev || hDone.has(h.id) || protectedDay || h.streak === 0) continue;
    if (h.failed === prev) { // não cumprido de propósito: o pergaminho não salva
      report.push(`Hábito não cumprido: o streak de ${h.streak} dias em "${h.name}" zerou.`);
      h.streak = 0;
      continue;
    }
    if (h.scrolls > 0) {
      h.scrolls--;
      report.push(`Pergaminho de Proteção usado em "${h.name}". Streak de ${h.streak} dias salvo.`);
    } else {
      report.push(`Chama Apagada: o streak de ${h.streak} dias em "${h.name}" zerou.`);
      h.streak = 0;
    }
  }
}

function endOfWeek(s: GameData, week: string, nextMonday: string, report: string[]) {
  const counts = s.weeklyCount[week] ?? {};
  const weekEnd = addDays(week, 6);
  for (const q of s.quests) {
    if (q.type !== 'weekly' || q.createdAt > weekEnd) continue;
    const c = counts[q.id] ?? 0;
    if (c >= q.quota) continue;
    s.debuffs.push({
      id: uid(), kind: 'maldicao', pct: 0.2, from: nextMonday, until: addDays(nextMonday, 6), questId: q.id,
      label: `Maldição da Procrastinação: "${q.name}" ficou em ${c}/${q.quota}. Complete esta semana para se redimir.`,
    });
    const f = CAT[q.cat].faction;
    // a reputação perdida é pelo pedaço que faltou (em "dias" de semanal)
    if (f) s.rep[f] -= Math.round(CAT[q.cat].base * DIFF[q.diff].mult * weeklyDays(q) * (1 - c / q.quota) * XP_MULT);
    report.push(`Maldição da Procrastinação: "${q.name}" ficou em ${c}/${q.quota}. −20% de XP até você completar ela nesta semana.`);
  }
  const old = s.boss;
  if (!old.killed) report.push(`${old.name} escapou. O próximo chefe chega enfurecido (+10% de vida).`);
  s.lastWeekXp = s.weekXp;
  s.weekXp = 0;
  s.boss = newBoss(nextMonday, Math.max(BOSS_MIN_HP, Math.round(s.lastWeekXp * BOSS_FROM_LAST_WEEK)), !old.killed, old.name);
  report.push(`Novo chefe da semana: ${s.boss.name}.`);
}

/** Processa os dias que passaram desde a última abertura. Não faz nada se já está em dia. */
/** Avulsa que já saiu da lista: concluída antes de hoje, ou "só neste dia" cujo dia passou. */
const oldOnce = (q: Quest, today: string) => q.type === 'once'
  && ((!!q.doneOn && q.doneOn < today) || (!!q.onlyDay && !q.doneOn && !!q.due && q.due < today));
/** Avulsa "só neste dia" antes do dia dela: aparece, mas ainda não dá para fazer. */
export const notYourDay = (q: Quest, today = dayKey()) => q.type === 'once' && !!q.onlyDay && !!q.due && q.due !== today;

function rolloverData(s: GameData, today: string): string[] {
  const report: string[] = [];
  if (s.lastProcessed >= today) return report;
  let d = s.lastProcessed;
  if (daysBetween(d, today) > 60) d = addDays(today, -60);
  while (d < today) {
    const next = addDays(d, 1);
    endOfDay(s, d, next, report);
    if (weekday(next) === 0) endOfWeek(s, weekKey(d), next, report);
    d = next;
  }
  if (s.pendingRested > 0) {
    const before = s.rested;
    s.rested = Math.min(restedMax(s.level), s.rested + s.pendingRested);
    if (s.rested > before) report.unshift(`Você está Descansado: +${s.rested - before} de XP bônus para gastar hoje.`);
  }
  s.pendingRested = 0;
  s.restedToday = 0;
  s.debuffs = s.debuffs.filter(x => x.until >= today);
  // avulsas concluídas somem na virada; ir para deleted impede a sincronização de trazer de volta
  for (const q of s.quests) if (oldOnce(q, today)) s.deleted.push(q.id);
  s.quests = s.quests.filter(q => !oldOnce(q, today));
  const cutoff = addDays(today, -70);
  for (const m of [s.dailyDone, s.habitDone]) for (const k of Object.keys(m)) if (k < cutoff) delete m[k];
  for (const k of Object.keys(s.weeklyCount)) if (k < cutoff) delete s.weeklyCount[k];
  s.hearth.protectedDays = s.hearth.protectedDays.filter(k => k >= cutoff);
  const evCut = addDays(today, -EVENT_DAYS);
  s.events = s.events.filter(e => e.day >= evCut);
  s.lastProcessed = today;
  return report;
}

function checkAchievements(s: GameData) {
  const today = dayKey();
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (a.test({ level: s.level, c: s.counters, rep: s.rep })) {
      s.achievements[a.id] = today;
      fx({ type: 'achievement', id: a.id });
    }
  }
}

interface GrantResult { total: number; bonus: number; levels: number[] }

/** Aplica foco, debuffs e descanso e distribui o XP por nível, atributo, reputação e chefe. */
function grant(s: GameData, raw: number, cat: CatId, what: string, paid: boolean, day: string): GrantResult {
  const c = CAT[cat];
  const focus = s.hero.focus === c.attr ? 1 + FOCUS_BONUS : 1;
  const base = Math.max(1, Math.round(raw * focus * (1 - debuffPct(s, day))));
  const bonus = Math.min(base, s.rested);
  s.rested -= bonus;
  const total = base + bonus;

  const levels: number[] = [];
  if (s.level < MAX_LEVEL) {
    s.xp += total;
    while (s.level < MAX_LEVEL && s.xp >= need(s.level)) {
      s.xp -= need(s.level);
      s.level++;
      levels.push(s.level);
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }
  s.totalXp += total;
  s.gold += Math.round(total / 10);
  if (paid) {
    s.attrXp.maestria += Math.ceil(total * (1 - PAID_FORTUNE_SHARE));
    s.attrXp.fortuna += Math.floor(total * PAID_FORTUNE_SHARE);
  } else {
    s.attrXp[c.attr] += total;
  }
  if (c.faction) s.rep[c.faction] += base;
  s.xpByDay[day] = (s.xpByDay[day] ?? 0) + total;

  if (weekKey(day) === s.boss.week) {
    s.weekXp += total;
    if (!s.boss.killed) {
      s.boss.hp = Math.max(0, s.boss.hp - total);
      s.boss.log.unshift({ day, dmg: total, what });
      s.boss.log = s.boss.log.slice(0, 40);
      if (s.boss.hp === 0) {
        s.boss.killed = true;
        s.counters.bossKills++;
        s.gold += 500;
        s.pendingRested = Math.min(restedMax(s.level), s.pendingRested + BOSS_RESTED);
        fx({ type: 'boss', name: s.boss.name });
      }
    }
  }
  for (const l of levels) fx({ type: 'levelup', level: l });
  return { total, bonus, levels };
}

function addRested(s: GameData, amount: number, day: string) {
  s.attrXp.espirito += amount;
  s.counters.leisure++;
  if (day < s.lastProcessed) {
    // lazer de um dia que já virou (veio de outro aparelho): o descanso já vale hoje
    s.rested = Math.min(restedMax(s.level), s.rested + amount);
    return amount;
  }
  const room = Math.max(0, restedDailyCap(s.level) - s.restedToday);
  const got = Math.min(room, amount);
  s.restedToday += got;
  s.pendingRested = Math.min(restedMax(s.level), s.pendingRested + got);
  return got;
}

/** Cada extra de hábito vale 1,5 missão normal da categoria (2,5× o hábito), com o bônus de streak por cima. */
export const HABIT_EXTRA_FACTOR = 1.5;
/** Extras do hábito já feitos no dia (vêm dos eventos, então sincronizam e se desfazem junto). */
export function habitExtrasDone(s: GameData, habitId: string, day: string) {
  return new Set(s.events.filter(e => e.kind === 'habitExtra' && e.ref === habitId && e.day === day).map(e => e.obj));
}

/** Aplica uma conclusão. Devolve false se ela já estava marcada (evento repetido vindo de outro aparelho). */
function applyEvent(s: GameData, ev: CompletionEvent): boolean {
  if (ev.kind === 'workout' || ev.kind === 'project') {
    if (s.events.some(e => e.id === ev.id)) return false;
  } else if (ev.kind === 'habitExtra') {
    if (habitExtrasDone(s, ev.ref, ev.day).has(ev.obj)) return false;
  } else if (ev.kind === 'objective') {
    const quest = s.quests.find(x => x.id === ev.ref);
    if (quest && ev.obj && ev.pkey) {
      if (quest.objDone?.key !== ev.pkey) quest.objDone = { key: ev.pkey, ids: [] };
      if (quest.objDone.ids.includes(ev.obj)) return false;
      quest.objDone.ids.push(ev.obj);
    }
  } else if (ev.kind === 'quest') {
    const quest = s.quests.find(x => x.id === ev.ref);
    // uma conclusão por dia, inclusive nas semanais; diária com "vezes por dia" até o limite dela;
    // semanal por quantidade soma quantas vezes quiser no dia
    if (!ev.amount && doneCount(s, ev.ref, ev.day) >= perDayOf(quest)) return false;
    if (ev.qtype === 'weekly') {
      const wk = weekKey(ev.day);
      s.weeklyCount[wk] = s.weeklyCount[wk] ?? {};
      if (quest && (s.weeklyCount[wk][ev.ref] ?? 0) >= quest.quota) return false;
      s.weeklyCount[wk][ev.ref] = (s.weeklyCount[wk][ev.ref] ?? 0) + (ev.amount ?? 1);
    } else if (quest && ev.qtype === 'once') {
      quest.doneOn = ev.day;
    }
    s.dailyDone[ev.day] = [...(s.dailyDone[ev.day] ?? []), ev.ref];
  } else if (ev.kind === 'habit') {
    if ((s.habitDone[ev.day] ?? []).includes(ev.ref)) return false;
    s.habitDone[ev.day] = [...(s.habitDone[ev.day] ?? []), ev.ref];
    const h = s.habits.find(x => x.id === ev.ref);
    if (h && (!h.lastDone || h.lastDone < ev.day)) {
      h.lastDone = ev.day;
      h.streak++;
      h.best = Math.max(h.best, h.streak);
      if (h.streak % 7 === 0 && h.scrolls < 3) h.scrolls++;
      s.counters.bestStreak = Math.max(s.counters.bestStreak, h.streak);
    }
  }
  s.events.push(ev);

  if (ev.partial) { fx({ type: 'progress', anchor: ev.ref, text: `${doneCount(s, ev.ref, ev.day)}/${perDayOf(s.quests.find(x => x.id === ev.ref))}` }); return true; } // vez do meio: só a bolinha
  if (ev.kind === 'objective' && ev.raw <= 0) return true; // objetivo de lazer só marca progresso
  if (ev.cat === 'lazer' && ev.kind !== 'objective') {
    const got = addRested(s, restedPerLeisure(s.level) * (ev.reps ?? 1), ev.day);
    fx({ type: 'rested', anchor: ev.ref, amount: got });
    return true;
  }

  if (ev.elite) {
    const redeemed = s.debuffs.filter(d => d.kind === 'maldicao' && d.questId === ev.ref && d.from <= ev.day);
    if (redeemed.length) {
      s.debuffs = s.debuffs.filter(d => !redeemed.includes(d));
      fx({ type: 'redeemed', name: ev.name });
    }
  }
  if (ev.kind === 'quest') s.counters.quests++;
  if (ev.kind !== 'objective' && ev.kind !== 'habitExtra') s.counters.perCat[ev.cat] = (s.counters.perCat[ev.cat] ?? 0) + 1;
  if (ev.crit) s.counters.crits++;
  if (ev.paid) s.counters.paid++;
  const g = grant(s, ev.raw, ev.cat, ev.name, ev.paid, ev.day);
  ev.got = g.total;
  ev.gotBase = g.total - g.bonus;
  fx({ type: 'xp', anchor: ev.ref, amount: g.total, rested: g.bonus, crit: ev.crit, elite: ev.elite, name: ev.name, kind: ev.kind });
  return true;
}

/**
 * Desfaz uma conclusão: tira o XP (podendo voltar de nível), o ouro, atributo, reputação,
 * contadores e o dano no chefe, e marca o evento como apagado para a sincronização não trazê-lo de volta.
 * Eventos antigos não guardam o XP que entrou; aí vale o raw.
 */
/** Desmarca o que a conclusão marcou (missão feita no dia, hábito e sequência, objetivo, etapa da Mesa). */
function undoCompletion(s: GameData, ev: CompletionEvent) {
  if (ev.kind === 'quest') {
    // tira uma vez só (diária com "vezes por dia" pode ter várias)
    const list = s.dailyDone[ev.day] ?? [];
    const at = list.lastIndexOf(ev.ref);
    if (at >= 0) s.dailyDone[ev.day] = [...list.slice(0, at), ...list.slice(at + 1)];
    const q = s.quests.find(x => x.id === ev.ref);
    if (ev.qtype === 'weekly') {
      const wk = s.weeklyCount[weekKey(ev.day)];
      if (wk?.[ev.ref]) wk[ev.ref] = Math.max(0, wk[ev.ref] - (ev.amount ?? 1));
    } else if (q && ev.qtype === 'once' && q.doneOn === ev.day) {
      q.doneOn = undefined;
    }
  } else if (ev.kind === 'habit') {
    s.habitDone[ev.day] = (s.habitDone[ev.day] ?? []).filter(id => id !== ev.ref);
    const h = s.habits.find(x => x.id === ev.ref);
    if (h && h.lastDone === ev.day) {
      h.streak = Math.max(0, h.streak - 1);
      h.lastDone = Object.keys(s.habitDone).filter(d => d < ev.day && s.habitDone[d].includes(h.id)).sort().pop() ?? null;
    }
  } else if (ev.kind === 'objective') {
    const q = s.quests.find(x => x.id === ev.ref);
    if (q?.objDone && q.objDone.key === ev.pkey) q.objDone.ids = q.objDone.ids.filter(id => id !== ev.obj);
  } else if (ev.kind === 'project') {
    const p = s.projects.find(x => x.id === ev.ref);
    const label = ev.name.slice(ev.name.lastIndexOf(': ') + 2);
    const stage = PROJ_STAGES.find(x => x.label === label)?.id;
    if (p && stage) { p.rewarded = p.rewarded.filter(x => x !== stage); p.updatedAt = Date.now(); }
  }
}

function revokeEvent(s: GameData, ev: CompletionEvent) {
  if (ev.partial) { // não deu XP nem contou: só desmarca
    undoCompletion(s, ev);
    s.events = s.events.filter(e => e.id !== ev.id);
    if (!s.deleted.includes(ev.id)) s.deleted.push(ev.id);
    return;
  }
  const total = ev.got ?? ev.raw;
  const base = ev.gotBase ?? total;
  if (s.level < MAX_LEVEL) {
    s.xp -= total;
    while (s.xp < 0 && s.level > 1) { s.level--; s.xp += need(s.level); }
    s.xp = Math.max(0, s.xp);
  }
  s.totalXp = Math.max(0, s.totalXp - total);
  s.gold = Math.max(0, s.gold - Math.round(total / 10));
  const c = CAT[ev.cat];
  if (ev.paid) {
    s.attrXp.maestria = Math.max(0, s.attrXp.maestria - Math.ceil(total * (1 - PAID_FORTUNE_SHARE)));
    s.attrXp.fortuna = Math.max(0, s.attrXp.fortuna - Math.floor(total * PAID_FORTUNE_SHARE));
  } else {
    s.attrXp[c.attr] = Math.max(0, s.attrXp[c.attr] - total);
  }
  if (c.faction) s.rep[c.faction] -= base;
  if (s.xpByDay[ev.day]) s.xpByDay[ev.day] = Math.max(0, s.xpByDay[ev.day] - total);
  if (weekKey(ev.day) === s.boss.week) {
    s.weekXp = Math.max(0, s.weekXp - total);
    if (!s.boss.killed) {
      s.boss.hp = Math.min(s.boss.max, s.boss.hp + total);
      const i = s.boss.log.findIndex(l => l.what === ev.name && l.dmg === total && l.day === ev.day);
      if (i >= 0) s.boss.log.splice(i, 1);
    }
  }
  if (ev.kind === 'quest') s.counters.quests = Math.max(0, s.counters.quests - 1);
  if (ev.kind !== 'objective' && ev.kind !== 'habitExtra') s.counters.perCat[ev.cat] = Math.max(0, (s.counters.perCat[ev.cat] ?? 0) - 1);
  if (ev.crit) s.counters.crits = Math.max(0, s.counters.crits - 1);
  if (ev.paid) s.counters.paid = Math.max(0, s.counters.paid - 1);
  undoCompletion(s, ev);
  s.events = s.events.filter(e => e.id !== ev.id);
  if (!s.deleted.includes(ev.id)) s.deleted.push(ev.id);
}

/**
 * Junta o save deste aparelho (local) no save da nuvem (remote).
 * A nuvem é a base; por cima entram as edições mais novas e as conclusões que só este aparelho tem.
 */
export function mergeData(remote: GameData, local: GameData, today = dayKey()): GameData {
  const s = clone(remote);
  silent = true;
  try {
    rolloverData(s, today);

    s.deleted = [...new Set([...s.deleted, ...local.deleted])];
    const gone = new Set(s.deleted);

    for (const q of local.quests) {
      if (gone.has(q.id)) continue;
      const r = s.quests.find(x => x.id === q.id);
      if (!r) s.quests.push(clone(q));
      else if ((q.updatedAt ?? 0) > (r.updatedAt ?? 0)) {
        Object.assign(r, { name: q.name, cat: q.cat, diff: q.diff, type: q.type, days: q.days, quota: q.quota, perDay: q.perDay, count: q.count, rank: q.rank, inPublic: q.inPublic, paid: q.paid, objectives: q.objectives, due: q.due, dueTime: q.dueTime, onlyDay: q.onlyDay, dueRank: q.dueRank, failed: q.failed, note: q.note, updatedAt: q.updatedAt });
      }
    }
    s.quests = s.quests.filter(q => !gone.has(q.id) && !oldOnce(q, today));
    for (const h of local.habits) {
      if (gone.has(h.id)) continue;
      const r = s.habits.find(x => x.id === h.id);
      if (!r) s.habits.push(clone(h));
      else if ((h.updatedAt ?? 0) > (r.updatedAt ?? 0)) Object.assign(r, { name: h.name, cat: h.cat, extras: h.extras, failed: h.failed, updatedAt: h.updatedAt });
    }
    s.habits = s.habits.filter(h => !gone.has(h.id));
    for (const e of local.expenses ?? []) {
      if (gone.has(e.id)) continue;
      const i = s.expenses.findIndex(x => x.id === e.id);
      if (i < 0) s.expenses.push(clone(e));
      else if (e.updatedAt > s.expenses[i].updatedAt) s.expenses[i] = clone(e);
    }
    s.expenses = s.expenses.filter(e => !gone.has(e.id));
    for (const key of ['gyms', 'exercises', 'routines', 'sessions', 'clients', 'projects', 'leads', 'leadMsgs'] as const) {
      const list = s[key] as { id: string; updatedAt: number }[];
      for (const item of (local[key] ?? []) as { id: string; updatedAt: number }[]) {
        if (gone.has(item.id)) continue;
        const i = list.findIndex(x => x.id === item.id);
        if (i < 0) list.push(clone(item));
        else if (item.updatedAt > list[i].updatedAt) list[i] = clone(item);
      }
      (s[key] as unknown) = list.filter(x => !gone.has(x.id));
    }
    for (const g of local.usdGoals ?? []) {
      const i = s.usdGoals.findIndex(x => x.month === g.month);
      if (i < 0) s.usdGoals.push(clone(g));
      else if (g.updatedAt > s.usdGoals[i].updatedAt) s.usdGoals[i] = clone(g);
    }
    for (const g of local.finGoals ?? []) {
      const i = s.finGoals.findIndex(x => x.month === g.month);
      if (i < 0) s.finGoals.push(clone(g));
      else if (g.updatedAt > s.finGoals[i].updatedAt) s.finGoals[i] = clone(g);
    }

    if ((local.hero.updatedAt ?? 0) > (s.hero.updatedAt ?? 0)) s.hero = clone(local.hero);
    if (local.settingsAt > s.settingsAt) { s.settings = { ...local.settings }; s.settingsAt = local.settingsAt; }

    s.hearth.protectedDays = [...new Set([...s.hearth.protectedDays, ...local.hearth.protectedDays])];
    if (local.hearth.lastUsed && (!s.hearth.lastUsed || local.hearth.lastUsed > s.hearth.lastUsed)) s.hearth.lastUsed = local.hearth.lastUsed;
    s.counters.hearthUses = Math.max(s.counters.hearthUses, local.counters.hearthUses);
    if (s.hearth.protectedDays.includes(today)) s.debuffs = s.debuffs.filter(d => !(d.kind === 'exaustao' && d.from <= today));

    const known = new Set(s.events.map(e => e.id));
    const evCut = addDays(today, -EVENT_DAYS);
    const pastDays = new Set<string>();
    for (const ev of [...local.events].sort((a, b) => a.at - b.at)) {
      if (known.has(ev.id) || gone.has(ev.id) || ev.day < evCut) continue;
      if (applyEvent(s, ev) && ev.day < today) pastDays.add(ev.day);
    }
    // XP devolvido neste aparelho (evento marcado como apagado) que a nuvem ainda conta
    for (const ev of s.events.filter(e => gone.has(e.id))) revokeEvent(s, ev);
    // Se uma conclusão antiga chegou depois da virada, revê a Exaustão daquele dia
    for (const d of pastDays) {
      const due = s.quests.filter(q => dailyDue(q, d));
      const done = new Set(s.dailyDone[d] ?? []);
      if (due.length && due.filter(q => done.has(q.id)).length / due.length >= 0.5) {
        s.debuffs = s.debuffs.filter(x => !(x.kind === 'exaustao' && x.from === addDays(d, 1)));
      }
    }

    for (const [id, when] of Object.entries(local.achievements)) {
      if (!s.achievements[id] || when < s.achievements[id]) s.achievements[id] = when;
    }
    checkAchievements(s);
    s.report = local.report;
    s.rev = Date.now();
  } finally {
    silent = false;
  }
  return s;
}

/** Ajusta saves antigos para o formato atual. */
export function upgrade(d: GameData): GameData {
  // 0.3.0: a categoria Finanças virou Trabalho remunerado
  const legacy = (c: string) => c === 'financas';
  for (const q of d.quests ?? []) if (legacy(q.cat)) { q.cat = 'trabalho'; q.paid = true; }
  for (const h of d.habits ?? []) if (legacy(h.cat)) h.cat = 'trabalho';
  const per = d.counters?.perCat as Record<string, number> | undefined;
  if (d.counters) {
    d.counters.paid = (d.counters.paid ?? 0) + (per?.financas ?? 0);
    if (per) delete per.financas;
  }
  // 0.4.0: sincronização
  d.events = d.events ?? [];
  // 0.8.0: gastos
  d.expenses = d.expenses ?? [];
  d.finGoals = d.finGoals ?? [];
  // 0.11.0: treino
  d.gyms = d.gyms ?? [];
  d.exercises = d.exercises ?? [];
  d.routines = d.routines ?? [];
  d.sessions = d.sessions ?? [];
  // 0.14.0: mesa de missões
  d.clients = d.clients ?? [];
  d.projects = d.projects ?? [];
  d.usdGoals = d.usdGoals ?? [];
  // 0.22.0: leads
  d.leads = d.leads ?? [];
  d.leadMsgs = d.leadMsgs ?? [];
  // 0.16.0: XP em dobro e curva nova. Dobra o que já foi ganho (uma vez só, marcado em xpScale)
  // e refaz nível e XP a partir do total. Vale também para o save que chega da nuvem.
  if ((d.xpScale ?? 1) < XP_MULT) {
    const k = XP_MULT / (d.xpScale ?? 1);
    const x = (n: number) => Math.round(n * k);
    d.totalXp = x(d.totalXp); d.gold = x(d.gold);
    d.rested = Math.min(restedMax(d.level), x(d.rested)); d.pendingRested = Math.min(restedMax(d.level), x(d.pendingRested)); d.restedToday = x(d.restedToday);
    for (const a of Object.keys(d.attrXp) as AttrId[]) d.attrXp[a] = x(d.attrXp[a]);
    for (const f of Object.keys(d.rep) as FactionId[]) d.rep[f] = x(d.rep[f]);
    for (const day of Object.keys(d.xpByDay)) d.xpByDay[day] = x(d.xpByDay[day]);
    d.weekXp = x(d.weekXp); d.lastWeekXp = x(d.lastWeekXp);
    for (const e of d.events) e.raw = x(e.raw);
    if (d.boss) {
      // o dano já dado dobra; a vida máxima fica
      const dealt = x(d.boss.max - d.boss.hp);
      d.boss.hp = Math.max(0, d.boss.max - dealt);
      for (const l of d.boss.log) l.dmg = x(l.dmg);
      if (d.boss.hp === 0 && !d.boss.killed) { d.boss.killed = true; d.counters.bossKills++; d.gold += 500; }
    }
    let level = 1, xp = d.totalXp;
    while (level < MAX_LEVEL && xp >= need(level)) { xp -= need(level); level++; }
    d.level = level; d.xp = level >= MAX_LEVEL ? 0 : xp;
    d.xpScale = XP_MULT;
  }
  // 0.14.1: sem cronômetro na tela; fecha o que ficou ligado (aparece no registro de horas e pode ser apagado)
  for (const p of d.projects) {
    if (!p.time.some(e => e.start && e.end === null)) continue;
    const now = Date.now();
    for (const e of p.time) if (e.start && e.end === null) e.end = now;
    p.time = p.time.filter(e => !e.start || (e.end ?? 0) - e.start >= 60_000);
    p.updatedAt = now;
  }
  // 0.13.0: treino fixo usa faixa de reps (antes: reps e peso fixos)
  for (const r of d.routines) {
    r.items = r.items.map(it => {
      const old = it as unknown as { reps?: number; repsMin?: number; repsMax?: number };
      const item = { ...it, repsMin: old.repsMin ?? old.reps ?? 8, repsMax: old.repsMax ?? old.reps ?? 12 };
      delete (item as { reps?: number }).reps;
      return item;
    });
  }
  // 0.19.6: os exercícios que já estavam nos treinos ganham o padrão de séries, mantendo a faixa de reps das válidas
  if (!d.setDefaults) {
    const { repsMin: _min, repsMax: _max, ...rest } = SET_DEFAULTS;
    for (const r of d.routines) {
      r.items = r.items.map(it => ({ ...it, ...rest }));
      r.updatedAt = Date.now();
    }
    d.setDefaults = 1;
  }
  d.deleted = d.deleted ?? [];
  d.settingsAt = d.settingsAt ?? 0;
  // 0.6.0: lembretes de prazo
  if (d.settings && d.settings.reminders === undefined) d.settings.reminders = true;
  d.rev = d.rev ?? 0;
  return d;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const dataOf = (st: Store | GameData): GameData => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st)) if (typeof v !== 'function') out[k] = v;
  return clone(out) as unknown as GameData;
};

let undoSnap: GameData | null = null;
let undoTimer: ReturnType<typeof setTimeout> | undefined;
function remember(st: Store) {
  undoSnap = dataOf(st);
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { undoSnap = null; }, 6000);
}
/** Quanto tempo o botão Desfazer fica disponível; a sincronização espera isso antes de enviar. */
export const UNDO_MS = 6000;

const prefsStorage: StateStorage = {
  getItem: async k => (await Preferences.get({ key: k })).value,
  setItem: async (k, v) => { await Preferences.set({ key: k, value: v }); },
  removeItem: async k => { await Preferences.remove({ key: k }); },
};

export const useGame = create<Store>()(
  persist(
    (set, get) => {
      /** Roda uma mutação sobre uma cópia do estado e salva. */
      /** Guarda o estado para o botão Desfazer e mostra o botão com o que vai ser desfeito. */
      const undoable = (label: string) => { remember(get()); fx({ type: 'undoable', label }); };
      const mutate = (fn: (s: GameData) => void) => {
        const s = dataOf(get());
        fn(s);
        checkAchievements(s);
        s.rev = Date.now();
        set(s);
      };

      return {
        ...freshData(),

        rollover() {
          if (get().lastProcessed >= dayKey()) return;
          mutate(s => {
            const report = rolloverData(s, dayKey());
            if (report.length) s.report = [...(s.report ?? []), ...report];
          });
        },

        createHero(h) {
          mutate(s => { s.hero = { ...s.hero, ...h, created: true, updatedAt: Date.now() }; });
        },
        updateHero(h) {
          mutate(s => { s.hero = { ...s.hero, ...h, updatedAt: Date.now() }; });
        },

        saveQuest(q) {
          mutate(s => {
            if (q.id) {
              const i = s.quests.findIndex(x => x.id === q.id);
              if (i >= 0) {
                const old = s.quests[i];
                s.quests[i] = { ...old, ...q, id: q.id, updatedAt: Date.now() };
                if (dueSlot(old) !== dueSlot(s.quests[i])) delete s.quests[i].dueRank; // mudou o prazo: vai para o fim do novo dia
              }
            } else {
              s.quests.push({ ...q, id: uid(), createdAt: dayKey(), updatedAt: Date.now() });
            }
          });
        },
        setQuestOrder(ids) {
          mutate(s => {
            ids.forEach((id, k) => {
              const q = s.quests.find(x => x.id === id);
              if (q && q.rank !== k) { q.rank = k; q.updatedAt = Date.now(); }
            });
          });
        },
        setDueOrder(ids) {
          mutate(s => {
            ids.forEach((id, k) => {
              const q = s.quests.find(x => x.id === id);
              if (q && q.dueRank !== k) { q.dueRank = k; q.updatedAt = Date.now(); }
            });
          });
        },
        deleteQuest(id) {
          mutate(s => {
            s.quests = s.quests.filter(q => q.id !== id);
            s.debuffs = s.debuffs.filter(d => d.questId !== id);
            s.deleted.push(id);
          });
        },
        saveHabit(h) {
          mutate(s => {
            if (h.id) {
              const x = s.habits.find(y => y.id === h.id);
              if (x) { x.name = h.name; x.cat = h.cat; x.extras = h.extras?.length ? h.extras : undefined; x.updatedAt = Date.now(); }
            } else {
              s.habits.push({ id: uid(), name: h.name, cat: h.cat, ...(h.extras?.length ? { extras: h.extras } : {}), streak: 0, best: 0, scrolls: 0, lastDone: null, createdAt: dayKey(), updatedAt: Date.now() });
            }
          });
        },
        saveGym(name) {
          const id = uid();
          mutate(s => { s.gyms.push({ id, name: name.trim(), updatedAt: Date.now() }); });
          return id;
        },
        ensureExercise(name, kind, muscle) {
          const clean = name.trim();
          const found = get().exercises.find(e => e.name.toLowerCase() === clean.toLowerCase());
          if (found) return found.id;
          const id = uid();
          mutate(s => { s.exercises.push({ id, name: clean, kind, muscle: muscle?.trim() || undefined, updatedAt: Date.now() }); });
          return id;
        },
        saveExercise(e) {
          mutate(s => {
            const i = s.exercises.findIndex(x => x.id === e.id);
            const item = { ...e, name: e.name.trim(), muscle: e.muscle?.trim() || undefined, updatedAt: Date.now() };
            if (i >= 0) s.exercises[i] = item; else s.exercises.push(item);
          });
        },
        deleteExercise(id) {
          // some dos treinos fixos; os treinos já feitos guardam o histórico
          mutate(s => {
            s.exercises = s.exercises.filter(e => e.id !== id);
            for (const r of s.routines) if (r.items.some(i => i.exId === id)) { r.items = r.items.filter(i => i.exId !== id); r.updatedAt = Date.now(); }
            s.deleted.push(id);
          });
        },
        saveRoutine(r) {
          mutate(s => {
            const item = { ...r, id: r.id ?? uid(), updatedAt: Date.now() };
            const i = s.routines.findIndex(x => x.id === item.id);
            if (i >= 0) s.routines[i] = item; else s.routines.push(item);
          });
        },
        deleteRoutine(id) {
          mutate(s => { s.routines = s.routines.filter(r => r.id !== id); s.deleted.push(id); });
        },
        startSession(routineId) {
          const st = get();
          const open = st.sessions.find(x => !x.done);
          if (open) return open.id;
          const r = routineId ? st.routines.find(x => x.id === routineId) : null;
          const id = uid();
          const items = (r?.items ?? []).map(it => {
            // sempre o número de séries válidas do treino; o peso vem da última vez e as reps você anota na hora
            const last = lastSetsFor(st, it.exId) ?? [];
            const build = (n: number, kind?: SetKind) => {
              const refs = last.filter(x => x.kind === kind);
              return Array.from({ length: n }, (_, k): WorkSet => {
                const ref = refs[k] ?? refs[refs.length - 1];
                return kind ? { kg: ref?.kg ?? 0, reps: 0, kind } : { kg: ref?.kg ?? 0, reps: 0 };
              });
            };
            const sets = [...build(it.warmSets ?? 0, 'warm'), ...build(it.prepSets ?? 0, 'prep'), ...build(Math.max(1, it.sets))];
            return { exId: it.exId, sets };
          });
          mutate(s => {
            s.sessions.push({
              id, day: dayKey(), routineId: r?.id ?? null, name: r?.name ?? 'Treino avulso', gymId: r?.gymId ?? null,
              startedAt: Date.now(), minutes: 0, items, notes: '', done: false, updatedAt: Date.now(),
            });
          });
          return id;
        },
        saveSession(x) {
          mutate(s => {
            const i = s.sessions.findIndex(y => y.id === x.id);
            const item = { ...x, updatedAt: Date.now() };
            if (i >= 0) s.sessions[i] = item; else s.sessions.push(item);
          });
        },
        finishSession(id) {
          const st = get();
          const sess = st.sessions.find(x => x.id === id);
          if (!sess || sess.done) return;
          const today = dayKey();
          const minutes = sess.minutes || (sess.startedAt ? Math.max(1, Math.round((Date.now() - sess.startedAt) / 60000)) : 0);
          const routine = sess.routineId ? st.routines.find(r => r.id === sess.routineId) : null;
          const linked = routine?.questId ? st.quests.find(q => q.id === routine.questId) : null;
          const linkedOpen = !!linked && doneCount(st, linked.id, today) < perDayOf(linked)
            && (linked.type !== 'weekly' || weeklyProgress(st, linked, today) < linked.quota)
            && objProgress(st, linked, today).ready;
          mutate(s => {
            const x = s.sessions.find(y => y.id === id)!;
            x.done = true;
            x.minutes = minutes;
            x.updatedAt = Date.now();
          });
          if (linkedOpen) {
            // a missão vinculada dá o XP do treino
            get().completeQuest(linked!.id);
            return;
          }
          const r = roll('saude', 'normal', 1, luck(st));
          const onPlan = !!routine && routine.days.includes(weekday(sess.day));
          const ev: CompletionEvent = {
            id: uid(), at: Date.now(), day: today, kind: 'workout', ref: id, name: sess.name, cat: 'saude',
            raw: Math.round(r.xp * (onPlan ? WORKOUT_PLAN_BONUS : 1)), crit: r.crit, paid: false, elite: false,
          };
          remember(get());
          mutate(s => { applyEvent(s, ev); });
        },
        deleteSession(id) {
          mutate(s => { s.sessions = s.sessions.filter(x => x.id !== id); s.deleted.push(id); });
        },

        saveClient(c) {
          const id = c.id ?? uid();
          mutate(s => {
            const item = { ...c, id, name: c.name.trim(), updatedAt: Date.now() };
            const i = s.clients.findIndex(x => x.id === id);
            if (i >= 0) s.clients[i] = item; else s.clients.push(item);
          });
          return id;
        },
        deleteClient(id) {
          // os projetos ficam, sem cliente
          undoable('Cliente apagado');
          mutate(s => {
            s.clients = s.clients.filter(c => c.id !== id);
            for (const p of s.projects) if (p.clientId === id) { p.clientId = null; p.updatedAt = Date.now(); }
            s.deleted.push(id);
          });
        },
        saveLead(l) {
          const id = l.id ?? uid();
          mutate(s => {
            const old = s.leads.find(x => x.id === id);
            const item: Lead = old
              ? { ...old, name: l.name.trim(), avatar: l.avatar, contact: l.contact.trim(), note: l.note, updatedAt: Date.now() }
              : { id, name: l.name.trim(), avatar: l.avatar, contact: l.contact.trim(), note: l.note, stage: 'none', history: [], createdAt: Date.now(), updatedAt: Date.now() };
            if (old) Object.assign(old, item); else s.leads.push(item);
          });
          return id;
        },
        setLeadStage(id, stage, msgId) {
          mutate(s => {
            const l = s.leads.find(x => x.id === id);
            if (!l) return;
            l.stage = stage;
            l.history.push({ stage, at: Date.now(), msgId: LEAD_STAGES.find(x => x.id === stage)?.msg ? msgId : undefined });
            l.updatedAt = Date.now();
          });
        },
        deleteLead(id) {
          undoable('Lead apagado');
          mutate(s => { s.leads = s.leads.filter(x => x.id !== id); s.deleted.push(id); });
        },
        saveLeadMsg(m) {
          const id = m.id ?? uid();
          mutate(s => {
            const item = { ...m, id, title: m.title.trim(), updatedAt: Date.now() };
            const i = s.leadMsgs.findIndex(x => x.id === id);
            if (i >= 0) s.leadMsgs[i] = item; else s.leadMsgs.push(item);
          });
          return id;
        },
        deleteLeadMsg(id) {
          undoable('Mensagem apagada');
          mutate(s => { s.leadMsgs = s.leadMsgs.filter(x => x.id !== id); s.deleted.push(id); });
        },
        saveProject(p) {
          const id = p.id ?? uid();
          mutate(s => {
            const i = s.projects.findIndex(x => x.id === id);
            const base: Project = i >= 0 ? s.projects[i] : {
              id, clientId: null, name: '', status: 'briefing', usdCents: 0, createdAt: dayKey(), time: [], notes: '', rewarded: ['briefing'], updatedAt: 0,
            };
            const item = { ...base, ...p, id, name: p.name.trim(), updatedAt: Date.now() };
            if (i >= 0) s.projects[i] = item; else s.projects.push(item);
          });
          return id;
        },
        deleteProject(id) {
          undoable('Projeto apagado');
          mutate(s => { s.projects = s.projects.filter(p => p.id !== id); s.deleted.push(id); });
        },
        setProjectStatus(id, status) {
          const st = get();
          const p0 = st.projects.find(p => p.id === id);
          if (!p0 || p0.status === status) return;
          const today = dayKey();
          undoable(`Etapa: ${PROJ_STAGES.find(x => x.id === status)?.label}`);
          const first = !p0.rewarded.includes(status);
          const r = first ? roll('trabalho', status === 'delivered' ? 'heroico' : 'normal', status === 'delivered' ? PROJECT_DELIVERY_FACTOR : PROJECT_STAGE_FACTOR, luck(st)) : null;
          const ev: CompletionEvent | null = r ? {
            id: uid(), at: Date.now(), day: today, kind: 'project', ref: id,
            name: `${p0.name}: ${PROJ_STAGES.find(x => x.id === status)?.label}`, cat: 'trabalho',
            raw: Math.round(r.xp * (status === 'delivered' ? projectDueMult(p0) : 1)), crit: r.crit, paid: true, elite: status === 'delivered',
          } : null;
          if (ev) remember(st);
          const month = today.slice(0, 7);
          const goalBefore = usdGoalStatus(st, month);
          mutate(s => {
            const p = s.projects.find(x => x.id === id)!;
            // entregar ou pagar para o cronômetro
            if (status === 'delivered' || status === 'paid') for (const e of p.time) if (e.start && e.end === null) e.end = Date.now();
            p.status = status;
            if (status === 'delivered' && !p.deliveredAt) p.deliveredAt = today;
            if (status === 'paid') { p.paidAt = p.paidAt ?? today; if (!p.deliveredAt) p.deliveredAt = today; }
            if (status !== 'paid') p.paidAt = undefined;
            if (first) p.rewarded = [...p.rewarded, status];
            p.updatedAt = Date.now();
            if (ev) applyEvent(s, ev);
            const goalAfter = usdGoalStatus(s, month);
            if (goalAfter.goal && !goalBefore.reached && goalAfter.reached) fx({ type: 'goal', cents: goalAfter.goal, currency: 'USD' });
          });
        },
        revokeXp(eventId) {
          const ev = get().events.find(e => e.id === eventId);
          if (!ev) return;
          undoable('XP removido');
          mutate(s => { const e = s.events.find(x => x.id === eventId); if (e) revokeEvent(s, e); });
        },
        revokeProjectStage(id, stage) {
          const st = get();
          const p0 = st.projects.find(p => p.id === id);
          if (!p0 || !p0.rewarded.includes(stage) || stage === 'briefing') return;
          const label = PROJ_STAGES.find(x => x.id === stage)?.label;
          undoable(`XP de ${label} devolvido`);
          mutate(s => {
            const p = s.projects.find(x => x.id === id)!;
            const ev = [...s.events].reverse().find(e => e.kind === 'project' && e.ref === id && e.name.endsWith(`: ${label}`));
            if (ev) revokeEvent(s, ev);
            p.rewarded = p.rewarded.filter(x => x !== stage);
            if (STAGE_ORDER[p.status] < STAGE_ORDER[stage]) {
              if (stage === 'delivered') p.deliveredAt = undefined;
              if (stage === 'paid') p.paidAt = undefined;
            }
            p.updatedAt = Date.now();
          });
        },
        startTimer(projectId) {
          mutate(s => {
            const now = Date.now();
            // só um cronômetro por vez
            for (const p of s.projects) {
              for (const e of p.time) if (e.start && e.end === null) { e.end = now; p.updatedAt = now; }
              p.time = p.time.filter(e => !e.start || e.end === null || (e.end ?? 0) - e.start >= 60_000);
            }
            const p = s.projects.find(x => x.id === projectId);
            if (!p) return;
            p.time.push({ id: uid(), day: dayKey(), start: now, end: null });
            if (p.status === 'briefing') p.status = 'editing';
            p.updatedAt = now;
          });
        },
        stopTimer(projectId) {
          mutate(s => {
            const p = s.projects.find(x => x.id === projectId);
            if (!p) return;
            for (const e of p.time) if (e.start && e.end === null) e.end = Date.now();
            p.time = p.time.filter(e => !e.start || e.end === null || (e.end ?? 0) - e.start >= 60_000); // descarta trechos de menos de 1 min
            p.updatedAt = Date.now();
          });
        },
        addTime(projectId, minutes, day) {
          if (minutes <= 0) return;
          undoable('Horas lançadas');
          mutate(s => {
            const p = s.projects.find(x => x.id === projectId);
            if (!p) return;
            p.time.push({ id: uid(), day, minutes });
            p.updatedAt = Date.now();
          });
        },
        removeTime(projectId, entryId) {
          undoable('Horas apagadas');
          mutate(s => {
            const p = s.projects.find(x => x.id === projectId);
            if (!p) return;
            p.time = p.time.filter(e => e.id !== entryId);
            p.updatedAt = Date.now();
          });
        },
        setFixedPaid(clientId, month, paid) {
          undoable(paid ? 'Mês marcado como pago' : 'Mês desmarcado');
          mutate(s => {
            const c = s.clients.find(x => x.id === clientId);
            if (!c) return;
            const before = usdGoalStatus(s, month);
            const list = (c.fixedPaid ?? []).filter(m => m !== month);
            c.fixedPaid = paid ? [...list, month].sort() : list;
            c.updatedAt = Date.now();
            const after = usdGoalStatus(s, month);
            if (after.goal && !before.reached && after.reached) fx({ type: 'goal', cents: after.goal, currency: 'USD' });
          });
        },
        setUsdGoal(month, cents) {
          undoable(cents > 0 ? 'Meta alterada' : 'Meta removida');
          mutate(s => {
            s.usdGoals = s.usdGoals.filter(g => g.month !== month);
            s.usdGoals.push({ month, cents, updatedAt: Date.now() });
          });
        },

        setFinGoal(month, cents, cats) {
          mutate(s => {
            s.finGoals = s.finGoals.filter(g => g.month !== month);
            s.finGoals.push({ month, cents, cats, updatedAt: Date.now() });
            s.finGoals.sort((a, b) => a.month.localeCompare(b.month));
          });
        },

        saveExpense(e) {
          const before = goalStatus(get(), e.day.slice(0, 7));
          mutate(s => {
            const item = { ...e, id: e.id ?? uid(), updatedAt: Date.now() };
            const i = s.expenses.findIndex(x => x.id === item.id);
            if (i >= 0) s.expenses[i] = item;
            else s.expenses.push(item);
            const after = goalStatus(s, item.day.slice(0, 7));
            if (after && before && !before.reached && after.reached) fx({ type: 'goal', cents: after.goal.cents });
          });
        },
        deleteExpense(id) {
          mutate(s => { s.expenses = s.expenses.filter(e => e.id !== id); s.deleted.push(id); });
        },

        deleteHabit(id) {
          mutate(s => { s.habits = s.habits.filter(h => h.id !== id); s.deleted.push(id); });
        },

        failHabit(id) {
          const today = dayKey();
          const h0 = get().habits.find(x => x.id === id);
          if (!h0 || h0.lastDone === today) return;
          const off = h0.failed === today;
          undoable(off ? 'Falha desmarcada' : 'Hábito não cumprido');
          mutate(s => {
            const h = s.habits.find(x => x.id === id);
            if (!h) return;
            if (off) delete h.failed; else h.failed = today;
            h.updatedAt = Date.now();
          });
        },

        failQuest(id) {
          const q0 = get().quests.find(x => x.id === id);
          if (!q0 || q0.type === 'once') return;
          const off = isFailed(q0);
          undoable(off ? 'Falha desmarcada' : 'Missão falhou');
          mutate(s => {
            const q = s.quests.find(x => x.id === id);
            if (!q) return;
            if (off) delete q.failed; else q.failed = failKey(q);
            q.updatedAt = Date.now();
          });
        },

        completeQuest(id, amount) {
          const today = dayKey();
          const st = get();
          const q = st.quests.find(x => x.id === id);
          if (!q) return;
          if (isFailed(q, today)) return;
          const count = weeklyProgress(st, q, today);
          if (q.type === 'weekly' && count >= q.quota) return;
          const byCount = q.type === 'weekly' && !!q.count;
          const add = byCount ? Math.max(1, Math.min(q.quota - count, Math.round(amount ?? 1))) : 1;
          if (!byCount && doneCount(st, id, today) >= perDayOf(q)) return;
          if (notYourDay(q, today)) return;
          if (!objProgress(st, q, today).ready) return;

          // "vezes por dia": só a última vez do dia paga, e paga por todas
          const per = q.type === 'daily' ? perDayOf(q) : 1;
          if (per > 1 && doneCount(st, id, today) < per - 1) {
            const ev: CompletionEvent = {
              id: uid(), at: Date.now(), day: today, kind: 'quest', ref: id, name: q.name, cat: q.cat, qtype: q.type,
              raw: 0, crit: false, paid: false, elite: false, partial: true,
            };
            remember(st);
            mutate(s => { applyEvent(s, ev); });
            return;
          }
          const r = q.cat === 'lazer' ? { xp: 0, crit: false } : roll(q.cat, q.diff, q.type === 'weekly' ? WEEKLY_FACTOR : 1, luck(st));
          const elite = q.type === 'weekly' && count + add >= q.quota && q.cat !== 'lazer';
          // por quantidade: a meta inteira vale COUNT_WEEK_DAYS vezes; cada pedaço leva a parte dele
          const share = byCount ? (add / q.quota) * COUNT_WEEK_DAYS : 1;
          // os essenciais já pagaram a parte deles; os extras feitos viram bônus
          const p = objProgress(st, q, today);
          const objMult = 1 - objectiveShare(p.total) + extraBonus(p.extraDone);
          const raw = Math.max(r.xp ? 1 : 0, Math.round(r.xp * share * per * objMult * questMult(q))) + (elite ? Math.round(CAT[q.cat].base * DIFF[q.diff].mult * WEEKLY_FACTOR * weeklyDays(q) * XP_MULT) : 0);
          const ev: CompletionEvent = {
            id: uid(), at: Date.now(), day: today, kind: 'quest', ref: id, name: q.name, cat: q.cat, qtype: q.type,
            raw, crit: r.crit, paid: q.cat === 'trabalho' && !!q.paid, elite, ...(byCount ? { amount: add } : {}), ...(per > 1 ? { reps: per } : {}),
          };
          remember(st);
          mutate(s => { applyEvent(s, ev); });
        },

        completeObjective(questId, objId) {
          const today = dayKey();
          const st = get();
          const q = st.quests.find(x => x.id === questId);
          if (!q || !q.objectives?.some(o => o.id === objId)) return;
          if (doneCount(st, questId, today) >= perDayOf(q)) return;
          if (notYourDay(q, today)) return;
          const p = objProgress(st, q, today);
          if (p.done.has(objId)) return;
          const isExtra = !!q.objectives.find(o => o.id === objId)?.extra;
          const ev: CompletionEvent = {
            id: uid(), at: Date.now(), day: today, kind: 'objective', ref: questId, name: q.name, cat: q.cat, qtype: q.type,
            obj: objId, pkey: objKey(st, q, today), raw: isExtra ? 0 : Math.round(objectiveXp(q) * questMult(q)), crit: false, paid: q.cat === 'trabalho' && !!q.paid, elite: false,
          };
          remember(st);
          mutate(s => { applyEvent(s, ev); });
        },

        completeHabit(id) {
          const today = dayKey();
          const st = get();
          const h = st.habits.find(x => x.id === id);
          if (!h || h.lastDone === today || h.failed === today) return;
          const r = h.cat === 'lazer' ? { xp: 0, crit: false } : roll(h.cat, 'normal', HABIT_FACTOR, luck(st));
          const ev: CompletionEvent = {
            id: uid(), at: Date.now(), day: today, kind: 'habit', ref: id, name: h.name, cat: h.cat,
            raw: r.xp * (1 + streakBonus(h.streak)), crit: r.crit, paid: false, elite: false,
          };
          remember(st);
          mutate(s => { applyEvent(s, ev); });
        },

        completeHabitExtra(habitId, extraId) {
          const today = dayKey();
          const st = get();
          const h = st.habits.find(x => x.id === habitId);
          const x = h?.extras?.find(e => e.id === extraId);
          // extra é por cima do hábito: só depois de marcá-lo no dia
          if (!h || !x || h.lastDone !== today || habitExtrasDone(st, habitId, today).has(extraId)) return;
          const r = h.cat === 'lazer' ? { xp: 0, crit: false } : roll(h.cat, 'normal', HABIT_EXTRA_FACTOR, luck(st));
          const ev: CompletionEvent = {
            id: uid(), at: Date.now(), day: today, kind: 'habitExtra', ref: habitId, obj: extraId, name: `${h.name}: ${x.text}`, cat: h.cat,
            raw: Math.round(r.xp * (1 + streakBonus(h.streak))), crit: r.crit, paid: false, elite: false,
          };
          remember(st);
          mutate(s => { applyEvent(s, ev); });
        },

        undo() {
          if (!undoSnap) return;
          const snap = undoSnap;
          undoSnap = null;
          set({ ...snap, rev: Date.now() });
        },
        canUndo: () => undoSnap !== null,
        retune() {
          const st = get();
          let level = 1, xp = st.totalXp;
          while (level < MAX_LEVEL && xp >= need(level)) { xp -= need(level); level++; }
          if (level >= MAX_LEVEL) xp = 0;
          // só ajusta este aparelho: o outro faz a mesma conta com o mesmo config
          if (level !== st.level || xp !== st.xp) set({ level, xp });
        },

        useHearth() {
          const today = dayKey();
          if (hearthReadyIn(get(), today) > 0) return;
          mutate(s => {
            s.hearth.lastUsed = today;
            s.hearth.protectedDays.push(today);
            s.debuffs = s.debuffs.filter(d => !(d.kind === 'exaustao' && d.from <= today));
            s.counters.hearthUses++;
          });
        },

        dismissReport() { set({ report: null }); },
        setSettings(p) { mutate(s => { s.settings = { ...s.settings, ...p }; s.settingsAt = Date.now(); }); },
        setDayMode(on) {
          const now = new Date();
          mutate(s => {
            const next = { ...s.settings };
            if (on) next.dayStartMin = now.getHours() * 60 + now.getMinutes(); else delete next.dayStartMin;
            s.settings = next; s.settingsAt = Date.now();
          });
          setDayShift(get().settings.dayStartMin);
          if (!on) get().rollover(); // desligou: se já passou da meia-noite, o dia vira agora
        },

        exportJson() { return JSON.stringify(dataOf(get())); },
        importJson(json) {
          try {
            const d = JSON.parse(json) as GameData;
            if (d.version !== 1 || !d.hero || !Array.isArray(d.quests)) return false;
            set({ ...upgrade({ ...freshData(), ...d }), rev: Date.now() });
            return true;
          } catch { return false; }
        },
        resetAll() { set({ ...freshData(), rev: Date.now() }); },

        adoptRemote(d) {
          set({ ...upgrade({ ...freshData(), ...d }), report: get().report });
          get().rollover();
        },
        mergeRemote(d) {
          set(mergeData(upgrade({ ...freshData(), ...d }), dataOf(get())));
        },
      };
    },
    {
      name: 'dquests-save',
      storage: createJSONStorage(() => prefsStorage),
      version: 7,
      migrate: persisted => upgrade(persisted as GameData),
      partialize: st => dataOf(st as Store),
    },
  ),
);

// Modo 24h: o horário em que o dia vira acompanha o save (inclusive quando chega da nuvem)
setDayShift(useGame.getState().settings.dayStartMin);
useGame.subscribe(st => setDayShift(st.settings.dayStartMin));
