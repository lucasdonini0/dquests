// Eventos de jogo que viram animação e som na interface.
export type FxEvent =
  | { type: 'xp'; anchor: string; amount: number; rested: number; crit: boolean; elite: boolean; name: string; kind?: 'quest' | 'habit' | 'habitExtra' | 'objective' | 'workout' | 'project' }
  | { type: 'rested'; anchor: string; amount: number }
  | { type: 'progress'; anchor: string; text: string }
  | { type: 'levelup'; level: number }
  | { type: 'achievement'; id: string }
  | { type: 'boss'; name: string }
  | { type: 'redeemed'; name: string }
  | { type: 'goal'; cents: number; currency?: 'BRL' | 'USD' }
  | { type: 'undoable'; label: string };

type Listener = (e: FxEvent) => void;
const listeners = new Set<Listener>();
const queue: FxEvent[] = [];

export function emit(e: FxEvent) {
  // a store emite antes de salvar; entregamos no próximo tick para a tela já estar atualizada
  queue.push(e);
  if (queue.length === 1) {
    setTimeout(() => {
      const batch = queue.splice(0);
      for (const ev of batch) for (const l of listeners) l(ev);
    }, 0);
  }
}

export function onFx(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
