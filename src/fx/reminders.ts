// Lembretes de prazo: no Android viram notificações agendadas; no PC tocam enquanto o app está aberto.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { parseDay } from '../game/rules';
import { useGame, type GameData, type Quest } from '../game/store';

interface Reminder { id: number; at: Date; title: string; body: string }

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

function at(day: string, hhmm: string, minus = 0) {
  const d = parseDay(day);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m || 0, 0, 0);
  return new Date(d.getTime() - minus * 60_000);
}

/** Véspera às 18h e, no dia, às 9h (ou 1h antes da hora marcada). */
function remindersFor(q: Quest): Reminder[] {
  if (q.type !== 'once' || !q.due || q.doneOn) return [];
  const eve = parseDay(q.due);
  eve.setDate(eve.getDate() - 1);
  const eveKey = `${eve.getFullYear()}-${String(eve.getMonth() + 1).padStart(2, '0')}-${String(eve.getDate()).padStart(2, '0')}`;
  const list: Reminder[] = [q.onlyDay
    ? { id: hash(`${q.id}:eve`), at: at(eveKey, '18:00'), title: 'Missão de amanhã', body: `"${q.name}" é só para amanhã. Se passar o dia, ela some.` }
    : { id: hash(`${q.id}:eve`), at: at(eveKey, '18:00'), title: 'Prazo amanhã', body: `"${q.name}" vence amanhã${q.dueTime ? ` às ${q.dueTime}` : ''}. Entregando hoje ainda ganha bônus.` },
  ];
  if (q.dueTime) list.push({ id: hash(`${q.id}:hour`), at: at(q.due, q.dueTime, 60), title: 'Prazo em 1 hora', body: `"${q.name}" vence às ${q.dueTime}.` });
  else list.push({ id: hash(`${q.id}:day`), at: at(q.due, '09:00'), title: 'Prazo hoje', body: q.onlyDay ? `"${q.name}" é só para hoje. Amanhã ela some.` : `"${q.name}" vence hoje. Depois disso ela começa a perder XP.` });
  return list.filter(r => r.at.getTime() > Date.now());
}

function allReminders(s: GameData) {
  return s.settings.reminders ? s.quests.flatMap(remindersFor) : [];
}

// ---------- Android ----------
let permission: boolean | null = null;
async function canNotify() {
  if (permission !== null) return permission;
  let p = await LocalNotifications.checkPermissions();
  if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions();
  permission = p.display === 'granted';
  return permission;
}

async function scheduleNative(list: Reminder[]) {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  if (!list.length || !(await canNotify())) return;
  await LocalNotifications.schedule({
    notifications: list.map(r => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true } })),
  });
}

// ---------- PC / navegador ----------
let webList: Reminder[] = [];
const FIRED = 'reminders-fired';
function fired(): number[] {
  try { return JSON.parse(localStorage.getItem(FIRED) ?? '[]'); } catch { return []; }
}
function markFired(id: number) {
  try { localStorage.setItem(FIRED, JSON.stringify([...fired().slice(-200), id])); } catch { /* sem armazenamento */ }
}
function tickWeb() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const done = new Set(fired());
  for (const r of webList) {
    if (r.at.getTime() <= Date.now() && Date.now() - r.at.getTime() < 6 * 3600_000 && !done.has(r.id)) {
      new Notification(r.title, { body: r.body });
      markFired(r.id);
    }
  }
}

async function apply() {
  const list = allReminders(useGame.getState());
  if (Capacitor.isNativePlatform()) {
    try { await scheduleNative(list); } catch { /* sem permissão ou sem suporte */ }
    return;
  }
  webList = list;
  if (list.length && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* recusado */ }
  }
}

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
export function startReminders() {
  if (started) return;
  started = true;
  void apply();
  let last = useGame.getState().rev;
  useGame.subscribe(st => {
    if (st.rev === last) return;
    last = st.rev;
    clearTimeout(timer);
    timer = setTimeout(() => void apply(), 2000);
  });
  if (!Capacitor.isNativePlatform()) setInterval(tickWeb, 60_000);
}
