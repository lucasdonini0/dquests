import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { play, stopCast } from '../fx/sound';
import { buzz } from '../fx/haptics';
import { Icon } from './Icon';
import { useBack } from './parts';

const CAST_MS = 3500;

/** Botão + animação de conjuração da Pedra de Regresso (dia de imprevisto). */
export function Hearthstone({ readyIn, protectedToday, onUse }: { readyIn: number; protectedToday: boolean; onUse: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'cast' | 'arrive'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    stopCast();
    setPhase('idle');
  }, []);
  useBack(phase === 'cast' ? cancel : null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    if (readyIn > 0 || phase !== 'idle') return;
    setPhase('cast');
    void play('hearthCast');
    buzz('light');
    timer.current = setTimeout(() => {
      onUse();
      setPhase('arrive');
      void play('hearthDone');
      buzz('heavy');
      timer.current = setTimeout(() => setPhase('idle'), 2600);
    }, CAST_MS);
  };

  return (
    <>
      <button className="hearth" disabled={readyIn > 0} onClick={start}>
        <span className="hearth-stone"><Icon id="hearth" size={26} /></span>
        <span>
          {protectedToday
            ? <><b>Hoje é dia de imprevisto.</b> As diárias e os hábitos de hoje não geram debuff.</>
            : readyIn > 0
              ? <>Pedra de Regresso em recarga. Disponível de novo em {readyIn} {readyIn === 1 ? 'dia' : 'dias'}.</>
              : <><b>Usar Pedra de Regresso.</b> Declara hoje como dia de imprevisto: remove a Exaustão e protege diárias e streaks de hoje.</>}
        </span>
      </button>

      {phase !== 'idle' && createPortal(
        <div className={`hs-overlay ${phase}`} onClick={phase === 'cast' ? cancel : undefined}>
          <div className="hs-vortex">
            {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
            <span className="hs-core"><Icon id="hearth" size={64} /></span>
          </div>
          {phase === 'cast' ? (
            <div className="castbar-wrap">
              <div className="castbar"><i style={{ animationDuration: `${CAST_MS}ms` }} /><span>Pedra de Regresso</span></div>
              <small>Toque para cancelar</small>
            </div>
          ) : (
            <div className="hs-arrive">
              <b>Você voltou para casa</b>
              <span>Hoje é dia de imprevisto. Descanse, amanhã a jornada continua.</span>
            </div>
          )}
          {phase === 'arrive' && <div className="hs-flash" />}
        </div>,
        document.getElementById('screen') ?? document.body,
      )}
    </>
  );
}
