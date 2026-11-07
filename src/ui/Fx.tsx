import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACHIEVEMENTS } from '../game/data';
import { useGame } from '../game/store';
import { BOSS_RESTED, fmt } from '../game/rules';
import { onFx, type FxEvent } from '../fx/bus';
import { play, playThen } from '../fx/sound';
import { buzz } from '../fx/haptics';
import { Icon } from './Icon';
import { QIcon } from './parts';

/** Mostra o texto flutuando sobre a linha da missão. Devolve false se a linha não está na tela. */
function floatAt(anchor: string, text: string, cls: string) {
  const el = document.querySelector(`[data-anchor="${anchor}"]`);
  if (!el) return false;
  const f = document.createElement('span');
  f.className = `float ${cls}`;
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 1600);
  return true;
}

/** Brilhinhos dourados espalhados pela linha da missão concluída. */
function sparkleAt(anchor: string, crit: boolean) {
  const el = document.querySelector(`[data-anchor="${anchor}"]`);
  if (!el) return;
  const box = document.createElement('span');
  box.className = `sparkles${crit ? ' crit' : ''}`;
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < (crit ? 16 : 11); i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', `${4 + Math.random() * 92}%`);
    p.style.setProperty('--y', `${10 + Math.random() * 80}%`);
    p.style.setProperty('--d', `${Math.random() * 0.35}s`);
    p.style.setProperty('--s', `${0.6 + Math.random() * 0.8}`);
    box.appendChild(p);
  }
  el.appendChild(box);
  setTimeout(() => box.remove(), 1400);
}

type Big ={ kind: 'level'; level: number } | { kind: 'boss'; name: string };
type Toast = { id: number; kind: 'ach'; achId: string } | { id: number; kind: 'msg'; text: string; tone: string };

let tid = 0;

// a derrota do chefe aparece uma vez em cada aparelho, mesmo se ele caiu no outro e chegou pela sincronização
const BOSS_SEEN = 'boss-seen';
function bossSeen(week: string) {
  try {
    if (localStorage.getItem(BOSS_SEEN) === week) return true;
    localStorage.setItem(BOSS_SEEN, week);
  } catch { /* sem armazenamento: mostra mesmo assim */ }
  return false;
}

/** Camada de animações: XP flutuante, level up, conquistas, chefe derrotado e desfazer. */
export function FxLayer() {
  const [big, setBig] = useState<Big[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [undoKey, setUndoKey] = useState(0);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const undo = useGame(s => s.undo);
  const canUndo = useGame(s => s.canUndo);

  useEffect(() => onFx((e: FxEvent) => {
    const toast = (t: Toast, ms = 4200) => {
      setToasts(v => [...v, t]);
      setTimeout(() => setToasts(v => v.filter(x => x.id !== t.id)), ms);
    };
    switch (e.type) {
      case 'xp':
        // sem linha na tela (ex.: treino terminado), o XP aparece num aviso
        if (!floatAt(e.anchor, `+${fmt(e.amount)} XP${e.crit ? ' CRÍTICO!' : ''}`, e.crit ? 'crit' : '')) {
          toast({ id: ++tid, kind: 'msg', text: `+${fmt(e.amount)} XP${e.crit ? ' CRÍTICO!' : ''} · ${e.name}`, tone: e.crit ? 'gold' : 'green' }, 3500);
        }
        if (e.rested) setTimeout(() => floatAt(e.anchor, `(${fmt(e.rested)} descansado)`, 'blue small'), 180);
        // objetivo (sub-missão) mantém o som curto; missão inteira ganha o som novo e brilho
        if (e.kind !== 'objective') sparkleAt(e.anchor, e.crit);
        void play(e.crit ? 'crit' : e.kind === 'objective' ? 'objective' : 'quest');
        buzz(e.crit ? 'medium' : 'light');
        if (e.elite) {
          // entrega de projeto da Mesa chega como "Nome: Entregue"
          const delivered = e.name.endsWith(': Entregue');
          toast({ id: ++tid, kind: 'msg', text: delivered ? `Missão principal entregue: ${e.name.slice(0, -': Entregue'.length)}` : `Missão Elite concluída: ${e.name}`, tone: 'gold' });
        }
        if (e.kind !== 'project') setUndoLabel(null); // a etapa da Mesa já mandou o nome dela
        setUndoKey(k => k + 1);
        break;
      case 'progress':
        floatAt(e.anchor, e.text, 'small');
        void play('objective');
        buzz('light');
        setUndoLabel(null);
        setUndoKey(k => k + 1);
        break;
      case 'undoable':
        setUndoLabel(e.label);
        setUndoKey(k => k + 1);
        break;
      case 'rested':
        floatAt(e.anchor, e.amount > 0 ? `+${e.amount} descanso` : 'Descanso no limite de hoje', 'blue');
        void play('rested');
        buzz('light');
        setUndoKey(k => k + 1);
        break;
      case 'levelup':
        setBig(v => [...v, { kind: 'level', level: e.level }]);
        break;
      case 'boss':
        if (!bossSeen(useGame.getState().boss.week)) setBig(v => [...v, { kind: 'boss', name: e.name }]);
        break;
      case 'achievement':
        toast({ id: ++tid, kind: 'ach', achId: e.id }, 5000);
        setTimeout(() => void play('achievement'), 400);
        break;
      case 'goal':
        toast({ id: ++tid, kind: 'msg', text: `Meta ${e.currency === 'USD' ? 'mensal' : 'de faturamento'} batida! ${(e.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: e.currency ?? 'BRL' })} no mês.`, tone: 'gold' }, 5000);
        void play('achievement');
        buzz('heavy');
        break;
      case 'redeemed':
        toast({ id: ++tid, kind: 'msg', text: `Redenção! A Maldição de "${e.name}" foi removida.`, tone: 'green' });
        break;
    }
  }), []);

  const boss = useGame(s => s.boss);
  useEffect(() => {
    if (boss.killed && !bossSeen(boss.week)) setBig(v => [...v, { kind: 'boss', name: boss.name }]);
  }, [boss.killed, boss.week, boss.name]);

  // Um efeito grande por vez
  const current = big[0];
  useEffect(() => {
    if (!current) return;
    if (current.kind === 'level') void play('levelup'); else void playThen('bossHit', 'boss');
    buzz('heavy');
    const t = setTimeout(() => setBig(v => v.slice(1)), current.kind === 'level' ? 2900 : 3400);
    return () => clearTimeout(t);
  }, [current]);

  const [showUndo, setShowUndo] = useState(false);
  useEffect(() => {
    if (!undoKey) return;
    setShowUndo(true);
    const t = setTimeout(() => setShowUndo(false), 5800);
    return () => clearTimeout(t);
  }, [undoKey]);

  const root = document.getElementById('screen') ?? document.body;
  return createPortal(
    <>
      {current?.kind === 'level' && (
        <div className="levelup" key={`l${current.level}`}>
          <div className="lv-flash" />
          <div className="beam" />
          <div className="ring" />
          <div className="lv-text">
            <small>Parabéns!</small>
            <b>NÍVEL {current.level}</b>
            <span>Você alcançou o nível {current.level}</span>
          </div>
        </div>
      )}
      {current?.kind === 'boss' && (
        <div className="bosskill" key={`b${current.name}`}>
          <Icon id="skull" size={72} />
          <b>CHEFE DERROTADO</b>
          <span>{current.name}</span>
          <small>Saque: 500 de ouro · +{BOSS_RESTED} de descanso</small>
        </div>
      )}
      <div className="toasts">
        {toasts.map(t => {
          if (t.kind === 'ach') {
            const a = ACHIEVEMENTS.find(x => x.id === t.achId);
            if (!a) return null;
            return (
              <div key={t.id} className="ach-toast">
                <QIcon icon={a.icon} quality={a.quality} size={40} />
                <span><small>Conquista obtida</small><b>{a.name}</b></span>
                <span className="ach-shield">{a.points}</span>
              </div>
            );
          }
          return <div key={t.id} className={`msg-toast ${t.tone}`}>{t.text}</div>;
        })}
      </div>
      {showUndo && canUndo() && (
        <button className="undo-bar" onClick={() => { undo(); setShowUndo(false); }}>
          <Icon id="undo" size={16} /> Desfazer{undoLabel && <small className="undo-what">{undoLabel}</small>}
        </button>
      )}
    </>,
    root,
  );
}
