import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { App as CapApp } from '@capacitor/app';
import { PORTRAITS, type IconId, type Quality } from '../game/data';
import type { Portrait as PortraitT } from '../game/store';
import { Icon } from './Icon';

export function PortraitView({ p, size = 62 }: { p: PortraitT; size?: number }) {
  if (p.kind === 'photo') {
    return <img className="portrait-img" src={p.data} width={size} height={size} alt="" />;
  }
  const def = PORTRAITS.find(x => x.id === p.id) ?? PORTRAITS[0];
  return (
    <span className="portrait-img" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 35%, ${def.from}, ${def.to})`, color: def.color }}>
      <Icon id={def.icon} size={size * 0.58} />
    </span>
  );
}

export function QIcon({ icon, quality, size = 34 }: { icon: IconId; quality: Quality | string; size?: number }) {
  return (
    <span className={`qicon c-${quality}`} style={{ width: size, height: size }}>
      <Icon id={icon} size={size * 0.6} />
    </span>
  );
}

// O botão "voltar" do Android fecha o modal que estiver aberto por cima.
const backStack: (() => void)[] = [];
let backBound = false;
function bindBack() {
  if (backBound) return;
  backBound = true;
  void CapApp.addListener('backButton', () => {
    const top = backStack[backStack.length - 1];
    if (top) top();
    else void CapApp.minimizeApp();
  }).catch(() => {});
}

export function useBack(onBack: (() => void) | null) {
  useEffect(() => {
    if (!onBack) return;
    bindBack();
    backStack.push(onBack);
    return () => {
      const i = backStack.lastIndexOf(onBack);
      if (i >= 0) backStack.splice(i, 1);
    };
  }, [onBack]);
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useBack(onClose);
  // Sempre por cima da tela inteira, mesmo quando aberta de dentro de uma aba
  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-h">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon id="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-f">{footer}</div>}
      </div>
    </div>,
    document.getElementById('screen') ?? document.body,
  );
}

/** Marca de masmorra (missões de Trabalho e Social): portal azul; verde quando o social é em público. */
export function DungeonMark({ green }: { green?: boolean }) {
  return (
    <span className={`dungeon${green ? ' green' : ''}`} title={green ? 'Masmorra em público: +XP' : 'Masmorra'} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <circle cx="12" cy="12" r="10.5" className="dg-ring" />
        <circle cx="12" cy="12" r="8.5" className="dg-core" />
        <path d="M12 6.2a5.8 5.8 0 1 1-5.6 7.3M12 9a3 3 0 1 0 2.9 3.8" className="dg-swirl" />
      </svg>
    </span>
  );
}

export function PanelHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="panel-h">{children}{right !== undefined && <span>{right}</span>}</div>;
}

export function Empty({ icon, title, text, action }: { icon: IconId; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon id={icon} size={40} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
