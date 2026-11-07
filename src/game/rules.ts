import { CAT, DIFF, type CatId, type Diff } from './data';

export const MAX_LEVEL = 60;

// XP para passar do nível N. Começa rápido e fica pesado no fim, como no jogo.
// 0.16.0: total do 1 ao 60 ≈ 164 mil XP, 1 ano num ritmo forte (~450 XP/dia).
// Nível 10 sai em ~11 dias; do 59 pro 60 são ~7.600 XP.
export function need(level: number) {
  return Math.round(CURVE.a * Math.pow(level, CURVE.p) + CURVE.b);
}
/** Descanso que um lazer dá, o máximo por dia e o teto guardado: partes da barra do nível. */
export const restedPerLeisure = (level: number) => Math.round(RESTED_PER_LEISURE * need(level));
export const restedDailyCap = (level: number) => Math.round(RESTED_DAILY_CAP * need(level));
export const restedMax = (level: number) => Math.round(RESTED_MAX * need(level));
/** 0.16.0: todo XP ganho vale o dobro (hábitos, com HABIT_FACTOR maior, o triplo). É a escala do save: não mexer. */
export const XP_MULT = 2;

// ---------- balanceamento: valores padrão, que o config.json da nuvem pode trocar ----------
export const TUNING_DEFAULTS = {
  xpExtra: 1, // multiplica todo XP por cima de tudo
  habitos: 0.6,
  semanais: 1.5,
  critico: 0.05,
  curva: { a: 0.9, p: 2.2, b: 500 },
  // porLazer, limiteDia e maximo são frações da barra do nível atual (como no WoW: 5% por descanso, teto de 1,5 nível); chefe é XP fixo
  descanso: { porLazer: 0.05, limiteDia: 0.2, maximo: 1.5, chefe: 200 },
  chefe: { vidaMinima: 1500, daSemanaPassada: 0.8 },
  mesa: { etapa: 0.5, entrega: 1.5 },
  treino: { bonusRotina: 1.25 },
};
export type Tuning = typeof TUNING_DEFAULTS;

let CURVE = { ...TUNING_DEFAULTS.curva };
export let XP_EXTRA = TUNING_DEFAULTS.xpExtra;
export let RESTED_PER_LEISURE = TUNING_DEFAULTS.descanso.porLazer;
export let RESTED_DAILY_CAP = TUNING_DEFAULTS.descanso.limiteDia;
export let RESTED_MAX = TUNING_DEFAULTS.descanso.maximo;
export let BOSS_RESTED = TUNING_DEFAULTS.descanso.chefe;
export let BOSS_MIN_HP = TUNING_DEFAULTS.chefe.vidaMinima;
export let BOSS_FROM_LAST_WEEK = TUNING_DEFAULTS.chefe.daSemanaPassada;
export let PROJECT_STAGE_FACTOR = TUNING_DEFAULTS.mesa.etapa;
export let PROJECT_DELIVERY_FACTOR = TUNING_DEFAULTS.mesa.entrega;
export let WORKOUT_PLAN_BONUS = TUNING_DEFAULTS.treino.bonusRotina;

/** Aplica um config (valores fora da faixa ou faltando ficam no padrão). Devolve o que ficou valendo. */
export function applyTuning(raw: unknown): Tuning {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sub = (k: string) => (o[k] && typeof o[k] === 'object' ? o[k] : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def);
  const D = TUNING_DEFAULTS;
  const t: Tuning = {
    xpExtra: num(o.xpExtra, D.xpExtra, 0.1, 10),
    habitos: num(o.habitos, D.habitos, 0.05, 5),
    semanais: num(o.semanais, D.semanais, 0.1, 10),
    critico: num(o.critico, D.critico, 0, 0.5),
    curva: { a: num(sub('curva').a, D.curva.a, 0.01, 100), p: num(sub('curva').p, D.curva.p, 1, 3), b: num(sub('curva').b, D.curva.b, 10, 10000) },
    descanso: {
      // até a 0.22 eram valores fixos (60, 240, 600): ficam fora da faixa e caem no padrão
      porLazer: num(sub('descanso').porLazer, D.descanso.porLazer, 0, 1), limiteDia: num(sub('descanso').limiteDia, D.descanso.limiteDia, 0, 3),
      maximo: num(sub('descanso').maximo, D.descanso.maximo, 0, 5), chefe: num(sub('descanso').chefe, D.descanso.chefe, 0, 5000),
    },
    chefe: { vidaMinima: num(sub('chefe').vidaMinima, D.chefe.vidaMinima, 100, 100000), daSemanaPassada: num(sub('chefe').daSemanaPassada, D.chefe.daSemanaPassada, 0.1, 3) },
    mesa: { etapa: num(sub('mesa').etapa, D.mesa.etapa, 0, 10), entrega: num(sub('mesa').entrega, D.mesa.entrega, 0, 10) },
    treino: { bonusRotina: num(sub('treino').bonusRotina, D.treino.bonusRotina, 1, 3) },
  };
  CURVE = { ...t.curva };
  XP_EXTRA = t.xpExtra; HABIT_FACTOR = t.habitos; WEEKLY_FACTOR = t.semanais; CRIT_CHANCE = t.critico;
  RESTED_PER_LEISURE = t.descanso.porLazer; RESTED_DAILY_CAP = t.descanso.limiteDia; RESTED_MAX = t.descanso.maximo; BOSS_RESTED = t.descanso.chefe;
  BOSS_MIN_HP = t.chefe.vidaMinima; BOSS_FROM_LAST_WEEK = t.chefe.daSemanaPassada;
  PROJECT_STAGE_FACTOR = t.mesa.etapa; PROJECT_DELIVERY_FACTOR = t.mesa.entrega; WORKOUT_PLAN_BONUS = t.treino.bonusRotina;
  return t;
}
export const DEBUFF_CAP = 0.3;
export const FOCUS_BONUS = 0.1;
export let CRIT_CHANCE = TUNING_DEFAULTS.critico;
/** Sorte: cada ponto de Fortuna soma 0,1% de chance de crítico, até 10% no total. */
export const CRIT_PER_FORTUNE = 0.001;
export const CRIT_MAX = 0.1;
export function critChance(fortunePoints: number) {
  return Math.min(CRIT_MAX, CRIT_CHANCE + fortunePoints * CRIT_PER_FORTUNE);
}
export const STREAK_STEP = 0.02;
export const STREAK_MAX_DAYS = 20;
export let HABIT_FACTOR = TUNING_DEFAULTS.habitos; // com XP_MULT: 3x o hábito antigo
export let WEEKLY_FACTOR = TUNING_DEFAULTS.semanais;
export const HEARTH_COOLDOWN_DAYS = 7;
/** Parte do atributo que vai pra Fortuna numa missão de Trabalho que dá dinheiro. */
export const PAID_FORTUNE_SHARE = 0.5;
/** Cada objetivo de missão vale 10% do XP dela, até 50% somados; a entrega dá o resto. */
/** Prazos: cada dia de atraso tira 10% (até 50%); cada dia de folga dá +5% (até 25%). */
export const LATE_STEP = 0.1;
export const LATE_MAX = 0.5;
export const EARLY_STEP = 0.05;
export const EARLY_MAX = 0.25;
export const LATE_DEBUFF = 0.1;
export const OBJ_STEP = 0.1;
export const OBJ_MAX = 0.5;
export function objectiveShare(count: number) {
  return count > 0 ? Math.min(OBJ_MAX, OBJ_STEP * count) : 0;
}

/** Faixa de XP que uma missão pode sortear. */
export function xpRange(cat: CatId, diff: Diff, factor = 1) {
  const mid = CAT[cat].base * DIFF[diff].mult * factor * XP_MULT * XP_EXTRA;
  return { min: Math.max(1, Math.round(mid * 0.8)), max: Math.max(1, Math.round(mid * 1.25)) };
}

export function roll(cat: CatId, diff: Diff, factor = 1, chance = CRIT_CHANCE, rnd = Math.random) {
  const { min, max } = xpRange(cat, diff, factor);
  let xp = Math.round(min + rnd() * (max - min));
  const crit = rnd() < chance;
  if (crit) xp *= 2;
  return { xp, crit };
}

export function streakBonus(streak: number) {
  return Math.min(streak, STREAK_MAX_DAYS) * STREAK_STEP;
}

// ---------- datas locais (YYYY-MM-DD) ----------
/** Minutos depois da meia-noite em HH:MM. */
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
// Modo 24h: o dia do jogo vira neste horário (ms depois da meia-noite) em vez de meia-noite
let DAY_SHIFT_MS = 0;
export function setDayShift(minutes: number | undefined) { DAY_SHIFT_MS = Math.max(0, Math.min(1439, minutes ?? 0)) * 60_000; }
/** Dia (YYYY-MM-DD). Sem data = o dia do jogo agora, que no modo 24h só vira no horário escolhido. */
export function dayKey(d = new Date(Date.now() - DAY_SHIFT_MS)) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDay(k: string) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(k: string, n: number) {
  const d = parseDay(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function daysBetween(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}
/** 0 = segunda ... 6 = domingo */
export function weekday(k: string) {
  return (parseDay(k).getDay() + 6) % 7;
}
/** Chave da semana = a segunda-feira dela. */
export function weekKey(k: string) {
  return addDays(k, -weekday(k));
}
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function fmt(n: number) {
  return Math.round(n).toLocaleString('pt-BR');
}
