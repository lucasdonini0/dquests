// Modo debug escondido: toque 7 vezes na versão, no fim das Opções. Só toca efeitos; não mexe no save.
import { useState } from 'react';
import { ACHIEVEMENTS } from '../game/data';
import { useGame } from '../game/store';
import { emit } from '../fx/bus';
import { play, SOUND_SLOTS } from '../fx/sound';
import { Icon } from './Icon';
import { PanelHeader } from './parts';

const KEY = 'debug-mode';
const TAPS = 7;

function load() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

/** Linha da versão: 7 toques seguidos ligam ou desligam o modo debug. */
export function VersionTapper({ onToggle }: { onToggle: (on: boolean) => void }) {
  const [taps, setTaps] = useState<number[]>([]);
  const tap = () => {
    const now = Date.now();
    const recent = [...taps.filter(t => now - t < 2500), now];
    if (recent.length < TAPS) { setTaps(recent); return; }
    setTaps([]);
    const on = !load();
    try { localStorage.setItem(KEY, on ? '1' : ''); } catch { /* sem armazenamento */ }
    onToggle(on);
  };
  const left = TAPS - taps.length;
  return (
    <button type="button" className="version-tap" onClick={tap}>
      dQuests {__APP_VERSION__}{taps.length >= 3 && left > 0 && <small> · mais {left}</small>}
    </button>
  );
}

export const debugOn = load;
/** Liga ou desliga pelo checkbox das Opções. */
export function setDebugOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : ''); } catch { /* sem armazenamento */ }
  return on;
}

export function DebugPanel() {
  const s = useGame();
  const xp = (crit: boolean) => emit({ type: 'xp', anchor: 'debug', amount: crit ? 240 : 87, rested: crit ? 0 : 20, crit, elite: false, name: 'Teste de efeito', kind: 'quest' });
  const boss = () => {
    try { localStorage.removeItem('boss-seen'); } catch { /* sem armazenamento */ }
    emit({ type: 'boss', name: s.boss.name });
  };
  const ach = ACHIEVEMENTS[Math.floor(Math.random() * ACHIEVEMENTS.length)];

  return (
    <>
      <p className="q-meta pad">Efeitos</p>
      <div className="row-btns debug-btns">
        <button className="btn small" onClick={() => xp(false)}>+XP</button>
        <button className="btn small" onClick={() => xp(true)}>XP crítico</button>
        <button className="btn small" onClick={() => emit({ type: 'levelup', level: s.level + 1 })}>Level up</button>
        <button className="btn small" onClick={boss}>Chefe derrotado</button>
        <button className="btn small" onClick={() => emit({ type: 'achievement', id: ach.id })}>Conquista</button>
        <button className="btn small" onClick={() => emit({ type: 'goal', cents: 400000, currency: 'USD' })}>Meta batida</button>
        <button className="btn small" onClick={() => emit({ type: 'redeemed', name: 'Teste' })}>Redenção</button>
        <button className="btn small" onClick={() => emit({ type: 'rested', anchor: 'debug', amount: 60 })}>Descanso</button>
      </div>
      <p className="q-meta pad">Sons</p>
      {SOUND_SLOTS.map(slot => (
        <div key={slot.id} className="sound-row">
          <span>{slot.label}</span>
          <button className="icon-btn" onClick={() => play(slot.id)} aria-label={`Tocar ${slot.label}`}><Icon id="music" size={16} /></button>
        </div>
      ))}
    </>
  );
}
